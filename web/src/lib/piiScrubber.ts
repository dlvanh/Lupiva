import type {
  CrfCheckItem,
  CrfInfectionEpisode,
  CrfOcrField,
  CrfTreatmentRow,
} from "@/data/crfData";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CONTEXT_ID_PATTERN =
  /\b(?:CCCD|CMND|BHYT|Passport|National\s*ID|Citizen\s*ID|Hộ\s*chiếu|Căn\s*cước|Chứng\s*minh)\s*(?:No\.?|Number|Số|#|:|-)?\s*[A-Z0-9-]{7,16}\b/gi;
// Standalone 9-digit (CMND) or 12-digit (CCCD) identifiers not inside decimals, dates, or hyphenated ranges
const STANDALONE_NATIONAL_ID_PATTERN =
  /(?<![\d./,-])(?:\d{12}|\d{9})(?![\d/-]|\.\d|,\d)/g;
// Vietnamese mobile (10 digits) and landline (11 digits: 02x + 8 digits), +84 / +84 (0) prefixes
const VN_PHONE_PATTERN =
  /(?<![\d./-])(?:\+?84[\s.-]?(?:\(0\)[\s.-]?)?|0)(?:2\d(?:[\s.-]?\d){8}|(?:3|5|7|8|9)(?:[\s.-]?\d){8})(?![\d/-]|\.\d|,\d)/g;
const INTL_PHONE_PATTERN =
  /(?<![\d./-])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,4}[\s.-]?\d{3,4}(?![\d/-]|\.\d|,\d)/g;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ScrubOptions {
  /** Known PII strings (e.g. patient full name, Study ID) to explicitly mask if leaked into free text */
  redactTokens?: string[];
}

/**
 * Redacts personal identifiers (emails, Vietnam CCCD/CMND/BHYT/Passport numbers,
 * phone numbers, and optional patient tokens) from `Cần lọc bỏ thông tin cá nhân`
 * free-text CRF narratives before storing in Zone C clinical JSONB or research exports.
 */
export function scrubFreeText(
  input: string | null | undefined,
  options: ScrubOptions = {}
): string {
  if (!input) return "";

  let scrubbed = input
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(CONTEXT_ID_PATTERN, "[REDACTED_ID]")
    .replace(VN_PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(INTL_PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(STANDALONE_NATIONAL_ID_PATTERN, "[REDACTED_ID]");

  if (options.redactTokens && options.redactTokens.length > 0) {
    const validTokens = options.redactTokens
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    for (const token of validTokens) {
      const tokenRegex = new RegExp(`(?<!\\w)${escapeRegex(token)}(?!\\w)`, "gi");
      scrubbed = scrubbed.replace(tokenRegex, "[REDACTED_PII]");
    }
  }

  return scrubbed;
}

export function isSensitiveHivOcrField(
  field: Pick<CrfOcrField, "id" | "code" | "labelEn">
): boolean {
  const code = field.code.trim().toUpperCase();
  const id = field.id.trim().toLowerCase();
  return code === "HIV-AGAB" || id === "crf-hiv" || id.endsWith("-hiv");
}

export interface SeparatedOcrFields {
  safeOcrFields: CrfOcrField[];
  hivField: CrfOcrField | null;
}

/**
 * Enforces `bang_cau_truc_du_lieu_crf.md` rule for `HIV Ag/Ab` (`BẮT BUỘC ẨN DANH / MÃ HOÁ`):
 * strips the HIV biomarker from `ocrFieldsJson` at rest so it can be encrypted inside the
 * dedicated Zone B `hiv_status_encrypted` column, and scrubs notes on remaining fields.
 */
export function stripSensitiveOcrFields(
  fields: CrfOcrField[],
  options: ScrubOptions = {}
): SeparatedOcrFields {
  let hivField: CrfOcrField | null = null;
  const safeOcrFields: CrfOcrField[] = [];

  for (const field of fields) {
    if (isSensitiveHivOcrField(field)) {
      hivField = {
        ...field,
        clinicalNoteEn: field.clinicalNoteEn
          ? scrubFreeText(field.clinicalNoteEn, options)
          : undefined,
        clinicalNoteVi: field.clinicalNoteVi
          ? scrubFreeText(field.clinicalNoteVi, options)
          : undefined,
      };
      continue;
    }

    safeOcrFields.push({
      ...field,
      clinicalNoteEn: field.clinicalNoteEn
        ? scrubFreeText(field.clinicalNoteEn, options)
        : undefined,
      clinicalNoteVi: field.clinicalNoteVi
        ? scrubFreeText(field.clinicalNoteVi, options)
        : undefined,
    });
  }

  return { safeOcrFields, hivField };
}

export function attachDecryptedHivField(
  safeOcrFields: CrfOcrField[],
  hivField: CrfOcrField | null
): CrfOcrField[] {
  if (!hivField) return safeOcrFields;
  if (safeOcrFields.some((f) => isSensitiveHivOcrField(f))) {
    return safeOcrFields;
  }

  // Insert right after HCV Ag/Ab if present to keep canonical clinical screening order
  const hcvIdx = safeOcrFields.findIndex((f) => f.code === "HCV-AGAB");
  if (hcvIdx >= 0) {
    const copy = [...safeOcrFields];
    copy.splice(hcvIdx + 1, 0, hivField);
    return copy;
  }

  return [...safeOcrFields, hivField];
}

export function scrubCheckItems(
  items: CrfCheckItem[],
  options: ScrubOptions = {}
): CrfCheckItem[] {
  return items.map((item) => ({
    ...item,
    specify: scrubFreeText(item.specify, options),
  }));
}

export function scrubInfectionEpisodes(
  episodes: CrfInfectionEpisode[],
  options: ScrubOptions = {}
): CrfInfectionEpisode[] {
  return episodes.map((ep) => ({
    ...ep,
    factor: scrubFreeText(ep.factor, options),
  }));
}

export function scrubTreatments(
  treatments: CrfTreatmentRow[],
  options: ScrubOptions = {}
): CrfTreatmentRow[] {
  return treatments.map((row) => ({
    ...row,
    name: scrubFreeText(row.name, options),
    duration: scrubFreeText(row.duration, options),
  }));
}
