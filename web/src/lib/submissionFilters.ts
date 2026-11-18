import { z } from "zod";
import type { CrfAntibodyBlotRow, CrfOcrField } from "@/data/crfData";

export const SUBMISSION_REVIEW_FILTERS = [
  "all",
  "new",
  "pending_doctor_review",
  "approved",
] as const;
export type SubmissionReviewFilter = (typeof SUBMISSION_REVIEW_FILTERS)[number];

export const UPLOADED_DATE_PRESETS = [
  "all",
  "today",
  "last_7_days",
  "last_30_days",
  "custom",
] as const;
export type UploadedDatePreset = (typeof UPLOADED_DATE_PRESETS)[number];

export const CLINICAL_RISK_FILTERS = [
  "all",
  "eular_classified",
  "eular_below",
  "sledai_high",
  "sledai_low_mod",
] as const;
export type ClinicalRiskFilter = (typeof CLINICAL_RISK_FILTERS)[number];

export const GENDER_FILTERS = ["all", "Female", "Male"] as const;
export type GenderFilter = (typeof GENDER_FILTERS)[number];

export const SUBMISSION_SORT_OPTIONS = [
  "newest",
  "oldest",
] as const;
export type SubmissionSortOption = (typeof SUBMISSION_SORT_OPTIONS)[number];

export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
export const DEFAULT_PAGE_SIZE = 5;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const submissionQuerySchema = z.object({
  status: z.enum(SUBMISSION_REVIEW_FILTERS).default("all"),
  datePreset: z.enum(UPLOADED_DATE_PRESETS).default("all"),
  fromDate: z
    .string()
    .trim()
    .regex(ISO_DATE_RE, "fromDate must use YYYY-MM-DD format.")
    .optional()
    .or(z.literal("")),
  toDate: z
    .string()
    .trim()
    .regex(ISO_DATE_RE, "toDate must use YYYY-MM-DD format.")
    .optional()
    .or(z.literal("")),
  clinicalRisk: z.enum(CLINICAL_RISK_FILTERS).default("all"),
  gender: z.enum(GENDER_FILTERS).default("all"),
  q: z.string().trim().max(120).default(""),
  sort: z.enum(SUBMISSION_SORT_OPTIONS).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(DEFAULT_PAGE_SIZE),
  utcOffsetMinutes: z.coerce
    .number()
    .int()
    .min(-840)
    .max(840)
    .default(420),
});

export type SubmissionQueryFilters = z.infer<typeof submissionQuerySchema>;

export const DEFAULT_SUBMISSION_FILTERS: SubmissionQueryFilters = {
  status: "all",
  datePreset: "all",
  fromDate: "",
  toDate: "",
  clinicalRisk: "all",
  gender: "all",
  q: "",
  sort: "newest",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  utcOffsetMinutes: 420,
};

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface OcrTierCounts {
  manualCount: number;
  verifyCount: number;
  approvedCount: number;
  totalOcrItems: number;
}

export function getOcrTierCounts(record: {
  ocrFields: Pick<CrfOcrField, "status" | "value">[];
  antibodyBlots: Pick<CrfAntibodyBlotRow, "status" | "result">[];
}): OcrTierCounts {
  let manualCount = 0;
  let verifyCount = 0;
  let approvedCount = 0;

  for (const field of record.ocrFields) {
    if (field.status === "manual_required" || !field.value.trim()) {
      manualCount += 1;
    } else if (field.status === "needs_verify") {
      verifyCount += 1;
    } else {
      approvedCount += 1;
    }
  }

  for (const blot of record.antibodyBlots) {
    if (blot.status === "manual_required" || !blot.result) {
      manualCount += 1;
    } else if (blot.status === "needs_verify") {
      verifyCount += 1;
    } else {
      approvedCount += 1;
    }
  }

  return {
    manualCount,
    verifyCount,
    approvedCount,
    totalOcrItems: manualCount + verifyCount + approvedCount,
  };
}

export function getCalendarDateInOffset(
  date: Date,
  utcOffsetMinutes: number
): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function formatDateInOffset(
  date: Date,
  utcOffsetMinutes: number
): string {
  const isoDate = getCalendarDateInOffset(date, utcOffsetMinutes);
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export function formatTimestampInOffset(
  date: Date,
  utcOffsetMinutes: number
): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  const iso = shifted.toISOString();
  const yyyy = iso.slice(0, 4);
  const mm = iso.slice(5, 7);
  const dd = iso.slice(8, 10);
  const hhmm = iso.slice(11, 16);
  return `${dd}/${mm}/${yyyy} ${hhmm}`;
}

