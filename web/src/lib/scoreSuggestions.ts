import { deriveAna, deriveCriteria, type LabField } from "@/lib/labDerivedCriteria";

type Answer = "yes" | "no";
export type ScoreSuggestion = {
  answer: Answer;
  /** proposal = rule/LLM proposal on the criterion itself; lab/clinical = inferred from other CRF fields. */
  kind: "proposal" | "lab" | "clinical";
  evidence?: string;
  slots: string[];
};
type SuggestionView = {
  fields: readonly (LabField & { proposal?: { value: string; origin?: string; reason?: string } })[];
  review?: {
    values?: Record<string, { value: string }>;
    scores?: { assessment?: { ana?: string; criteria?: Record<string, string> } };
  } | null;
  score_form?: Record<string, readonly { field_id: string }[]>;
};

const TOTALS = new Set(["EAC22", "SDA25"]);
const isAnswer = (value: string | undefined): value is Answer => value === "yes" || value === "no";

/**
 * Answers to pre-select in the "Chấm điểm" section for criteria the doctor has not saved yet. They are only a
 * draft: nothing is stored until the doctor saves the review.
 */
export function scoreSuggestions(view: SuggestionView) {
  const approved = view.review?.values;
  const assessment = view.review?.scores?.assessment;
  const derived = deriveCriteria(view.fields, approved);
  const fields = new Map(view.fields.map((field) => [field.slot, field]));
  const criteria: Record<string, ScoreSuggestion> = {};
  for (const { field_id } of Object.values(view.score_form ?? {}).flat()) {
    const slot = field_id + "/result";
    if (TOTALS.has(field_id) || isAnswer(approved?.[slot]?.value) || isAnswer(assessment?.criteria?.[field_id])) continue;
    const proposal = fields.get(slot)?.proposal;
    if (proposal && proposal.origin !== "no_evidence" && isAnswer(proposal.value)) {
      criteria[field_id] = { answer: proposal.value, kind: "proposal", evidence: proposal.reason, slots: [] };
    } else if (derived[field_id]) {
      const { answer, evidence, slots, basis } = derived[field_id];
      criteria[field_id] = { answer, kind: basis, evidence, slots };
    }
  }
  const anaDerived = isAnswer(assessment?.ana) ? undefined : deriveAna(view.fields, approved);
  const ana: ScoreSuggestion | undefined = anaDerived &&
    { answer: anaDerived.answer, kind: "lab", evidence: anaDerived.evidence, slots: anaDerived.slots };
  return { criteria, ana };
}
