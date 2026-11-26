/**
 * Physician approval of a backend CRF draft (POST /api/crf/approve).
 *
 * The browser submits explicit changes. The server preserves the previous
 * approvals when writing a new receipt, and the pipeline checks the draft IDs.
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
  /** Local OCR confirmed the single source value (same number, row and result column). */
  auto_review?: boolean;
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
  auto_review?: { version: string; eligible: number };
  job?: { status?: string; error?: string } | null;
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

export function approvedChoiceId(choices: readonly FieldChoice[], approved: CrfReviewValue | undefined): string | undefined {
  return choices.find((choice) => choice.id === approved?.id && choice.value === approved.value)?.id;
}

/** Values approved earlier that the current draft still offers. */
export function initialSelections(view: CrfView): Record<string, string> {
  const approved = view.review?.values ?? {};
  const result: Record<string, string> = {};
  for (const field of view.fields) {
    const previous = approved[field.slot];
    const id = approvedChoiceId(fieldChoices(field), previous);
    if (id) result[field.slot] = id;
  }
  return result;
}

/** Body for /api/crf/approve; actor and role are added by the server proxy. */
export function approvalPayload(caseId: string, view: CrfView, selections: Record<string, string>) {
  const payload = validatedSelections(caseId, view, selections);
  if (!Object.keys(payload.selections).length) throw new Error("Chọn ít nhất một ô có giá trị để duyệt.");
  return payload;
}

function validatedSelections(caseId: string, view: CrfView, selections: Record<string, string>) {
  const valid = new Map(view.fields.map((field) => [field.slot, new Set(fieldChoices(field).map((c) => c.id))]));
  const chosen: Record<string, string> = {};
  for (const [slot, id] of Object.entries(selections)) {
    if (!id) continue;
    if (!valid.get(slot)?.has(id)) throw new Error(`Giá trị của ô ${slot} không thuộc bản nháp hiện hành.`);
    chosen[slot] = id;
  }
  return { case_id: caseId, source_snapshot: view.source_snapshot, draft_sha256: view.draft_sha256, selections: chosen };
}

/** Browser edits to an existing receipt. Displayed approvals never enter this payload. */
export function reviewFieldPayload(
  caseId: string,
  view: CrfView,
  selections: Record<string, string>,
  typed: Record<string, string>,
) {
  const valid = validatedSelections(caseId, view, selections);
  const saved = initialSelections(view);
  const manual: Record<string, string> = {};
  for (const field of view.fields) {
    const slot = field.slot;
    const entered = typed[slot]?.trim();
    if (entered) {
      if (entered !== view.review?.values[slot]?.value) manual[slot] = entered;
      delete valid.selections[slot];
    } else if (valid.selections[slot] === saved[slot]) {
      delete valid.selections[slot];
    }
  }
  return { ...valid, expected_review_sha256: view.review_sha256 ?? null, manual_values: manual };
}

/** The pipeline writes a full receipt. Fill it from the current server-side review and explicit edits. */
export function completeReviewPayload(
  caseId: string,
  view: CrfView,
  selections: Record<string, string>,
  typed: Record<string, string>,
) {
  const chosen = initialSelections(view);
  const manual: Record<string, string> = {};
  for (const field of view.fields) {
    const slot = field.slot;
    const previous = view.review?.values[slot];
    const entered = typed[slot]?.trim();
    if (entered) {
      manual[slot] = entered;
      delete chosen[slot];
    } else if (selections[slot]) {
      chosen[slot] = selections[slot];
    } else if (!chosen[slot] && !field.choices.length && previous?.origin.startsWith("manual")) {
      manual[slot] = previous.value;
    }
  }
  return { ...validatedSelections(caseId, view, chosen), manual_values: manual };
}

/** Keyboard review: move the active field, clamped at both ends. */
export function moveActiveSlot(
  slots: readonly string[],
  current: string | null,
  key: "ArrowUp" | "ArrowDown",
): string | null {
  if (!slots.length) return null;
  const index = current ? slots.indexOf(current) : -1;
  if (key === "ArrowDown") return slots[Math.min(index + 1, slots.length - 1)];
  return index <= 0 ? slots[0] : slots[index - 1];
}

/**
 * Enter on the active field: tick its single source value (again to untick),
 * or explicitly accept its proposal. Never picks between several sources.
 * Returns the next selection id, "" to untick, or null when there is nothing to tick.
 */
export function enterTick(field: CrfField, current: string): string | null {
  if (field.options.length === 1) {
    return current === field.options[0].id ? "" : field.options[0].id;
  }
  if (!field.options.length && field.proposal) return current === field.proposal.id ? "" : field.proposal.id;
  return null;
}

export type OriginBadge = "approved" | "manual" | "source" | "proposal";

/** Where the value shown for a field comes from, for the origin badges. */
export function fieldOriginBadge(
  field: CrfField,
  selectedId: string,
  typedText: string,
  approvedValue: string | undefined,
): OriginBadge | null {
  if (approvedValue) return "approved";
  if (typedText.trim()) return "manual";
  const selected = fieldChoices(field).find((choice) => choice.id === selectedId);
  if (selected) return selected.kind === "proposal" ? "proposal" : selected.kind;
  if (field.options.length) return "source";
  if (field.proposal) return "proposal";
  return null;
}
