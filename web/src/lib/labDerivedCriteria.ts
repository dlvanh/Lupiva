import { parseSlot } from "@/lib/crfSlot";

/**
 * Display-only inference of SLEDAI-2K / EULAR-ACR 2019 criteria from the lab and history fields of a CRF view,
 * using approved values, unapproved proposals or the values read from the source images. Thresholds follow
 * registry_review/crf_knowledge.py; complement uses common lower limits (C3 0.9 g/L, C4 0.1 g/L) because the
 * view does not carry reference ranges. The SLEDAI 10-day window is not checked. Never written to the review,
 * the CRF or any export.
 */
type Answer = "yes" | "no";
export type LabField = {
  slot: string;
  options: readonly { value: string }[];
  proposal?: { value: string; origin?: string };
};
export type Derived = { answer: Answer; evidence: string };
type Reading = { fieldId: string; value: string };
type Approved = Record<string, { value: string }> | undefined;

const UNKNOWN = new Set(["", "unknown", "chưa rõ", "không rõ"]);

/** Values for one field component: approved > usable proposal > values read from the images. */
export function labReadings(fields: readonly LabField[], approved: Approved, fieldId: string, component = "result") {
  const readings: Reading[] = [];
  const usable = (value: string | undefined): value is string =>
    value !== undefined && !UNKNOWN.has(value.trim().toLowerCase());
  for (const field of fields) {
    let slot;
    try { slot = parseSlot(field.slot); } catch { continue; }
    if (slot.fieldId !== fieldId || slot.component !== component) continue;
    const approvedValue = approved?.[field.slot]?.value;
    const proposal = field.proposal?.origin === "no_evidence" ? undefined : field.proposal?.value;
    if (usable(approvedValue)) readings.push({ fieldId, value: approvedValue });
    else if (usable(proposal)) readings.push({ fieldId, value: proposal });
    else for (const { value } of field.options) if (usable(value)) readings.push({ fieldId, value });
  }
  return readings;
}

export function parseNumber(value: string): { n: number; unit: string } | undefined {
  const match = /^[<>≤≥]?\s*(-?\d+(?:[.,]\d+)?)\s*(.*)$/.exec(value.trim());
  if (!match) return undefined;
  return { n: Number(match[1].replace(",", ".")), unit: match[2].toLowerCase().replace(/\s+/g, "") };
}

/** "yes" for an explicit positive result, "no" for an explicit negative one, otherwise undefined. */
export function polarity(value: string): Answer | undefined {
  const text = value.trim().toLowerCase();
  if (/âm tính|negative|không phát hiện|\(-\)|^-$|^0(\s|$)/.test(text)) return "no";
  if (/dương tính|positive|\(\+\)|[1-4]\s*\+|^\+/.test(text)) return "yes";
  return undefined;
}

function yesNo(value: string): Answer | undefined {
  const text = value.trim().toLowerCase();
  if (/^(yes|có|co)(?![\p{L}\d])/u.test(text)) return "yes";
  if (/^(no|không|khong)(?![\p{L}\d])/u.test(text)) return "no";
  return undefined;
}

/** Clinical Có/Không fields: any "yes" meets the criterion, otherwise all answered "no". */
function clinical(readings: Reading[]): Derived | undefined {
  const judged = readings.flatMap((reading) => {
    const answer = yesNo(reading.value);
    return answer ? [{ reading, answer }] : [];
  });
  if (!judged.length) return undefined;
  const yes = judged.filter(({ answer }) => answer === "yes");
  return { answer: yes.length ? "yes" : "no", evidence: show((yes.length ? yes : judged).map(({ reading }) => reading)) };
}

const show = (readings: Reading[]) => readings.map(({ fieldId, value }) => `${fieldId} = ${value}`).join("; ");

/** Numeric test per reading; an explicit negative text counts as "not met". */
function threshold(readings: Reading[], test: (n: number, reading: Reading, unit: string) => boolean): Derived | undefined {
  const judged = readings.flatMap((reading) => {
    const parsed = parseNumber(reading.value);
    if (parsed) return [{ reading, hit: test(parsed.n, reading, parsed.unit) }];
    return polarity(reading.value) === "no" ? [{ reading, hit: false }] : [];
  });
  if (!judged.length) return undefined;
  const hits = judged.filter(({ hit }) => hit);
  return { answer: hits.length ? "yes" : "no", evidence: show((hits.length ? hits : judged).map(({ reading }) => reading)) };
}

function anyPositive(readings: Reading[]): Derived | undefined {
  const judged = readings.flatMap((reading) => {
    const answer = polarity(reading.value);
    return answer ? [{ reading, answer }] : [];
  });
  if (!judged.length) return undefined;
  const positive = judged.filter(({ answer }) => answer === "yes");
  return { answer: positive.length ? "yes" : "no", evidence: show((positive.length ? positive : judged).map(({ reading }) => reading)) };
}

function either(...results: (Derived | undefined)[]): Derived | undefined {
  const present = results.filter((result): result is Derived => result !== undefined);
  if (!present.length) return undefined;
  const yes = present.filter(({ answer }) => answer === "yes");
  return { answer: yes.length ? "yes" : "no", evidence: (yes.length ? yes : present).map(({ evidence }) => evidence).join("; ") };
}

