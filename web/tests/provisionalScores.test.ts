import { describe, expect, it } from "vitest";
import { computeProvisionalScores, type ProvisionalScoreView, type ScoreForm } from "@/lib/provisionalScores";

type ScoreField = ProvisionalScoreView["fields"][number];

function field(id: string, proposal?: string, options: string[] = [], origin = "llm"): ScoreField {
  return {
    slot: `${id}/result`,
    proposal: proposal === undefined ? undefined : { value: proposal, origin },
    options: options.map((value) => ({ value })),
  };
}

function rows(weights: Record<string, number>) {
  return Object.entries(weights).map(([field_id, weight]) => ({ field_id, weight, label: field_id }));
}

const eularAtThreshold: ScoreForm = { eular: rows({ EAC13: 6, EAC20: 4 }) };
const clinicalAndImmunologic = [field("EAC13", "yes"), field("EAC20", "yes")];

describe("computeProvisionalScores", () => {
  it("uses the approved assessment, then field approval, then proposal, then one source option", () => {
    const view: ProvisionalScoreView = {
      score_form: { sledai: rows({ SDA01: 8, SDA09: 4, SDA15: 2, SDA22: 1, SDA23: 1, SDA25: 99 }) },
      fields: [
        field("SDA01", "yes"),
        field("SDA09", "no", ["no"]),
        field("SDA15", "yes", ["no"], "knowledge_rule"),
        field("SDA22", undefined, ["Có"]),
        field("SDA23", "no", ["yes"], "calculated"),
        field("SDA25", "yes"),
      ],
      review: {
        scores: { assessment: { criteria: { SDA01: "no" } } },
        values: { "SDA01/result": { value: "yes" }, "SDA09/result": { value: "yes" } },
      },
    };
    const original = structuredClone(view);

    expect(computeProvisionalScores(view).sledai).toEqual({
      total: 7, yesCount: 3, proposalCount: 2, unansweredCount: 0,
    });
    expect(view).toEqual(original);
  });

  it("skips unknown and no-evidence answers and falls through to trustworthy data when available", () => {
    const result = computeProvisionalScores({
      score_form: { sledai: rows({ SDA01: 8, SDA02: 8, SDA03: 8, SDA04: 8, SDA05: 8, SDA06: 8, SDA07: 8 }) },
      fields: [
        field("SDA01", "no", [], "no_evidence"),
        field("SDA02", "Chưa rõ", ["unknown"]),
        field("SDA03", "unknown", ["yes", "no"]),
        field("SDA04", "no", ["yes"], "no_evidence"),
        field("SDA05", "yes"),
        field("SDA06", "no"),
      ],
      review: {
        scores: { assessment: { criteria: { SDA05: "unknown", SDA06: "Chưa rõ" } } },
        values: { "SDA05/result": { value: "Chưa rõ" }, "SDA06/result": { value: "Không" } },
      },
    });

    expect(result.sledai).toEqual({ total: 16, yesCount: 2, proposalCount: 1, unansweredCount: 4 });
  });

  it("uses one maximum per EULAR domain even when score form rows are reordered", () => {
    const score_form = {
      eular: rows({
        EAC21: 6, EAC20: 4, EAC19: 3, EAC18: 2, EAC17: 10, EAC16: 8, EAC15: 4,
        EAC14: 6, EAC13: 6, EAC12: 5, EAC11: 6, EAC10: 4, EAC09: 2, EAC08: 2,
        EAC07: 5, EAC06: 3, EAC05: 2, EAC04: 4, EAC03: 4, EAC02: 3, EAC01: 2, EAC22: 99,
      }),
    };
    const fields = score_form.eular.map(({ field_id }) => field(field_id, "yes"));

    expect(computeProvisionalScores({
      score_form, fields, review: { scores: { assessment: { ana: "yes" } } },
    }).eular).toEqual({ total: 51, classification: "meets", proposalCount: 21 });
  });

  it.each([
    { name: "approved no overrides a positive proposal", ana: "no", anaFields: [field("IMM01", "positive")], classification: "ana_not_met" },
    { name: "approved yes overrides a negative result", ana: "yes", anaFields: [field("IMM01", "negative")], classification: "meets" },
    { name: "uses a positive proposal first", ana: "", anaFields: [field("IMM01", "Dương tính", ["negative"])], classification: "meets" },
    { name: "uses an explicit negative source option", ana: "", anaFields: [field("IMM01", undefined, ["Âm tính"])], classification: "ana_not_met" },
    { name: "ignores unsupported negatives", ana: "", anaFields: [field("IMM01", "negative", [], "no_evidence")], classification: "undetermined" },
    { name: "leaves a titre without explicit polarity unanswered", ana: "", anaFields: [field("IMM01", undefined, ["1:40"])], classification: "undetermined" },
    { name: "leaves multiple source options unanswered", ana: "", anaFields: [field("IMM01", undefined, ["positive", "negative"])], classification: "undetermined" },
    { name: "recognizes a single source on a repeated ANA result", ana: "", anaFields: [{ ...field("IMM01", undefined, ["positive"]), slot: "IMM01/result#2" }], classification: "meets" },
    { name: "ignores other ANA components", ana: "", anaFields: [{ ...field("IMM01", "positive"), slot: "IMM01/intensity" }], classification: "undetermined" },
    { name: "leaves missing ANA unanswered", ana: "", anaFields: [], classification: "undetermined" },
  ])("$name", ({ ana, anaFields, classification }) => {
    expect(computeProvisionalScores({
      score_form: eularAtThreshold,
      fields: [...clinicalAndImmunologic, ...anaFields],
      review: { scores: { assessment: { ana } } },
    }).eular).toEqual({ total: 10, classification, proposalCount: 2 });
  });

  it.each([
    { weights: rows({ EAC01: 2, EAC21: 6 }), total: 8 },
    { weights: rows({ EAC20: 4, EAC21: 6 }), total: 10 },
  ])("requires both 10 points and a clinical criterion", ({ weights, total }) => {
    const result = computeProvisionalScores({
      score_form: { eular: weights },
      fields: weights.map(({ field_id }) => field(field_id, "yes")),
      review: { scores: { assessment: { ana: "yes" } } },
    });

    expect(result.eular).toEqual({ total, classification: "undetermined", proposalCount: 2 });
  });
});
