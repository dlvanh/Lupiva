/**
 * Source evidence and review grouping for the backend CRF view (/registry).
 *
 * The backend (/api/crf) returns, for each source value, the row label printed
 * on the sheet, the value with its date, a crop image under /asset and, when
 * the model gave one, the row box on that image. This module turns them into
 * what the page shows; it never selects anything on the physician's behalf.
 */
import type { CrfField, CrfOption, CrfView } from "@/lib/crfApproval";
import { parseSlot } from "@/lib/crfSlot";

export type RowLocation = {
  box?: unknown;
  image_size?: unknown;
  coordinate_space?: unknown;
};

export type SourceDetail = {
  label?: string;
  value?: string;
  url?: string;
  reference?: unknown;
  row_location?: RowLocation;
};

export type Evidence = {
  label: string;
  value: string;
  date?: string;
  dateKind?: string;
  imageUrl?: string;
  /** Row box in percent of the image; the page shows it only if the image size matches. */
  box?: { left: number; top: number; width: number; height: number };
  imageSize?: [number, number];
};

export type CrfViewWithSources = CrfView & { sources?: Record<string, SourceDetail> };

/**
 * CRF components the doctors do not record. The ANA test name prints its
 * technique ("bằng kỹ thuật huỳnh quang"); only the pattern, intensity and
 * titre matter, so IMM01/method is neither shown nor offered for approval.
 * (It stays in the backend dictionary, whose hash the stored records carry.)
 */
export const HIDDEN_SLOTS = new Set(["IMM01/method"]);

export function withoutHidden<T extends CrfView>(view: T): T {
  return { ...view, fields: view.fields.filter((field) => !HIDDEN_SLOTS.has(parseSlot(field.slot).baseSlot)) };
}

const DATE_KIND: Record<string, string> = {
  sample_date: "ngày lấy mẫu",
  result_date: "ngày trả kết quả",
  report_date: "ngày báo cáo",
  request_date: "ngày chỉ định",
  received_date: "ngày nhận mẫu",
};

