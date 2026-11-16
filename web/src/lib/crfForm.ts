/**
 * Read-only CRF form filled from the backend view (/api/crf), laid out like the
 * Word template (same placement rules as the backend review page).
 *
 * Every cell shows an answer: the approved value; else the value read from the
 * source; else the rule/LLM/calculated proposal itself (e.g. "Chưa rõ"), with a
 * note outside the cell saying where it came from. Nothing here approves
 * anything: approval stays on /registry.
 */
import type { CrfField } from "@/lib/crfApproval";

export type LayoutCell = {
  text: string;
  span?: number;
  row_span?: number;
  field_id?: string | null;
  checkbox_slot?: string | null;
  checkbox_values?: string[];
  inline_label?: string;
};
export type LayoutBlock = {
  index: number;
  text?: string;
  rows?: LayoutCell[][];
  checkbox_slot?: string | null;
  checkbox_values?: string[];
};

export type ShownKind = "approved" | "source" | "proposal";
export type Shown = { value: string; text: string; kind: ShownKind; origin?: string; more?: number };

type ReviewValues = Record<string, { value: string; origin?: string }> | undefined;
type PlacedField = CrfField & { template_block?: number };

export function choiceText(field: CrfField, value: string): string {
  return field.choices.find((choice) => choice.code === value)?.label ?? value;
}

/** What the form prints for a field, and why. */
export function shownValue(field: CrfField, approved: ReviewValues): Shown | null {
  const saved = approved?.[field.slot];
  if (saved) return { value: saved.value, text: choiceText(field, saved.value), kind: "approved", origin: saved.origin };
  if (field.options.length) {
    const value = field.options[0].value;
    return { value, text: choiceText(field, value), kind: "source", more: field.options.length - 1 };
  }
  if (field.proposal) {
    const value = field.proposal.value;
    return { value, text: choiceText(field, value), kind: "proposal", origin: field.proposal.origin };
  }
  return null;
}

export function shownNote(shown: Shown): string {
  if (shown.kind === "approved") return "Đã duyệt";
  if (shown.kind === "source") {
    return shown.more ? `Từ nguồn · chưa duyệt · còn ${shown.more} giá trị khác` : "Từ nguồn · chưa duyệt";
  }
  if (shown.origin === "calculated") return "Tính từ số đo · chưa duyệt";
  if (shown.origin === "knowledge_rule") return "Quy tắc đề xuất · chưa duyệt";
  if (shown.origin === "no_evidence") return "LLM đề xuất (không có dữ kiện) · chưa duyệt";
  return "LLM đề xuất · chưa duyệt";
}

