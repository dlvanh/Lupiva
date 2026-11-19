import { describe, expect, it } from "vitest";
import { scoreSuggestions } from "@/lib/scoreSuggestions";

const field = (slot: string, options: string[] = [], proposal?: { value: string; origin?: string; reason?: string }) =>
  ({ slot, options: options.map((value) => ({ value })), proposal });

describe("scoreSuggestions", () => {
  const score_form = { eular: [{ field_id: "EAC02" }, { field_id: "EAC07" }, { field_id: "EAC21" }, { field_id: "EAC22" }],
    sledai: [{ field_id: "SDA23" }, { field_id: "SDA24" }] };

  it("prefers the criterion proposal, then lab/clinical inference, and skips saved criteria and totals", () => {
    const result = scoreSuggestions({
      score_form,
      fields: [
        field("EAC21/result", [], { value: "yes", origin: "knowledge_rule", reason: "Anti-Sm dương tính" }),
        field("SDA23/result", [], { value: "unknown", origin: "no_evidence" }),
        field("HEM05/result", ["9.19 G/l"]),
        field("HEM11/result", ["80 G/L"]),
        field("NEU02/result", [], { value: "yes", origin: "llm" }),
        field("IMM01/result", ["Homogeneous 3+"]),
      ],
      review: { values: { "SDA24/result": { value: "no" } } },
    });
    expect(result.criteria).toEqual({
      EAC02: { answer: "no", kind: "lab", evidence: "HEM05 = 9.19 G/l", slots: ["HEM05/result"] },
      EAC07: { answer: "yes", kind: "clinical", evidence: "NEU02 = yes", slots: ["NEU02/result"] },
      EAC21: { answer: "yes", kind: "proposal", evidence: "Anti-Sm dương tính", slots: [] },
      SDA23: { answer: "yes", kind: "lab", evidence: "HEM11 = 80 G/L", slots: ["HEM11/result"] },
    });
    expect(result.ana).toMatchObject({ answer: "yes", slots: ["IMM01/result"] });
  });

  it("does not suggest ANA once the doctor confirmed it", () => {
    const result = scoreSuggestions({ score_form, fields: [field("IMM01/result", ["Negative"])],
      review: { scores: { assessment: { ana: "yes" } } } });
    expect(result.ana).toBeUndefined();
  });
});