export function formatLocalTimestamp(date: Date = new Date()): string {
  return formatTimestampInOffset(date, -date.getTimezoneOffset());
}

function shiftCalendarDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return utcDate.toISOString().slice(0, 10);
}

function calendarDateBoundaryToUtc(
  dateStr: string,
  endOfDay: boolean,
  utcOffsetMinutes: number
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMs = endOfDay
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(utcMs - utcOffsetMinutes * 60_000);
}

export interface UploadedDateBounds {
  start: Date | null;
  end: Date | null;
}

/**
 * Resolves exact UTC Date bounds for a datePreset or custom fromDate/toDate
 * relative to the caller's timezone offset (default UTC+7 ICT).
 */
export function resolveUploadedDateBounds(params: {
  datePreset: UploadedDatePreset;
  fromDate?: string;
  toDate?: string;
  utcOffsetMinutes: number;
  now?: Date;
}): UploadedDateBounds {
  const now = params.now ?? new Date();
  const today = getCalendarDateInOffset(now, params.utcOffsetMinutes);

  if (params.datePreset === "today") {
    return {
      start: calendarDateBoundaryToUtc(today, false, params.utcOffsetMinutes),
      end: calendarDateBoundaryToUtc(today, true, params.utcOffsetMinutes),
    };
  }

  if (params.datePreset === "last_7_days") {
    const startDay = shiftCalendarDate(today, -6);
    return {
      start: calendarDateBoundaryToUtc(startDay, false, params.utcOffsetMinutes),
      end: calendarDateBoundaryToUtc(today, true, params.utcOffsetMinutes),
    };
  }

  if (params.datePreset === "last_30_days") {
    const startDay = shiftCalendarDate(today, -29);
    return {
      start: calendarDateBoundaryToUtc(startDay, false, params.utcOffsetMinutes),
      end: calendarDateBoundaryToUtc(today, true, params.utcOffsetMinutes),
    };
  }

  if (
    params.datePreset === "custom" ||
    Boolean(params.fromDate) ||
    Boolean(params.toDate)
  ) {
    let from = params.fromDate?.trim() || "";
    let to = params.toDate?.trim() || "";
    if (from && to && from > to) {
      [from, to] = [to, from];
    }
    return {
      start: from
        ? calendarDateBoundaryToUtc(from, false, params.utcOffsetMinutes)
        : null,
      end: to
        ? calendarDateBoundaryToUtc(to, true, params.utcOffsetMinutes)
        : null,
    };
  }

  return { start: null, end: null };
}

export function buildSubmissionFilterSearchParams(
  filters: Partial<SubmissionQueryFilters>
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.status && filters.status !== "all") sp.set("status", filters.status);
  if (filters.datePreset && filters.datePreset !== "all") {
    sp.set("datePreset", filters.datePreset);
  }
  if (filters.fromDate) sp.set("fromDate", filters.fromDate);
  if (filters.toDate) sp.set("toDate", filters.toDate);
  if (filters.clinicalRisk && filters.clinicalRisk !== "all") {
    sp.set("clinicalRisk", filters.clinicalRisk);
  }
  if (filters.gender && filters.gender !== "all") sp.set("gender", filters.gender);
  if (filters.q && filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.sort && filters.sort !== "newest") sp.set("sort", filters.sort);
  if (typeof filters.page === "number") sp.set("page", String(filters.page));
  if (typeof filters.pageSize === "number") {
    sp.set("pageSize", String(filters.pageSize));
  }
  if (typeof filters.utcOffsetMinutes === "number") {
    sp.set("utcOffsetMinutes", String(filters.utcOffsetMinutes));
  }
  return sp;
}

export function countActiveDoctorFilters(
  filters: SubmissionQueryFilters
): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (
    filters.datePreset !== "all" ||
    Boolean(filters.fromDate) ||
    Boolean(filters.toDate)
  ) {
    count += 1;
  }
  if (filters.clinicalRisk !== "all") count += 1;
  if (filters.gender !== "all") count += 1;
  if (filters.q.trim()) count += 1;
  return count;
}
