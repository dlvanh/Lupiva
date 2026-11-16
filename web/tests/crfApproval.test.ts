import { describe, expect, it } from "vitest";
import { approvalPayload, fieldChoices, initialSelections, type CrfView } from "@/lib/crfApproval";

const view: CrfView = {
  source_snapshot: "snap",
  draft_sha256: "draft",
  review: null,
  fields: [
    {
      slot: "HEM01/result",
      label: "Hb",
      section: "Huyết học",
      component: "result",
      choices: [],
      options: [{ id: "s1", value: "120" }, { id: "s2", value: "118" }],
    },
    {
      slot: "HEM12/result",
      label: "Giảm tế bào",
      section: "Huyết học",
      component: "result",
      choices: [{ code: "yes", label: "Có" }, { code: "no", label: "Không" }],
      options: [],
      manual_options: [{ id: "m-yes", value: "yes" }, { id: "m-no", value: "no" }],
      proposal: { id: "p1", value: "no", origin: "knowledge_rule" },
    },
  ],
};

describe("CRF approval", () => {
  it("lists source values, then the proposal, then manual choices", () => {
    expect(fieldChoices(view.fields[1]).map((c) => [c.id, c.kind])).toEqual([
      ["p1", "proposal"],
      ["m-yes", "manual"],
      ["m-no", "manual"],
    ]);
  });

  it("selects nothing on a draft that was never reviewed", () => {
    expect(initialSelections(view)).toEqual({});
  });

  it("keeps earlier approvals only while the draft still offers them", () => {
    const reviewed: CrfView = {
      ...view,
      review: {
        reviewed_at: "2026-11-16T10:00:00Z",
        values: {
          "HEM01/result": { id: "s2", value: "118", origin: "source" },
          "HEM12/result": { id: "gone", value: "yes", origin: "llm_suggestion" },
        },
      },
    };
    expect(initialSelections(reviewed)).toEqual({ "HEM01/result": "s2" });
  });

  it("sends only explicit, valid choices with the draft fingerprints", () => {
    expect(approvalPayload("case-1", view, { "HEM01/result": "s1", "HEM12/result": "" })).toEqual({
      case_id: "case-1",
      source_snapshot: "snap",
      draft_sha256: "draft",
      selections: { "HEM01/result": "s1" },
    });
    expect(() => approvalPayload("case-1", view, {})).toThrow();
    expect(() => approvalPayload("case-1", view, { "HEM01/result": "p1" })).toThrow();
    expect(() => approvalPayload("case-1", view, { "XXX/result": "s1" })).toThrow();
  });
});