/** Counts in G/L (= 10⁹/L); values written per mm³ (e.g. 4500) are converted. */
const countBelow = (limit: number, perMm3From: number) => (n: number) => (n >= perMm3From ? n / 1000 : n) < limit;

function proteinGrams(fieldId: string, n: number, unit: string) {
  if (fieldId === "REN08") return unit.startsWith("mg") ? n / 1000 : n;
  if (unit.includes("mg/mmol")) return (n * 8.84) / 1000;
  if (unit.startsWith("mg/g")) return n / 1000;
  return n;
}

const complementBelow = (limit: number) => (n: number, _reading: Reading, unit: string) =>
  (unit.includes("mg/dl") ? n / 100 : unit.includes("mg/l") ? n / 1000 : n) < limit;

export function deriveCriteria(fields: readonly LabField[], approved?: Approved): Record<string, Derived> {
  const read = (fieldId: string) => labReadings(fields, approved, fieldId);
  const wbc = read("HEM05");
  const platelets = read("HEM11");
  const fever = read("HIS12");
  const c3 = threshold(read("IMM11"), complementBelow(0.9));
  const c4 = threshold(read("IMM12"), complementBelow(0.1));
  const lowBoth: Derived | undefined = c3 && c4
    ? { answer: c3.answer === "yes" && c4.answer === "yes" ? "yes" : "no", evidence: `${c3.evidence}; ${c4.evidence}` }
    : undefined;
  const dsDna = anyPositive([...read("IMM04"), ...read("ANA01")]);
  const proteinuria = threshold([...read("REN08"), ...read("REN01")],
    (n, reading, unit) => proteinGrams(reading.fieldId, n, unit) > 0.5);
  const urineCells = (fieldId: string) => threshold(read(fieldId), (n) => n > 5);
  const yesNoOf = (...ids: string[]) => clinical(ids.flatMap(read));
  const feverAnswer = yesNoOf("HIS11");
  const swollen = threshold(read("JNT02"), (n) => n >= 2);
  const joints = swollen ?? (yesNoOf("JNT01")?.answer === "no" ? yesNoOf("JNT01") : undefined);
  const seizure = yesNoOf("NEU02");
  const psychosis = yesNoOf("NEU04");
  const malar = yesNoOf("SKN02");
  const alopecia = yesNoOf("SKN06");
  const oralUlcers = yesNoOf("SKN08");
  const pericarditis = yesNoOf("CV03");

  const derived: Record<string, Derived | undefined> = {
    EAC01: threshold(fever, (n) => n > 38.3) ?? feverAnswer,
    SDA22: threshold(fever, (n) => n > 38) ?? feverAnswer,
    EAC06: psychosis,
    SDA02: psychosis,
    EAC07: seizure,
    SDA01: seizure,
    SDA05: yesNoOf("NEU05"),
    SDA07: yesNoOf("NEU06"),
    SDA08: yesNoOf("SKN10"),
    EAC08: alopecia,
    SDA16: alopecia,
    EAC09: oralUlcers,
    SDA17: oralUlcers,
    EAC11: malar,
    SDA15: malar,
    EAC12: yesNoOf("CV06", "LUNG04"),
    SDA18: yesNoOf("LUNG04"),
    EAC13: pericarditis,
    SDA19: pericarditis,
    EAC14: joints,
    SDA09: joints,
    SDA10: yesNoOf("MUS02"),
    EAC02: threshold(wbc, countBelow(4, 1000)),
    SDA24: threshold(wbc, countBelow(3, 1000)),
    EAC03: threshold(platelets, countBelow(100, 10000)),
    SDA23: threshold(platelets, countBelow(100, 10000)),
    EAC04: anyPositive(read("HEM13")),
    EAC15: proteinuria,
    SDA13: proteinuria,
    SDA12: urineCells("REN02"),
    SDA14: urineCells("REN03"),
    EAC18: either(threshold([...read("IMM05"), ...read("IMM06")], (n) => n > 40),
      anyPositive([...read("IMM07"), ...read("IMM08")])),
    EAC19: either(c3, c4),
    EAC20: lowBoth,
    SDA20: either(c3, c4),
    EAC21: either(dsDna, anyPositive(read("ANA08"))),
    SDA21: dsDna,
  };
  return Object.fromEntries(Object.entries(derived).filter((entry): entry is [string, Derived] => entry[1] !== undefined));
}

/** ANA ≥ 1:80 entry criterion from IMM01 titre, else IMM01 result (a pattern with intensity counts as positive). */
export function deriveAna(fields: readonly LabField[], approved?: Approved): Derived | undefined {
  const titre = labReadings(fields, approved, "IMM01", "titre")
    .map((reading) => ({ ...reading, value: reading.value.replace(/^.*1\s*:\s*/, "") }));
  const fromTitre = threshold(titre, (n) => n >= 80);
  if (fromTitre) return fromTitre;
  const results = labReadings(fields, approved, "IMM01");
  const answers = new Set(results.map(({ value }) => polarity(value)).filter(Boolean));
  return answers.size === 1 ? anyPositive(results) : undefined;
}