const norm = (text: string) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function labelKeys(field: CrfField): Set<string> {
  const label = field.label || "";
  const keys = [label, label.split(/[:,(]/)[0]];
  if (!label.includes(":") && label.includes("/")) keys.push(label.split("/").pop() ?? "");
  return new Set(keys.map(norm).filter((item) => item.length >= 2));
}

export type CellKey = string; // `${blockIndex}:${row}:${col}`
export const cellKey = (block: number, row: number, col: number): CellKey => `${block}:${row}:${col}`;

export type Placement = {
  /** Fields printed inside a template cell. */
  inCell: Map<CellKey, CrfField[]>;
  /** Result words ticked in a Negative/Positive/Borderline column. */
  ticks: Set<CellKey>;
  /** Template cells whose "(…)" placeholder is replaced by a value. */
  cleared: Set<CellKey>;
  /** Fields without a template cell, grouped under the block that precedes them. */
  after: Map<number, { section: string; fields: CrfField[] }[]>;
};

/**
 * Place every field: its bound cell (field_id), else the template row or line
 * that prints its label in the 3 tables after its template block, else a list
 * after that block. Fields answered by template checkboxes are not repeated.
 */
export function placeFields(
  layout: LayoutBlock[],
  fields: CrfField[],
  approved: ReviewValues,
  showEmpty: boolean,
): Placement {
  const placement: Placement = { inCell: new Map(), ticks: new Set(), cleared: new Set(), after: new Map() };
  const bound = new Map<string, CellKey>();
  const checkboxCodes = new Map<string, Set<string>>();
  const remember = (slot: string | null | undefined, codes: string[] | undefined) => {
    if (!slot) return;
    const set = checkboxCodes.get(slot) ?? new Set<string>();
    for (const code of codes ?? []) set.add(code);
    checkboxCodes.set(slot, set);
  };
  for (const block of layout) {
    if (!block.rows) {
      remember(block.checkbox_slot, block.checkbox_values);
      continue;
    }
    block.rows.forEach((cells, r) =>
      cells.forEach((cell, c) => {
        if (cell.field_id && !bound.has(cell.field_id)) bound.set(cell.field_id, cellKey(block.index, r, c));
        remember(cell.checkbox_slot, cell.checkbox_values);
      }),
    );
  }
  const tables = layout.filter((block) => block.rows);
  const findTarget = (field: PlacedField) => {
    const keys = labelKeys(field);
    const start = Number(field.template_block);
    if (!keys.size || !start) return null;
    for (const table of tables) {
      if (table.index < start || table.index > start + 3) continue;
      const rows = table.rows!;
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r];
        const first = cells[0];
        if (cells.length > 1 && first && !first.field_id && !first.checkbox_slot && keys.has(norm(first.text))) {
          const last = cells[cells.length - 1];
          if (!last.field_id && !last.checkbox_slot) {
            return { key: cellKey(table.index, r, cells.length - 1), row: r as number | null, table, placeholder: last.text };
          }
        }
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          if (cell.field_id || cell.checkbox_slot || !cell.text.includes("\n")) continue;
          if (cell.text.split("\n").some((line) => keys.has(norm(line.split(/[:\t]/)[0])))) {
            return { key: cellKey(table.index, r, c), row: null, table, placeholder: "" };
          }
        }
      }
    }
    return null;
  };
  for (const field of fields as PlacedField[]) {
    const shown = shownValue(field, approved);
    const codes = checkboxCodes.get(field.slot);
    // Template checkboxes already print this answer (or its absence).
    if (codes && (!shown || codes.has(shown.value))) continue;
    const boundCell = bound.get(field.slot.split("/")[0]);
    const matched = boundCell ? null : findTarget(field);
    const target = boundCell ?? matched?.key;
    if (!shown && !showEmpty && (!target || matched)) continue;
    if (target) {
      placement.inCell.set(target, [...(placement.inCell.get(target) ?? []), field]);
      if (matched && /^\s*\(.*\)\s*$/.test(matched.placeholder)) placement.cleared.add(target);
      if (matched && matched.row !== null && field.component === "result" && shown) {
        const word = ["negative", "positive", "borderline"].find((item) =>
          new RegExp(`\\b${item}\\b`, "i").test(shown.value),
        );
        if (word) {
          matched.table.rows![0].forEach((cell, index) => {
            if (norm(cell.text) === word) placement.ticks.add(cellKey(matched.table.index, matched.row!, index));
          });
        }
      }
      continue;
    }
    const anchor = Number(field.template_block) || 0;
    const groups = placement.after.get(anchor) ?? [];
    let group = groups.find((item) => item.section === field.section);
    if (!group) {
      group = { section: field.section, fields: [] };
      groups.push(group);
    }
    group.fields.push(field);
    placement.after.set(anchor, groups);
  }
  return placement;
}

/**
 * Fill one printed template line with a field's answer: tick the matching
 * "☐ Option" or write the value over the placeholder ("☐ ☐", "……"). Returns
 * null when the line is not this field's line or has nowhere to put the value.
 */
export function fillTemplateLine(line: string, field: CrfField, shown: Shown): string | null {
  const prefix = line.split(/[:	☐]/)[0];
  if (!labelKeys(field).has(norm(prefix))) return null;
  const head = line.slice(0, prefix.length);
  const rest = line.slice(prefix.length);
  if (rest.includes("☐")) {
    const wanted = new Set([norm(shown.text), norm(shown.value)]);
    let ticked = false;
    const filled = rest.replace(/☐(\s*)([^☐	]+)/g, (whole, space: string, word: string) => {
      if (!ticked && wanted.has(norm(word))) {
        ticked = true;
        return `☑${space}${word}`;
      }
      return whole;
    });
    if (ticked) return head + filled;
    if (!/☐\s*[A-Za-zÀ-ỹ]/.test(rest)) {
      // Boxes are digit cells ("Age: ☐ ☐"), not options: write the value over them.
      return head + rest.replace(/(?:☐[\s\-./]*)+/, `${shown.text} `);
    }
    return null;
  }
  const placeholder = /[.…_]{3,}/;
  if (placeholder.test(rest)) return head + rest.replace(placeholder, shown.text);
  if (/^\s*:?\s*$/.test(rest)) return `${head}${rest.trimEnd()} ${shown.text}`;
  return null;
}

/** Score criteria answered yes/no by an approved value (for /api/crf/scores). */
export function approvedCriteria(
  form: Record<string, { field_id: string }[]> | undefined,
  approved: ReviewValues,
): Record<string, "yes" | "no"> {
  const result: Record<string, "yes" | "no"> = {};
  for (const rows of Object.values(form ?? {})) {
    for (const row of rows) {
      if (row.field_id === "EAC22" || row.field_id === "SDA25") continue;
      const value = approved?.[row.field_id + "/result"]?.value;
      if (value === "yes" || value === "no") result[row.field_id] = value;
    }
  }
  return result;
}
