import type { CrfProposal } from "@/lib/crfApproval";
import { parseSlot } from "@/lib/crfSlot";

type Answer = "yes" | "no";
type ProvisionalClassification = "meets" | "ana_not_met" | "undetermined";
type ScoreRow = { field_id: string; label: string; weight: number; definition?: string };
export type ScoreForm = Record<string, ScoreRow[]>;
export type ScoreSummary = {
  total: number | null;
  missing: number;
  classification?: ProvisionalClassification | "does_not_meet";
};
export type ScoreReview = {
  assessment?: { ana?: string; date?: string; criteria?: Record<string, string> };
  summaries?: Record<string, ScoreSummary>;
};

type ScoreField = {
  slot: string;
  options: readonly { value: string }[];
  proposal?: Pick<CrfProposal, "value" | "origin">;
};
export type ProvisionalScoreView = {
  fields: readonly ScoreField[];
  review?: { values?: Record<string, { value: string }>; scores?: ScoreReview } | null;
  score_form?: ScoreForm;
};

// EULAR_DOMAINS in registry_review/crf_scores.py, in the same clinical then immunological order.
const EULAR_DOMAINS = [
  ["EAC01"],
  ["EAC02", "EAC03", "EAC04"],
  ["EAC05", "EAC06", "EAC07"],
  ["EAC08", "EAC09", "EAC10", "EAC11"],
  ["EAC12", "EAC13"],
  ["EAC14"],
  ["EAC15", "EAC16", "EAC17"],
  ["EAC18"],
  ["EAC19", "EAC20"],
  ["EAC21"],
];
const CLINICAL_DOMAIN_COUNT = 7;

function binaryAnswer(value: string | undefined): Answer | undefined {
  switch (value?.trim().toLowerCase()) {
    case "yes":
    case "có":
      return "yes";
    case "no":
    case "không":
      return "no";
  }
}

function anaPolarity(value: string | undefined): Answer | undefined {
  switch (value?.trim().toLowerCase()) {
    case "positive":
    case "strong positive":
    case "dương tính":
    case "dương tính mạnh":
      return "yes";
    case "negative":
    case "âm tính":
      return "no";
    default:
      return binaryAnswer(value);
  }
}

function proposalValue(field: ScoreField | undefined) {
  const proposal = field?.proposal;
  return proposal?.origin === "no_evidence" ? undefined : proposal?.value;
}

function singleOptionValue(options: ScoreField["options"] = []) {
  return options.length === 1 ? options[0].value : undefined;
}

function provisionalAna(view: ProvisionalScoreView): Answer | undefined {
  const approved = binaryAnswer(view.review?.scores?.assessment?.ana);
  if (approved) return approved;

  const fields = view.fields.filter((field) => parseSlot(field.slot).baseSlot === "IMM01/result");
  const proposals = new Set(fields.map((field) => anaPolarity(proposalValue(field))).filter(Boolean));
  if (proposals.size) return proposals.size === 1 ? proposals.values().next().value : undefined;
  return anaPolarity(singleOptionValue(fields.flatMap((field) => field.options)));
}

export function computeProvisionalScores(view: ProvisionalScoreView) {
  const fields = new Map(view.fields.map((field) => [field.slot, field]));
  const assessment = view.review?.scores?.assessment;
  const approved = view.review?.values;

  const resolveCriteria = (rows: readonly ScoreRow[] = []) => rows
    .filter(({ field_id }) => field_id !== "EAC22" && field_id !== "SDA25")
    .map(({ field_id, weight }) => {
      const slot = field_id + "/result";
      const field = fields.get(slot);
      const confirmed = binaryAnswer(assessment?.criteria?.[field_id]) ?? binaryAnswer(approved?.[slot]?.value);
      const proposal = confirmed ? undefined : binaryAnswer(proposalValue(field));
      const answer = confirmed ?? proposal ?? binaryAnswer(singleOptionValue(field?.options));
      return { field_id, weight, answer, proposed: proposal !== undefined };
    });

  const sledai = resolveCriteria(view.score_form?.sledai);
  const sledaiYes = sledai.filter(({ answer }) => answer === "yes");
  const eular = resolveCriteria(view.score_form?.eular);
  const eularYes = new Map(eular.filter(({ answer }) => answer === "yes").map(({ field_id, weight }) => [field_id, weight]));
  const domainScores = EULAR_DOMAINS.map((domain) => Math.max(0, ...domain.map((id) => eularYes.get(id) ?? 0)));
  const eularTotal = domainScores.reduce((total, score) => total + score, 0);
  const hasClinicalCriterion = EULAR_DOMAINS.slice(0, CLINICAL_DOMAIN_COUNT)
    .some((domain) => domain.some((id) => eularYes.has(id)));
  const ana = provisionalAna(view);
  let classification: ProvisionalClassification = "undetermined";
  if (ana === "no") classification = "ana_not_met";
  if (ana === "yes" && eularTotal >= 10 && hasClinicalCriterion) classification = "meets";

  return {
    sledai: {
      total: sledaiYes.reduce((total, { weight }) => total + weight, 0),
      yesCount: sledaiYes.length,
      proposalCount: sledai.filter(({ proposed }) => proposed).length,
      unansweredCount: sledai.filter(({ answer }) => !answer).length,
    },
    eular: {
      total: eularTotal,
      classification,
      proposalCount: eular.filter(({ proposed }) => proposed).length,
    },
  };
}

export type ProvisionalScores = ReturnType<typeof computeProvisionalScores>;
