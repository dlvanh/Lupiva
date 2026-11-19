import { describe, expect, it } from "vitest";
import { approvedCriteria, cellKey, fillTemplateLine, placeFields, shownNote, shownValue, type LayoutBlock } from "@/lib/crfForm";
import type { CrfField } from "@/lib/crfApproval";
import { parseSlot } from "@/lib/crfSlot";

const YNU = [
  { code: "yes", label: "Có" },
  { code: "no", label: "Không" },
  { code: "unknown", label: "Chưa rõ" },
];
const field = (over: Partial<CrfField> & { template_block?: number }): CrfField =>
  ({ slot: "X01/result", label: "X", section: "S", component: "result", choices: [], options: [], ...over }) as CrfField;

describe("measurement instances", () => {
  const first = field({ slot: "HEM05/result", label: "WBC -1", instance: 1, instances: 2,
    template_block: 1, options: [{ id: "a", value: "9.54 G/L" }] });
  const second = field({ ...first, slot: "HEM05/result#2", label: "WBC -2", instance: 2,
    options: [{ id: "b", value: "8.70 G/L" }] });

  it("parses legacy and repeated component slots", () => {
    expect(parseSlot("HEM05/result")).toEqual({ fieldId: "HEM05", component: "result", instance: 1, baseSlot: "HEM05/result" });
    expect(parseSlot("HEM07/absolute_count#2")).toEqual({ fieldId: "HEM07", component: "absolute_count", instance: 2, baseSlot: "HEM07/absolute_count" });
    for (const slot of ["HEM05", "HEM05/result#0", "HEM05/result#x"]) expect(() => parseSlot(slot)).toThrow();
  });

  it("places #2 directly after #1 in a bound cell, even with reversed input", () => {
    const layout = [{ index: 1, rows: [[{ text: "WBC" }, { text: "", field_id: "HEM05" }]] }];
    const placed = placeFields(layout, [second, first], undefined, false);
    expect(placed.inCell.get(cellKey(1, 0, 1))?.map((f) => f.slot)).toEqual([first.slot, second.slot]);
    expect(shownValue(second, { [second.slot]: { value: "8.71 G/L" } })?.text).toBe("8.71 G/L");
    expect(placed.after.size).toBe(0);
  });

  it("finds the original label cell and only fills the template line with #1", () => {
    const layout = [{ index: 1, rows: [[{ text: "WBC" }, { text: "(...)" }]] }];
    const placed = placeFields(layout, [first, second], undefined, false);
    expect(placed.inCell.get(cellKey(1, 0, 1))?.map((f) => f.slot)).toEqual([first.slot, second.slot]);
    expect(fillTemplateLine("WBC: ...", first, shownValue(first, undefined)!)).toBe("WBC: 9.54 G/L");
    expect(fillTemplateLine("WBC: ...", second, shownValue(second, undefined)!)).toBeNull();
  });

  it("retains #2 beside a template checkbox without replacing its first answer", () => {
    const yes = field({ ...first, slot: "CV06/result", label: "Effusion -1", choices: YNU,
      options: [{ id: "yes", value: "yes" }] });
    const no = field({ ...yes, slot: "CV06/result#2", label: "Effusion -2", instance: 2,
      options: [{ id: "no", value: "no" }] });
    const layout = [{ index: 1, rows: [[{ text: "☐ Yes ☐ No", checkbox_slot: yes.slot, checkbox_values: ["yes", "no"] }]] }];
    const placed = placeFields(layout, [yes, no], undefined, false);
    expect(placed.inCell.get(cellKey(1, 0, 0))?.map((f) => f.slot)).toEqual([no.slot]);
  });
});

describe("shownValue", () => {
  const question = field({
    slot: "SKN01/result",
    choices: YNU,
    proposal: { id: "p", value: "unknown", origin: "no_evidence" },
  });
  it("prints the proposal itself with a note", () => {
    const shown = shownValue(question, undefined)!;
    expect(shown.text).toBe("Chưa rõ");
    expect(shown.kind).toBe("proposal");
    expect(shownNote(shown)).toContain("chưa duyệt");
  });
  it("prefers the approved value, then the source value", () => {
    expect(shownValue(question, { "SKN01/result": { value: "no" } })).toMatchObject({ text: "Không", kind: "approved" });
    const lab = field({ options: [{ id: "a", value: "4.36 T/L" }, { id: "b", value: "4.38 T/L" }] });
    expect(shownValue(lab, undefined)).toMatchObject({ text: "4.36 T/L", kind: "source", more: 1 });
    expect(shownValue(field({}), undefined)).toBeNull();
  });
});

