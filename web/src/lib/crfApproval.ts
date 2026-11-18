/**
 * Physician approval of a backend CRF draft (POST /api/crf/approve).
 *
 * Nothing is selected on the physician's behalf: a field enters the approval
 * only when it is chosen explicitly, or when it was already approved in the
 * current review receipt and that value is still offered by the draft. The
 * backend re-checks every id against the draft it holds.
 */

export type CrfOption = { id: string; value: string; sources?: unknown[] };
export type CrfProposal = {
  id: string;
  value: string;
  reason?: string;
  origin?: string;
  requires_confirmation?: boolean;
};
export type CrfField = {
  slot: string;
  label: string;
  section: string;
  component: string;
  instance?: number;
  instances?: number;
  choices: { code: string; label: string }[];
  options: CrfOption[];
  manual_options?: CrfOption[];
  proposal?: CrfProposal;
};
export type CrfReviewValue = { id: string; value: string; origin: string };
export type CrfReview = {
  reviewed_at: string;
  reviewer?: { name?: string; declared_role?: string };
  values: Record<string, CrfReviewValue>;
};
export type CrfView = {
  fields: CrfField[];
  review: CrfReview | null;
  source_snapshot: string;
  draft_sha256: string;
  review_sha256?: string | null;
  score_default_date?: string;
};

export type ChoiceKind = "source" | "proposal" | "manual";
export type FieldChoice = { id: string; value: string; kind: ChoiceKind; origin?: string };

/** Every value the backend would accept for this field, in display order. */
export function fieldChoices(field: CrfField): FieldChoice[] {
  const result: FieldChoice[] = field.options.map((option) => ({ id: option.id, value: option.value, kind: "source" }));
  if (field.proposal) {
    result.push({ id: field.proposal.id, value: field.proposal.value, kind: "proposal", origin: field.proposal.origin });
  }
  for (const option of field.manual_options ?? []) {
    result.push({ id: option.id, value: option.value, kind: "manual" });
  }
  return result;
}

/** Values approved earlier that the current draft still offers. */
export function initialSelections(view: CrfView): Record<string, string> {
  const approved = view.review?.values ?? {};
  const result: Record<string, string> = {};
  for (const field of view.fields) {
    const previous = approved[field.slot];
    if (previous && fieldChoices(field).some((choice) => choice.id === previous.id)) {
      result[field.slot] = previous.id;
    }
  }
  return result;
}

/** Body for /api/crf/approve; actor and role are added by the server proxy. */
export function approvalPayload(caseId: string, view: CrfView, selections: Record<string, string>) {
  const valid = new Map(view.fields.map((field) => [field.slot, new Set(fieldChoices(field).map((c) => c.id))]));
  const chosen: Record<string, string> = {};
  for (const [slot, id] of Object.entries(selections)) {
    if (!id) continue;
    if (!valid.get(slot)?.has(id)) throw new Error(`Giá trị của ô ${slot} không thuộc bản nháp hiện hành.`);
    chosen[slot] = id;
  }
  if (!Object.keys(chosen).length) throw new Error("Chọn ít nhất một ô có giá trị để duyệt.");
  return { case_id: caseId, source_snapshot: view.source_snapshot, draft_sha256: view.draft_sha256, selections: chosen };
}
