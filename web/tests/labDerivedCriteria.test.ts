import { describe, expect, it } from "vitest";
import { deriveAna, deriveCriteria, polarity, type LabField } from "@/lib/labDerivedCriteria";

const lab = (slot: string, options: string[] = [], proposal?: string, origin = "llm"): LabField => ({
  slot,
  options: options.map((value) => ({ value })),
  proposal: proposal === undefined ? undefined : { value: proposal, origin },
});

describe("deriveCriteria", () => {
  it("reads normal synthetic values as 'not met' and leaves ambiguous urine dipstick unanswered", () => {
    const derived = deriveCriteria([
      lab("HEM05/result", ["9.19 G/l"]),
      lab("HEM11/result", ["299 G/L"]),
      lab("REN01/result", ["0.10 mg/mg"]),
      lab("REN02/result", ["Negative"]),
      lab("REN03/result", ["(+)"]),
      lab("ANA01/result", ["0 Negative"]),
      lab("ANA08/result", ["0 Negative"]),
    ]);
    expect(Object.fromEntries(Object.entries(derived).map(([id, d]) => [id, d.answer]))).toEqual({
      EAC02: "no", SDA24: "no", EAC03: "no", SDA23: "no", EAC15: "no", SDA13: "no", SDA12: "no",
      EAC21: "no", SDA21: "no",
    });
    expect(derived.EAC02.evidence).toBe("HEM05 = 9.19 G/l");
  });

  it("uses an unapproved LLM proposal over the image value, and the approved value over both", () => {
    const fields = [lab("HEM05/result", ["9.1"], "3.2"), lab("HEM11/result", ["250"], "80")];
    const derived = deriveCriteria(fields, { "HEM11/result": { value: "150" } });
    expect(derived.EAC02).toEqual({ answer: "yes", evidence: "HEM05 = 3.2" });
    expect(derived.SDA24.answer).toBe("no");
    expect(derived.EAC03.answer).toBe("no");
  });

  it("ignores no_evidence proposals and unknown values", () => {
    expect(deriveCriteria([lab("HEM05/result", [], "unknown"), lab("HEM11/result", [], "2", "no_evidence")])).toEqual({});
  });

  it("derives complement, proteinuria, anti-dsDNA and fever with unit conversion", () => {
    const derived = deriveCriteria([
      lab("IMM11/result", [], "0.62 g/L"),
      lab("IMM12/result", [], "18 mg/dL"),
      lab("REN08/result", [], "1200 mg/24h"),
      lab("IMM04/result", [], "Dương tính"),
      lab("HIS12/result", [], "38.5 °C"),
      lab("HEM05/result#2", [], "3500"),
    ]);
    expect(derived.EAC19.answer).toBe("yes");
    expect(derived.SDA20.answer).toBe("yes");
    expect(derived.EAC20.answer).toBe("no");
    expect(derived.EAC15.answer).toBe("yes");
    expect(derived.SDA21.answer).toBe("yes");
    expect(derived.EAC21.answer).toBe("yes");
    expect(derived.EAC01.answer).toBe("yes");
    expect(derived.EAC02.answer).toBe("yes");
    expect(derived.SDA24.answer).toBe("no");
  });
});

describe("clinical criteria", () => {
  it("maps Có/Không clinical fields to EULAR and SLEDAI criteria, skipping unknown and no_evidence", () => {
    const derived = deriveCriteria([
      lab("NEU02/result", [], "yes"),
      lab("SKN02/result", [], "Có"),
      lab("SKN06/result", [], "unknown"),
      lab("SKN08/result", [], "yes", "no_evidence"),
      lab("MUS02/result", [], "no"),
      lab("JNT02/result", [], "3"),
      lab("LUNG04/result", [], "no"),
      lab("CV06/result", [], "yes"),
      lab("HIS11/result", [], "no"),
    ]);
    expect(derived.EAC07.answer).toBe("yes");
    expect(derived.SDA01.answer).toBe("yes");
    expect(derived.EAC11.answer).toBe("yes");
    expect(derived.SDA15.answer).toBe("yes");
    expect(derived.SDA10.answer).toBe("no");
    expect(derived.EAC14.answer).toBe("yes");
    expect(derived.SDA09.evidence).toBe("JNT02 = 3");
    expect(derived.EAC12.answer).toBe("yes");
    expect(derived.SDA18.answer).toBe("no");
    expect(derived.EAC01.answer).toBe("no");
    expect(derived.EAC08).toBeUndefined();
    expect(derived.EAC09).toBeUndefined();
  });

  it("does not take joint damage 'yes' alone as arthritis of two or more joints", () => {
    expect(deriveCriteria([lab("JNT01/result", [], "yes")]).EAC14).toBeUndefined();
    expect(deriveCriteria([lab("JNT01/result", [], "no")]).EAC14?.answer).toBe("no");
  });
});

describe("deriveAna and polarity", () => {
  it("treats a pattern with intensity as positive, titre wins when present", () => {
    expect(deriveAna([lab("IMM01/result", ["Homogeneous 3+"])])?.answer).toBe("yes");
    expect(deriveAna([lab("IMM01/result", ["Homogeneous 3+"]), lab("IMM01/titre", ["1:40"])])?.answer).toBe("no");
    expect(deriveAna([lab("IMM01/result", ["bằng kỹ thuật huỳnh quang"])])).toBeUndefined();
    expect(polarity("0 Negative")).toBe("no");
    expect(polarity("(+)")).toBe("yes");
  });
});