describe("placeFields", () => {
  const layout: LayoutBlock[] = [
    { index: 1, text: "CRF" },
    { index: 2, text: "☐  YES ☐  NO", checkbox_slot: "HIS01/result", checkbox_values: ["yes", "no"] },
    {
      index: 3,
      rows: [
        [{ text: "Antigen" }, { text: "Negative" }, { text: "Positive" }, { text: "Note" }],
        [{ text: "Ro-52" }, { text: "" }, { text: "" }, { text: "" }],
        [{ text: "Hb" }, { text: "", field_id: "HEM02" }],
      ],
    },
  ];
  const fields = [
    field({ slot: "HIS01/result", choices: YNU, proposal: { id: "h", value: "no", origin: "no_evidence" } }),
    field({ slot: "HEM02/result", options: [{ id: "hb", value: "135 g/L" }] }),
    field({ slot: "MYO14/result", label: "Ro-52", template_block: 2, options: [{ id: "r", value: "0 Negative" }] }),
    field({ slot: "ZZ01/result", label: "Elsewhere", section: "Khác", template_block: 2, options: [{ id: "z", value: "1" }] }),
  ];
  const placed = placeFields(layout, fields, undefined, false);

  it("puts bound fields in their cell and labelled fields in their template row", () => {
    expect(placed.inCell.get(cellKey(3, 2, 1))?.map((f) => f.slot)).toEqual(["HEM02/result"]);
    expect(placed.inCell.get(cellKey(3, 1, 3))?.map((f) => f.slot)).toEqual(["MYO14/result"]);
  });
  it("ticks the printed result column and does not repeat checkbox answers", () => {
    expect(placed.ticks.has(cellKey(3, 1, 1))).toBe(true);
    expect([...placed.inCell.values()].flat().some((f) => f.slot === "HIS01/result")).toBe(false);
  });
  it("lists fields without a template place after their block", () => {
    expect(placed.after.get(2)?.[0]).toMatchObject({ section: "Khác" });
  });
});

describe("approvedCriteria", () => {
  it("sends only approved yes/no criteria and never the totals", () => {
    const form = { eular: [{ field_id: "EAC01" }, { field_id: "EAC22" }], sledai: [{ field_id: "SDA23" }, { field_id: "SDA01" }] };
    const approved = {
      "EAC01/result": { value: "yes" },
      "EAC22/result": { value: "12" },
      "SDA23/result": { value: "no" },
      "SDA01/result": { value: "unknown" },
    };
    expect(approvedCriteria(form, approved)).toEqual({ EAC01: "yes", SDA23: "no" });
  });
});

describe("fillTemplateLine", () => {
  const gender = field({ slot: "ADM03/result", label: "Gender: Female / Male", choices: [{ code: "female", label: "Female" }, { code: "male", label: "Male" }] });
  const age = field({ slot: "ADM02/result", label: "Age" });
  const bmi = field({ slot: "ADM07/result", label: "BMI" });
  const shown = (text: string, value = text) => ({ text, value, kind: "source" as const });

  it("ticks the chosen option on its own line", () => {
    expect(fillTemplateLine("Gender\t\t☐  Female\t☐  Male", gender, shown("Female", "female"))).toBe("Gender\t\t☑  Female\t☐  Male");
  });
  it("writes a value over digit boxes or an empty label", () => {
    expect(fillTemplateLine("Age: ☐ ☐ ", age, shown("36"))).toBe("Age: 36 ");
    expect(fillTemplateLine("BMI:", bmi, shown("21.1"))).toBe("BMI: 21.1");
  });
  it("leaves other lines and unknown options alone", () => {
    expect(fillTemplateLine("Study ID: ☐ ☐", age, shown("36"))).toBeNull();
    expect(fillTemplateLine("Gender\t☐  Female\t☐  Male", gender, shown("Other"))).toBeNull();
  });
});

describe("score tables", () => {
  const layout: LayoutBlock[] = [
    { index: 85, text: "DIAGNOSIS" },
    {
      index: 87,
      rows: [
        [{ text: "Clinical Domains" }, { text: "Score" }, { text: "Check" }, { text: "Immunological Domains" }, { text: "Score" }, { text: "Check" }],
        [{ text: "Fever " }, { text: "2 " }, { text: "☐ " }, { text: "Anti-cardiolipin antibody OR Anti-β2GP1 " }, { text: "2 " }, { text: "☐ " }],
        [{ text: "Leukopenia " }, { text: "3 " }, { text: "☐ " }, { text: "Low C3 OR low C4 " }, { text: "3 " }, { text: "☐ " }],
        [{ text: "Thrombocytopenia " }, { text: "4 " }, { text: "☐ " }, { text: "Low C3 AND low C4 " }, { text: "4 " }, { text: "☐ " }],
      ],
    },
    { index: 95, rows: [[{ text: "Score" }, { text: "Criterion" }, { text: "Definition" }], [{ text: "8" }, { text: "Seizure" }, { text: "Recent onset." }]] },
  ];
  const criterion = (id: string, label: string) => field({ slot: `${id}/result`, label, template_block: 85 });
  const fields = [
    criterion("EAC01", "Fever"),
    criterion("EAC02", "Leukopenia"),
    criterion("EAC18", "Anti-cardiolipin OR Anti-beta2GP1"),
    criterion("EAC19", "Low C3 OR low C4"),
    criterion("EAC20", "Low C3 AND low C4"),
    criterion("SDA01", "Seizure"),
  ];
  const placed = placeFields(layout, fields, undefined, true, new Set(["EAC01", "EAC02", "EAC18", "EAC19", "EAC20", "SDA01"]));
  const at = (r: number, c: number) => placed.checks.get(cellKey(87, r, c))?.slot;

  it("puts each EULAR criterion in its own Check cell, both halves of the table", () => {
    expect(at(1, 2)).toBe("EAC01/result");
    expect(at(2, 2)).toBe("EAC02/result");
    expect(at(1, 5)).toBe("EAC18/result");
    expect(at(2, 5)).toBe("EAC19/result");
    expect(at(3, 5)).toBe("EAC20/result");
  });
  it("does not print SLEDAI criteria row by row or as a list", () => {
    expect([...placed.checks.values()].some((f) => f.slot === "SDA01/result")).toBe(false);
    expect([...placed.after.values()].flat().flatMap((g) => g.fields).some((f) => f.slot.startsWith("SDA"))).toBe(false);
  });
});
