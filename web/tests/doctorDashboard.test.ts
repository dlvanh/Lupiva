import { describe, expect, it } from "vitest";
import type { CrfField, CrfView } from "@/lib/crfApproval";
import { crfSectionGroup, sectionReviewTarget } from "@/lib/crfEvidence";
import {
  classifyPipelineError,
  dashboardPatient,
  dashboardReviewer,
  groupDashboardRows,
  sectionProgress,
} from "@/lib/doctorDashboard";
import { DEFAULT_DOCTOR_SUBMISSION_FILTERS } from "@/lib/submissionFilters";

const field = (slot: string, section: string, props: Partial<CrfField> = {}): CrfField => ({
  slot, section, label: slot, component: "result", choices: [], options: [], ...props,
});
const option = (value: string) => [{ id: "source", value }];
const receipt = (value: string) => ({ id: "saved", value, origin: "manual" });
const review = (values: NonNullable<CrfView["review"]>["values"] = {}) => ({
  reviewed_at: "2026-11-19T14:05:00", reviewer: { name: "Nguyễn An" }, values,
});
const view = (fields: CrfField[], saved: CrfView["review"] = null): CrfView => ({
  fields, review: saved, source_snapshot: "snapshot", draft_sha256: "draft",
});

describe("dashboard section progress", () => {
  it.each([
    ["ADM02/result", "Administrative information", "admin"],
    ["CBC01/result", "Haematology & Direct Coombs", "blood"],
    ["REN01/result", "Urinalysis", "renal"],
    ["BIO01/result", "Hóa sinh", "renal"],
    ["IMM01/result", "Serology", "immune"],
    ["IMG01/result", "Imaging", "clinical"],
    ["CLI01/result", "Thần kinh", "clinical"],
    ["EAC01/result", "Disease activity", "score"],
  ] as const)("maps %s in %s to %s", (slot, section, group) => {
    expect(crfSectionGroup(field(slot, section))).toBe(group);
  });

  it("counts populated approvals, proposals and repeat instances while ignoring blank and hidden cells", () => {
    const fields = [
      field("ADM02/result", "Administrative", { options: option("64 years") }),
      field("ADM03/result", "Administrative"),
      field("CBC01/result", "Haematology", { options: option("0") }),
      field("CBC01/result#2", "Haematology", { proposal: { id: "p", value: "3" } }),
      field("CBC02/result", "Haematology", { options: option(" "), manual_options: option("yes") }),
      field("IMM01/method", "Immunology", { options: option("technique") }),
      field("BIO01/result", "Biochemistry"),
    ];
    expect(sectionProgress(view(fields, review({ "ADM02/result": receipt("64"), "CBC01/result": receipt("0") })))).toEqual([
      { group: "admin", approved: 1, total: 1, tone: "complete" },
      { group: "blood", approved: 1, total: 2, tone: "unverified" },
      { group: "renal", approved: 0, total: 0, tone: "empty" },
      { group: "immune", approved: 0, total: 0, tone: "empty" },
      { group: "clinical", approved: 0, total: 0, tone: "empty" },
      { group: "score", approved: 0, total: 0, tone: "empty" },
    ]);
  });

  it("targets a populated row before an empty one and uses the registry score form when available", () => {
    const fields = [field("CBC01/result", "CBC"), field("CBC02/result", "CBC", { options: option("7") })];
    expect(sectionReviewTarget(fields, "blood", false)).toBe("slot-CBC02/result");
    expect(sectionReviewTarget(fields, "score", true)).toBe("crf-section-score");
    expect(sectionReviewTarget(fields.slice(0, 1), "blood", false)).toBe("slot-CBC01/result");
    expect(sectionReviewTarget(fields, "invalid", false)).toBeUndefined();
  });
});

describe("dashboard identity and reviewer", () => {
  const facts = view([
    field("ADM03/result", "Administrative", { options: option("Female"), proposal: { id: "p", value: "Male" } }),
    field("ADM02/result#2", "Administrative", { options: option("65 years") }),
    field("ADM02/result", "Administrative", { options: option("70 years") }),
  ], review({ "ADM02/result": receipt("64") }));

  it("keeps an entered name and otherwise reads CRF gender and age in either language", () => {
    expect(dashboardPatient(" Nguyễn An ", facts, true)).toEqual({ name: "Nguyễn An", demographics: "" });
    expect(dashboardPatient("Chưa nhập tên", facts, true)).toEqual({ name: "", demographics: "Nữ, 64 tuổi" });
    expect(dashboardPatient("", facts, false)).toEqual({ name: "", demographics: "Female, 64 years" });
    expect(dashboardPatient("", null, true)).toEqual({ name: "", demographics: "" });
  });

  it("includes reviewer and local time only when both are present", () => {
    expect(dashboardReviewer(facts.review)).toEqual({ name: "Nguyễn An", dateTime: "14:05 19/11" });
    expect(dashboardReviewer({ ...review(), reviewer: undefined })).toBeNull();
    expect(dashboardReviewer({ ...review(), reviewed_at: "invalid" })).toBeNull();
  });
});

describe("dashboard groups and retry eligibility", () => {
  it("hides empty groups, orders groups by priority and preserves the selected order within a group", () => {
    const rows = [
      { id: "approved", approved: true, opened: false },
      { id: "waiting", opened: true },
      { id: "new-a", opened: false },
      { id: "done", opened: true, reviewPending: 0 },
      { id: "working", opened: true, reviewPending: 1 },
      { id: "failed", opened: false, approved: true, failed: true },
      { id: "new-b", opened: false },
    ];
    expect(groupDashboardRows(rows).map(({ group, rows }) => [group, rows.map(({ id }) => id)])).toEqual([
      ["failed", ["failed"]], ["new", ["new-a", "new-b"]], ["reviewing", ["working"]],
      ["awaiting", ["waiting"]], ["approved", ["approved", "done"]],
    ]);
    expect(groupDashboardRows(rows.slice(1, 2)).map(({ group }) => group)).toEqual(["awaiting"]);
    expect(DEFAULT_DOCTOR_SUBMISSION_FILTERS.pageSize).toBe(20);
  });

  it.each([
    ["HTTP 409: This exact source image is already linked to another patient.", "duplicate"],
    ["Privacy proposals did not finish in time.", "timeout"],
    ["ETIMEDOUT", "timeout"],
    ["fetch failed", "network"],
    ["httpx.ConnectError: All connection attempts failed", "network"],
    ["503 Service Unavailable", "api"],
    ["Gemini API error: quota exceeded", "api"],
    ["Không có ảnh nào chứa kết quả để trích xuất.", "noResults"],
    ["HTTP 400 Invalid image", "unknown"],
    ["needs_attention", "unknown"],
    [null, "unknown"],
  ] as const)("classifies %s as %s", (error, kind) => {
    expect(classifyPipelineError(error)).toEqual({ kind, retryable: ["timeout", "network", "api"].includes(kind) });
  });
});
