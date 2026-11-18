import { describe, expect, it } from "vitest";
import type { CrfField, CrfView } from "@/lib/crfApproval";
import {
  canFinalizeReview,
  firstReviewField,
  pendingDecisionSlots,
  reviewProgress,
  stageLabel,
  submissionStage,
  viAdminValue,
  viFieldLabel,
  viSection,
} from "@/lib/crfEvidence";

const field = (over: Partial<CrfField>): CrfField => ({
  slot: "HEM01/result",
  label: "RBC",
  section: "Haematology",
  component: "result",
  choices: [],
  options: [],
  ...over,
});

const view = (fields: CrfField[], review?: CrfView["review"]): CrfView => ({
  fields,
  review: review ?? null,
  source_snapshot: "s",
  draft_sha256: "d",
});

const single = field({ slot: "ADM02/result", options: [{ id: "a", value: "20 years" }] });
const decided = field({ slot: "HEM02/result", options: [{ id: "b1", value: "1" }, { id: "b2", value: "2" }] });
const proposed = field({ slot: "CLI01/result", proposal: { id: "c", value: "no", origin: "llm" } });
const unknown = field({ slot: "CLI02/result", proposal: { id: "d", value: "unknown", origin: "no_evidence" } });
const empty = field({ slot: "ADM08/result" });
const total = field({ slot: "EAC22/result", proposal: { id: "t", value: "12", origin: "calculated" } });

describe("reviewProgress", () => {
  it("counts approved cells against the visible fields", () => {
    const v = view([single, decided, proposed], {
      reviewed_at: "2026-11-18T00:00:00Z",
      values: { "ADM02/result": { id: "a", value: "20 years", origin: "source" } },
    });
    expect(reviewProgress(v)).toEqual({ approved: 1, total: 3, percent: 33, pending: 2 });
  });
  it("ignores review values whose slot is no longer in the draft", () => {
    const v = view([single], {
      reviewed_at: "2026-11-18T00:00:00Z",
      values: {
        "ADM02/result": { id: "a", value: "20 years", origin: "source" },
        "GONE/result": { id: "x", value: "1", origin: "source" },
      },
    });
    expect(reviewProgress(v)).toEqual({ approved: 1, total: 1, percent: 100, pending: 0 });
  });
  it("reports remaining decisions across sections from the same count used for finalization", () => {
    const v = view([single, decided, proposed, unknown, empty, total], {
      reviewed_at: "now",
      values: {
        [decided.slot]: { id: "b1", value: "1", origin: "source" },
        [proposed.slot]: { id: "c", value: "no", origin: "llm" },
      },
    });
    expect(reviewProgress(v)).toEqual({ approved: 2, total: 6, percent: 33, pending: 2 });
    expect(reviewProgress(v).pending).toBe(pendingDecisionSlots(v).length);
  });
  it("is zero for an empty draft without dividing by zero", () => {
    expect(reviewProgress(view([]))).toEqual({ approved: 0, total: 0, percent: 0, pending: 0 });
  });
});

describe("pendingDecisionSlots and canFinalizeReview", () => {
  it("lists unapproved cells that offer a decision, never empty cells or score totals", () => {
    const v = view([single, decided, proposed, unknown, empty, total]);
    expect(pendingDecisionSlots(v)).toEqual(["ADM02/result", "HEM02/result", "CLI01/result", "CLI02/result"]);
  });
  it("cannot finalize without a review, even when everything is approved-looking", () => {
    expect(canFinalizeReview(view([single]))).toBe(false);
  });
  it("cannot finalize while a decision remains", () => {
    const v = view([single, decided], {
      reviewed_at: "2026-11-18T00:00:00Z",
      values: { "ADM02/result": { id: "a", value: "20 years", origin: "source" } },
    });
    expect(canFinalizeReview(v)).toBe(false);
  });
  it("finalizes once every offered cell is approved (empty cells and totals do not block)", () => {
    const v = view([single, empty, total], {
      reviewed_at: "2026-11-18T00:00:00Z",
      values: { "ADM02/result": { id: "a", value: "20 years", origin: "source" } },
    });
    expect(canFinalizeReview(v)).toBe(true);
    expect(canFinalizeReview({ ...v, job: { status: "running" } })).toBe(false);
  });
});

describe("firstReviewField", () => {
  it("starts on the first visible field with an image and falls back to the first field", () => {
    const illustrated = { ...single, options: [{ ...single.options[0], sources: ["page"] }] };
    expect(firstReviewField([unknown, illustrated], { page: { url: "/asset?id=page" } })).toBe(illustrated);
    expect(firstReviewField([unknown, illustrated], undefined)).toBe(unknown);
  });
});

