import { describe, expect, it } from "vitest";
import { buildBlankCrfRecord } from "@/data/crfData";
import type { CrfView } from "@/lib/crfApproval";
import { linkedCases } from "@/lib/crfEvidence";
import { mergeWebCaseIdentities, preserveWebCaseApprovals, webCaseLabel } from "@/lib/webCaseIdentities";
import type { SubmissionItemDTO } from "@/lib/submissionsService";
import { getOcrTierCounts } from "@/lib/submissionFilters";

function submission(id: string, pipelineIntakeId?: string, patientName = "Chưa nhập tên"): SubmissionItemDTO {
  const record = buildBlankCrfRecord({ id, studyId: `VN-${id}`, patientName });
  return { dbSubmissionId: id, pipelineIntakeId, record, submittedAtIso: "", ocrSummary: getOcrTierCounts(record) };
}

describe("web case identities", () => {
  const caseByIntake = new Map([["intake-a", "case-a"], ["intake-b", "case-b"], ["intake-a2", "case-a"]]);
  const first = submission("0001", "intake-a");
  const second = submission("0002", "intake-b");
  const duplicate = submission("0003", "intake-a2");

  it("shows current web cases and keeps just the backend-only case that was opened", () => {
    const identities = mergeWebCaseIdentities(caseByIntake, [first, second, submission("lost", "unknown"), submission("missing")], null);
    const cases = ["case-a", "case-b", "old", "other-old"].map((case_id) => ({ case_id }));
    expect([...identities]).toEqual([["case-a", first], ["case-b", second]]);
    expect(linkedCases(cases, new Set(identities.keys()), "").map(({ case_id }) => case_id)).toEqual(["case-a", "case-b"]);
    expect(linkedCases(cases, new Set(identities.keys()), "old").map(({ case_id }) => case_id)).toEqual(["case-a", "case-b", "old"]);
  });

  it("keeps the explicitly opened intake when more pages match the same case", () => {
    const pageOne = mergeWebCaseIdentities(caseByIntake, [first], "intake-a");
    expect(mergeWebCaseIdentities(caseByIntake, [duplicate, second], "intake-a", pageOne).get("case-a")).toBe(first);
    expect(mergeWebCaseIdentities(caseByIntake, [duplicate], null, pageOne).get("case-a")).toBe(duplicate);
    expect(pageOne.get("case-a")).toBe(first);
  });

  it("keeps a newer approval only when a refreshed page resolves to the same submission", () => {
    const approved = { ...first, record: { ...first.record, submissionStatus: "approved" as const } };
    const current = new Map([["case-a", approved]]);
    expect(preserveWebCaseApprovals(current, new Map([["case-a", first]])).get("case-a")).toBe(approved);
    expect(preserveWebCaseApprovals(current, new Map([["case-a", duplicate]])).get("case-a")).toBe(duplicate);
    expect(preserveWebCaseApprovals(current, new Map()).has("case-a")).toBe(false);
  });
});

describe("CRF patient labels", () => {
  const unnamed = submission("0001", "intake-a").record;
  const view: CrfView = {
    source_snapshot: "snapshot",
    draft_sha256: "draft",
    review: null,
    fields: [
      { slot: "ADM02/result", label: "Age", section: "Administrative", component: "result", choices: [], options: [{ id: "age", value: "64" }] },
      { slot: "ADM03/result", label: "Gender", section: "Administrative", component: "result", choices: [], options: [{ id: "gender", value: "Female" }] },
    ],
  };

  it("uses the web study ID and patient name when available", () => {
    expect(webCaseLabel({ ...unnamed, patientName: " Nguyễn An " }, view, "vi")).toBe("VN-0001 · Nguyễn An");
  });

  it("uses localized demographics for an unnamed patient", () => {
    expect(webCaseLabel(unnamed, view, "vi")).toBe("VN-0001 · Nữ, 64 tuổi");
    expect(webCaseLabel(unnamed, view, "en")).toBe("VN-0001 · Female, 64 years");
    expect(webCaseLabel({ ...unnamed, gender: "Female", age: "64" }, null, "vi")).toBe("VN-0001 · Nữ, 64 tuổi");
    expect(webCaseLabel(unnamed, null, "vi")).toBe("VN-0001 · chưa nhập tên");
  });
});
