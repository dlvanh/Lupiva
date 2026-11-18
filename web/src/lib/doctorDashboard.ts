import type { SleCrfPatientRecord } from "@/data/crfData";
import type { CrfReview, CrfView } from "@/lib/crfApproval";
import { CRF_SECTION_GROUPS, crfSectionGroup, viAdminValue, withoutHidden, type CrfSectionGroup } from "@/lib/crfEvidence";
import { shownValue } from "@/lib/crfForm";
import { parseSlot } from "@/lib/crfSlot";

const DASHBOARD_GROUPS = ["failed", "new", "reviewing", "awaiting", "approved"] as const;
type DashboardGroup = (typeof DASHBOARD_GROUPS)[number];
type DashboardRow = { failed?: boolean; approved?: boolean; opened: boolean; reviewPending?: number };

export function groupDashboardRows<T extends DashboardRow>(rows: readonly T[]) {
  const groups = new Map<DashboardGroup, T[]>(DASHBOARD_GROUPS.map((group) => [group, []]));
  for (const row of rows) {
    const group = row.failed ? "failed"
      : row.approved ? "approved"
      : !row.opened ? "new"
      : row.reviewPending === undefined ? "awaiting"
      : row.reviewPending > 0 ? "reviewing" : "approved";
    groups.get(group)!.push(row);
  }
  return Array.from(groups, ([group, rows]) => ({ group, rows })).filter(({ rows }) => rows.length > 0);
}

export type SectionTone = "empty" | "unverified" | "complete";

export function sectionProgress(view: CrfView) {
  const counts = new Map<CrfSectionGroup, { approved: number; total: number }>(
    CRF_SECTION_GROUPS.map((group) => [group, { approved: 0, total: 0 }]),
  );
  for (const field of withoutHidden(view).fields) {
    const saved = view.review?.values[field.slot]?.value.trim();
    const populated = saved || field.options.some((option) => option.value.trim()) || field.proposal?.value.trim();
    if (!populated) continue;
    const count = counts.get(crfSectionGroup(field))!;
    count.total++;
    if (saved) count.approved++;
  }
  return Array.from(counts, ([group, { approved, total }]) => {
    const tone: SectionTone = !total ? "empty" : approved === total ? "complete" : "unverified";
    return { group, approved, total, tone };
  });
}

export function adminField(view: CrfView, fieldId: string) {
  const fields = view.fields.filter((field) => {
    const slot = parseSlot(field.slot);
    return slot.fieldId === fieldId && slot.instance === 1;
  });
  return fields.find((field) => field.component === "result") ?? fields[0];
}

export function dashboardPatient(patientName: string, view: CrfView | null, isVi: boolean, profile?: Pick<SleCrfPatientRecord, "age" | "gender">) {
  const name = patientName.trim();
  if (name && !/^(chưa nhập tên|name not entered)$/i.test(name)) return { name, demographics: "" };
  const demographics = ["ADM03", "ADM02"].flatMap((id) => {
    const field = view && adminField(view, id);
    const fromCrf = field && shownValue(field, view?.review?.values)?.text.trim();
    const value = fromCrf || (id === "ADM02" ? profile?.age : profile?.gender)?.trim();
    if (!value) return [];
    const formatted = id === "ADM02" && /^\d+$/.test(value) ? `${value} ${value === "1" ? "year" : "years"}` : value;
    return [isVi ? viAdminValue(id, formatted) : formatted];
  }).join(", ");
  return { name: "", demographics };
}

const REVIEW_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23",
});

export function dashboardReviewer(review: CrfReview | null) {
  const name = review?.reviewer?.name?.trim();
  if (!name || !review?.reviewed_at) return null;
  const date = new Date(review.reviewed_at);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(REVIEW_DATE_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]));
  return { name, dateTime: `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}` };
}

export function classifyPipelineError(error: string | null | undefined) {
  const message = error ?? "";
  if (/exact source image.+already linked to another patient/i.test(message)) {
    return { kind: "duplicate", retryable: false } as const;
  }
  if (/không có ảnh nào chứa kết quả để trích xuất/i.test(message)) {
    return { kind: "noResults", retryable: false } as const;
  }
  if (/timeout|timed out|etimedout|did not finish in time|deadline exceeded|\b(?:408|504)\b/i.test(message)) {
    return { kind: "timeout", retryable: true } as const;
  }
  if (/network|fetch failed|failed to fetch|connecterror|connection (?:reset|refused|aborted)|econn(?:reset|refused|aborted)|enotfound|eai_again|backend down/i.test(message)) {
    return { kind: "network", retryable: true } as const;
  }
  if (/\b(?:429|50[0-3])\b|\bapi (?:error|unavailable)|backend did not return an intake id|rate limit|quota exceeded|service unavailable/i.test(message)) {
    return { kind: "api", retryable: true } as const;
  }
  return { kind: "unknown", retryable: false } as const;
}