describe("submissionStage", () => {
  it("follows the single progress chain", () => {
    expect(submissionStage({ pipelineStatus: "processing", webApproved: false, reviewStarted: false })).toBe("processing");
    expect(submissionStage({ pipelineStatus: "none", webApproved: false, reviewStarted: false })).toBe("awaiting");
    expect(submissionStage({ pipelineStatus: "failed", webApproved: false, reviewStarted: false })).toBe("failed");
    expect(submissionStage({ pipelineStatus: "completed", webApproved: false, reviewStarted: false })).toBe("awaiting");
    expect(submissionStage({ pipelineStatus: "completed", webApproved: false, reviewStarted: true })).toBe("reviewing");
    expect(submissionStage({ pipelineStatus: "completed", webApproved: true, reviewStarted: true })).toBe("approved");
  });
  it("stays approved even if the pipeline state is unknown", () => {
    expect(submissionStage({ pipelineStatus: undefined, webApproved: true, reviewStarted: false })).toBe("approved");
  });
  it("shows REDCap only for an approved dossier with a confirmed export", () => {
    expect(submissionStage({ webApproved: true, reviewStarted: true, redcapExported: true })).toBe("exported");
    expect(submissionStage({ webApproved: false, reviewStarted: true, redcapExported: true })).toBe("reviewing");
    expect(stageLabel("exported", 100, true)).toBe("Đã xuất REDCap");
  });
  it("labels the chain in Vietnamese and English, with the review percent", () => {
    expect(stageLabel("processing", 0, true)).toBe("Đang xử lý");
    expect(stageLabel("awaiting", 0, true)).toBe("Chờ duyệt");
    expect(stageLabel("reviewing", 33, true)).toBe("Đang duyệt (33%)");
    expect(stageLabel("approved", 100, true)).toBe("Đã duyệt");
    expect(stageLabel("failed", 0, true)).toBe("Lỗi xử lý");
    expect(stageLabel("reviewing", 33, false)).toBe("Reviewing (33%)");
    expect(stageLabel("approved", 100, false)).toBe("Approved");
  });
});

describe("viAdminValue", () => {
  it("turns ages into tuổi", () => {
    expect(viAdminValue("ADM02", "20 years")).toBe("20 tuổi");
    expect(viAdminValue("ADM02", "1 year")).toBe("1 tuổi");
    expect(viAdminValue("ADM02", "20")).toBe("20");
  });
  it("turns genders into Nữ/Nam", () => {
    expect(viAdminValue("ADM03", "Female")).toBe("Nữ");
    expect(viAdminValue("ADM03", "male")).toBe("Nam");
    expect(viAdminValue("ADM03", "Unknown")).toBe("Unknown");
  });
  it("leaves other facts untouched", () => {
    expect(viAdminValue("ADM05", "160 cm")).toBe("160 cm");
  });
});

describe("viSection and viFieldLabel", () => {
  it("maps common English section titles to Vietnamese", () => {
    expect(viSection("Administrative")).toBe("Hành chính");
    expect(viSection("Haematology")).toBe("Huyết học");
    expect(viSection("Hematology & Coombs")).toBe("Huyết học");
    expect(viSection("Renal")).toBe("Thận");
    expect(viSection("Kidneys & Renal Biopsy")).toBe("Thận");
    expect(viSection("Urinalysis")).toBe("Nước tiểu");
    expect(viSection("Immunology")).toBe("Miễn dịch");
  });
  it("keeps Vietnamese or unknown sections as they are", () => {
    expect(viSection("Huyết học")).toBe("Huyết học");
    expect(viSection("Miscellaneous")).toBe("Miscellaneous");
  });
  it("maps administrative field ids", () => {
    expect(viFieldLabel(field({ slot: "ADM02/result", label: "Age" }))).toBe("Tuổi");
    expect(viFieldLabel(field({ slot: "ADM03/result", label: "Gender: Female / Male" }))).toBe("Giới");
    expect(viFieldLabel(field({ slot: "ADM08/result", label: "Physician" }))).toBe("Bác sĩ");
  });
  it("maps common lab labels and falls back to undefined", () => {
    expect(viFieldLabel(field({ slot: "HEM01/result", label: "RBC" }))).toBe("Hồng cầu");
    expect(viFieldLabel(field({ slot: "HEM02/result", label: "Hemoglobin (Hb)" }))).toBe("Huyết sắc tố");
    expect(viFieldLabel(field({ slot: "IMM02/result", label: "Anti-dsDNA" }))).toBeUndefined();
    expect(viFieldLabel(field({ slot: "IMM03/result", label: "C3" }))).toBe("Bổ thể C3");
    expect(viFieldLabel(field({ slot: "ZZZ01/result", label: "Something else" }))).toBeUndefined();
    expect(viFieldLabel(field({ slot: "HEM01/result", label: "Hồng cầu" }))).toBeUndefined();
  });
});