/** "4.36 T/L (2026-05-27T09:38:00; sample_date)" → value, date, date kind. */
export function splitDatedValue(raw: string): { value: string; date?: string; dateKind?: string } {
  const match = raw.match(/^(.*?)\s*\((\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?;\s*([a-z_]+)\)\s*$/);
  if (!match) return { value: raw };
  const [, value, year, month, day, hour, minute, kind] = match;
  const time = hour && !(hour === "00" && minute === "00") ? ` ${hour}:${minute}` : "";
  return { value, date: `${day}/${month}/${year}${time}`, dateKind: DATE_KIND[kind] ?? kind };
}

/** Only backend asset links go through the proxy; anything else is dropped. */
export function proxiedAsset(url: unknown): string | undefined {
  return typeof url === "string" && url.startsWith("/asset?") ? "/api/pipeline" + url : undefined;
}

/** Same check as the backend review page: 0–1000 box on the outgoing image. */
export function rowBox(location: RowLocation | undefined): Pick<Evidence, "box" | "imageSize"> {
  if (!location || location.coordinate_space !== "outgoing_image_1000") return {};
  const { box, image_size: size } = location;
  if (!Array.isArray(box) || box.length !== 4 || !Array.isArray(size) || size.length !== 2) return {};
  if (!box.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) return {};
  if (!size.every((v) => Number.isInteger(v) && v > 0)) return {};
  const [left, top, right, bottom] = box as number[];
  if (left >= right || top >= bottom) return {};
  return {
    box: { left: left / 10, top: top / 10, width: (right - left) / 10, height: (bottom - top) / 10 },
    imageSize: size as [number, number],
  };
}

export function evidenceFor(option: CrfOption, sources: Record<string, SourceDetail> | undefined): Evidence[] {
  const result: Evidence[] = [];
  for (const id of option.sources ?? []) {
    if (typeof id !== "string") continue;
    const detail = sources?.[id];
    if (!detail) continue;
    result.push({
      label: detail.label ?? "",
      ...splitDatedValue(detail.value ?? option.value),
      imageUrl: proxiedAsset(detail.url),
      ...rowBox(detail.row_location),
    });
  }
  return result;
}

/** First known date among an option's sources, to tell repeated tests apart. */
export function optionDate(option: CrfOption, sources: Record<string, SourceDetail> | undefined): string | undefined {
  return evidenceFor(option, sources).find((item) => item.date)?.date;
}

export function firstReviewField(fields: readonly CrfField[], sources: CrfViewWithSources["sources"]) {
  return fields.find((field) =>
    field.options.some((option) => evidenceFor(option, sources).some((evidence) => evidence.imageUrl)),
  ) ?? fields[0];
}

export type ReviewGroup = "decide" | "source" | "unknown" | "empty";

/**
 * decide: several source values, or a rule/LLM/calculated proposal to weigh;
 * source: exactly one value read from the documents;
 * unknown: a clinical question the documents do not answer ("Chưa rõ" draft);
 * empty: nothing offered.
 */
export function reviewGroup(field: CrfField): ReviewGroup {
  if (field.options.length > 1) return "decide";
  if (field.options.length === 1) return "source";
  if (field.proposal) return field.proposal.origin === "no_evidence" ? "unknown" : "decide";
  return "empty";
}

/** Selections ticking every single-source field given (an explicit bulk action). */
export function singleSourceSelections(fields: readonly CrfField[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (reviewGroup(field) === "source") result[field.slot] = field.options[0].id;
  }
  return result;
}

/** Map a backend intake job to its registry case (for /registry?intake=…). */
export function caseForIntake(
  jobs: readonly { job_id?: string; case_id?: string | null }[] | undefined,
  intakeId: string,
): string | null {
  return jobs?.find((job) => job.job_id === intakeId)?.case_id ?? null;
}

export type ReviewProgress = { approved: number; total: number; percent: number; pending: number };

/** "đã duyệt X/Y ô" from the backend CRF view (hidden slots already filtered out). */
export function reviewProgress(view: CrfView): ReviewProgress {
  const values = view.review?.values ?? {};
  const total = view.fields.length;
  const approved = view.fields.filter((field) => values[field.slot]).length;
  return { approved, total, percent: total ? Math.round((approved / total) * 100) : 0, pending: pendingDecisionSlots(view).length };
}

/** Score totals are calculated by the backend, not decided by the doctor. */
const SCORE_TOTAL_SLOTS = new Set(["EAC22/result", "SDA25/result"]);

/** Cells that still offer a decision the doctor has not approved yet. */
export function pendingDecisionSlots(view: CrfView): string[] {
  const values = view.review?.values ?? {};
  return view.fields
    .filter((field) => !SCORE_TOTAL_SLOTS.has(field.slot) && reviewGroup(field) !== "empty" && !values[field.slot])
    .map((field) => field.slot);
}

/** The web dossier may be finalized only after every offered cell was approved. */
export function canFinalizeReview(view: CrfView): boolean {
  return !!view.review && view.job?.status !== "running" && view.fields.length > 0 && pendingDecisionSlots(view).length === 0;
}

export type SubmissionStage = "processing" | "failed" | "awaiting" | "reviewing" | "approved" | "exported";

/**
 * REDCap appears only when this dashboard has observed a successful export.
 */
export function submissionStage(params: {
  pipelineStatus?: string;
  webApproved: boolean;
  reviewStarted: boolean;
  redcapExported?: boolean;
}): SubmissionStage {
  if (params.webApproved) return params.redcapExported ? "exported" : "approved";
  if (params.pipelineStatus === "failed") return "failed";
  const status = params.pipelineStatus ?? "none";
  // "none" = never handed to the backend (legacy dossier): nothing is processing.
  if (status === "none" || status === "completed") {
    return params.reviewStarted ? "reviewing" : "awaiting";
  }
  return "processing";
}

export function stageLabel(stage: SubmissionStage, percent: number, isVi: boolean): string {
  if (isVi) {
    switch (stage) {
      case "processing": return "Đang xử lý";
      case "failed": return "Lỗi xử lý";
      case "awaiting": return "Chờ duyệt";
      case "reviewing": return `Đang duyệt (${percent}%)`;
      case "approved": return "Đã duyệt";
      case "exported": return "Đã xuất REDCap";
    }
  }
  switch (stage) {
    case "processing": return "Processing";
    case "failed": return "Failed";
    case "awaiting": return "Awaiting review";
    case "reviewing": return `Reviewing (${percent}%)`;
    case "approved": return "Approved";
    case "exported": return "Exported to REDCap";
  }
}

/** Administrative values printed in Vietnamese on the dashboard cards. */
export function viAdminValue(fieldId: string, text: string): string {
  if (fieldId === "ADM02") return text.replace(/\s*(?:years?|yrs?)\b/i, " tuổi");
  if (fieldId === "ADM03") {
    if (/^female$/i.test(text.trim())) return "Nữ";
    if (/^male$/i.test(text.trim())) return "Nam";
  }
  return text;
}

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

const SECTION_VI: [RegExp, string][] = [
  [/administr|demograph/i, "Hành chính"],
  [/haematolog|hematolog|blood count|cbc/i, "Huyết học"],
  [/renal|kidney/i, "Thận"],
  [/urinalys|urine/i, "Nước tiểu"],
  [/immunolog|serolog|autoantibod|complement/i, "Miễn dịch"],
  [/biochem/i, "Hóa sinh"],
  [/damage/i, "Tổn thương cơ quan"],
  [/score|criteria/i, "Chấm điểm"],
  [/infection/i, "Nhiễm trùng"],
  [/clinical|history|activity|disease/i, "Lâm sàng"],
];

/** Short Vietnamese section title; Vietnamese or unknown titles stay as they are. */
export function viSection(section: string): string {
  if (stripDiacritics(section) !== section) return section;
  for (const [pattern, vi] of SECTION_VI) if (pattern.test(section)) return vi;
  return section;
}

const FIELD_ID_VI: Record<string, string> = {
  ADM01: "Họ tên",
  ADM02: "Tuổi",
  ADM03: "Giới",
  ADM04: "Ngày ICF",
  ADM05: "Chiều cao",
  ADM06: "Cân nặng",
  ADM07: "BMI",
  ADM08: "Bác sĩ",
  ADM09: "Điều dưỡng",
};

const FIELD_LABEL_VI: [RegExp, string][] = [
  [/anti-?dsdna/i, "Anti-dsDNA"],
  [/\brbc\b|hong cau/i, "Hồng cầu"],
  [/\bwbc\b|bach cau/i, "Bạch cầu"],
  [/hemoglobin|haemoglobin|\bhb\b/i, "Huyết sắc tố"],
  [/platelet|\bplt\b|tieu cau/i, "Tiểu cầu"],
  [/lympho/i, "Lympho"],
  [/neutro/i, "Trung tính"],
  [/creatinin/i, "Creatinine"],
  [/\burea\b/i, "Urê"],
  [/\besr\b|sedimentation/i, "Máu lắng"],
  [/\bcrp\b/i, "CRP"],
  [/\bc3\b/i, "Bổ thể C3"],
  [/\bc4\b/i, "Bổ thể C4"],
  [/coombs/i, "Coombs"],
  [/\bana\b/i, "ANA"],
  [/height/i, "Chiều cao"],
  [/weight/i, "Cân nặng"],
  [/\bage\b/i, "Tuổi"],
  [/gender|\bsex\b/i, "Giới"],
  [/physician/i, "Bác sĩ"],
  [/nurse/i, "Điều dưỡng"],
  [/patient name|\bname\b/i, "Họ tên"],
];

/** Short Vietnamese label for a CRF field, or undefined to keep only the English one. */
export function viFieldLabel(field: CrfField): string | undefined {
  if (stripDiacritics(field.label) !== field.label) return undefined;
  const byId = FIELD_ID_VI[parseSlot(field.slot).fieldId];
  if (byId) return byId.toLowerCase() === field.label.toLowerCase() ? undefined : byId;
  for (const [pattern, vi] of FIELD_LABEL_VI) {
    if (pattern.test(field.label)) return vi.toLowerCase() === field.label.toLowerCase() ? undefined : vi;
  }
  return undefined;
}
