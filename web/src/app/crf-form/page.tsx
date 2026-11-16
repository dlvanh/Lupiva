"use client";

/**
 * "Phiếu CRF": the backend CRF laid out like the Word template and filled with
 * answers (approved value, else source value, else the proposal itself) plus a
 * note outside each cell on where the answer came from. Read-only: a doctor
 * changes a value on "Duyệt hồ sơ" (/registry); clicking a value opens it there.
 * Score totals come from the backend (/api/crf/scores, compute only) using the
 * approved criteria.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import type { CrfField } from "@/lib/crfApproval";
import { withoutHidden, type CrfViewWithSources } from "@/lib/crfEvidence";
import {
  approvedCriteria,
  cellKey,
  fillTemplateLine,
  placeFields,
  shownNote,
  shownValue,
  type LayoutBlock,
  type LayoutCell,
  type Shown,
} from "@/lib/crfForm";

type CaseItem = { case_id: string; registry_code: string };
type ScoreRow = { field_id: string; label: string; weight: number; definition?: string };
type FormView = CrfViewWithSources & {
  layout?: LayoutBlock[];
  score_form?: Record<string, ScoreRow[]>;
};
type Summary = { total: number | null; missing: number; classification?: string };
type CheckboxSpec = { text?: string; checkbox_values?: string[] };

const COMPONENT: Record<string, string> = {
  intensity: "Cường độ",
  absolute_count: "SL tuyệt đối",
  percentage: "%",
  pre_measured: "Trước · đo",
  pre_percent_predicted: "Trước · % dự đoán",
  post_measured: "Sau · đo",
  post_percent_predicted: "Sau · % dự đoán",
  titre: "Hiệu giá",
  method: "Phương pháp",
};

/** "Chưa rõ" is shown on screen but printed as a blank, like an unanswered paper form. */
const blankOnPrint = (shown: Shown | null) => shown?.value === "unknown";

const NOTE_TONE: Record<Shown["kind"], string> = {
  approved: "text-emerald-700",
  source: "text-slate-500",
  proposal: "text-amber-700",
};

async function backend<T>(path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
  const url = "/api/pipeline" + path + (query ? "?" + new URLSearchParams(query).toString() : "");
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function Value({ field, shown, caseId, withLabel }: { field: CrfField; shown: Shown; caseId: string; withLabel: boolean }) {
  const component = COMPONENT[field.component];
  return (
    <span className={`mr-2 inline-block ${blankOnPrint(shown) ? "print:hidden" : ""}`}>
      {withLabel && component && <span className="text-xs text-slate-500">{component}: </span>}
      <Link
        href={`/registry?case=${encodeURIComponent(caseId)}&slot=${encodeURIComponent(field.slot)}`}
        className={`font-mono font-semibold hover:underline ${shown.kind === "proposal" ? "italic" : ""}`}
        title="Mở ô này ở Duyệt hồ sơ"
      >
        {shown.text}
      </Link>
      <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
    </span>
  );
}

function Checkboxes({ spec, shown }: { spec: CheckboxSpec; shown: Shown | null }) {
  const codes = spec.checkbox_values ?? [];
  const parts = (spec.text ?? "").split("☐");
  return (
    <>
      {parts[0]}
      {codes.map((code, index) => {
        const checked = shown?.value === code;
        return (
          <span key={code} className="mr-2">
            {checked && !blankOnPrint(shown) ? "☑" : checked ? (
              <>
                <span className="print:hidden">☑</span>
                <span className="hidden print:inline">☐</span>
              </>
            ) : (
              "☐"
            )}
            {parts[index + 1] ?? ""}
            {checked && shown && shown.kind !== "approved" && (
              <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
            )}
          </span>
        );
      })}
    </>
  );
}

export default function CrfFormPage() {
  const { currentUser } = useLupiva();
  const isSpecialist = currentUser?.role === "specialist";
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<FormView | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [ana, setAna] = useState<"" | "yes" | "no">("");
  const [summaries, setSummaries] = useState<Record<string, Summary> | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    setCaseId(id);
    setView(null);
    setSummaries(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      setView(withoutHidden(await backend<FormView>("/api/crf", { case_id: id })));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSpecialist) return;
    backend<{ cases: CaseItem[] }>("/api/summary")
      .then(async (summary) => {
        setCases(summary.cases);
        const initial = new URLSearchParams(window.location.search).get("case") ?? "";
        if (initial && summary.cases.some((item) => item.case_id === initial)) await load(initial);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [isSpecialist, load]);

  const approved = view?.review?.values;
  const fieldsBySlot = useMemo(() => new Map((view?.fields ?? []).map((field) => [field.slot, field])), [view]);
  const placement = useMemo(
    () => (view?.layout ? placeFields(view.layout, view.fields, approved, showEmpty) : null),
    [view, approved, showEmpty],
  );

  // Totals from the backend, counting only criteria the doctor has approved.
  useEffect(() => {
    if (!view?.score_form || !caseId) return;
    const criteria = approvedCriteria(view.score_form, approved);
    backend<{ summaries: Record<string, Summary> }>("/api/crf/scores", undefined, {
      case_id: caseId,
      source_snapshot: view.source_snapshot,
      assessment: { ana, date: view.score_default_date ?? "", criteria },
    })
      .then((report) => {
        setSummaries(report.summaries);
        setScoreError(null);
      })
      .catch((reason: Error) => setScoreError(reason.message));
  }, [view, approved, ana, caseId]);

  const counts = useMemo(() => {
    const shown = (view?.fields ?? []).map((field) => shownValue(field, approved)).filter(Boolean) as Shown[];
    return {
      approved: shown.filter((item) => item.kind === "approved").length,
      pending: shown.filter((item) => item.kind !== "approved").length,
    };
  }, [view, approved]);

  if (currentUser && !isSpecialist) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">Phiếu CRF chỉ dành cho bác sĩ.</p>
      </main>
    );
  }

  const shownFor = (slot: string | null | undefined) => {
    const field = slot ? fieldsBySlot.get(slot) : undefined;
    return field ? shownValue(field, approved) : null;
  };

  const renderFields = (fields: CrfField[]) =>
    fields.map((field) => {
      const shown = shownValue(field, approved);
      return shown ? (
        <Value key={field.slot} field={field} shown={shown} caseId={caseId} withLabel={fields.length > 1} />
      ) : (
        <span key={field.slot} className="text-slate-300">
          —
        </span>
      );
    });

  const renderCell = (block: LayoutBlock, cell: LayoutCell, r: number, c: number) => {
    const k = cellKey(block.index, r, c);
    const placed = placement?.inCell.get(k) ?? [];
    if (placement?.ticks.has(k)) return "☑";
    if (cell.checkbox_slot) return <Checkboxes spec={cell} shown={shownFor(cell.checkbox_slot)} />;
    if (cell.field_id) return placed.length ? renderFields(placed) : null;
    if (placement?.cleared.has(k)) return <div>{renderFields(placed)}</div>;
    // Write each answer on the template line that prints its label (tick or fill the blanks);
    // only fields whose line cannot take the value are listed under the cell.
    const used = new Set<string>();
    const lines = cell.text.split("\n").map((line, index) => {
      for (const field of placed) {
        if (used.has(field.slot)) continue;
        const shown = shownValue(field, approved);
        const filled = shown ? fillTemplateLine(line, field, shown) : null;
        if (filled !== null && shown) {
          used.add(field.slot);
          return (
            <div key={index} className="whitespace-pre-wrap">
              {blankOnPrint(shown) && <span className="hidden print:inline">{line}</span>}
              <Link
                href={`/registry?case=${encodeURIComponent(caseId)}&slot=${encodeURIComponent(field.slot)}`}
                className={`hover:underline ${blankOnPrint(shown) ? "print:hidden" : ""}`}
                title="Mở ô này ở Duyệt hồ sơ"
              >
                {filled}
              </Link>
              <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
            </div>
          );
        }
      }
      return (
        <div key={index} className="whitespace-pre-wrap">
          {line}
        </div>
      );
    });
    const rest = placed.filter((field) => !used.has(field.slot));
    return (
      <>
        {lines}
        {rest.length > 0 && <div>{renderFields(rest)}</div>}
      </>
    );
  };

  const afterBlock = (index: number) =>
    (placement?.after.get(index) ?? []).map((group) => (
      <div key={`${index}-${group.section}`} className="my-2 rounded border border-dashed border-slate-300 p-2 text-sm">
        <p className="mb-1 text-xs font-semibold text-slate-500">{group.section}</p>
        {group.fields.map((field) => {
          const shown = shownValue(field, approved);
          const component = COMPONENT[field.component];
          return (
            <div key={field.slot} className="flex flex-wrap gap-x-2">
              <span className="text-slate-700">
                {field.label}
                {component ? ` · ${component}` : ""}:
              </span>
              {shown ? (
                <Value field={field} shown={shown} caseId={caseId} withLabel={false} />
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
          );
        })}
      </div>
    ));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold text-slate-800">Phiếu CRF</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Bệnh nhân"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={caseId}
            onChange={(event) => load(event.target.value)}
          >
            <option value="">Chọn bệnh nhân…</option>
            {cases.map((item) => (
              <option key={item.case_id} value={item.case_id}>
                {item.registry_code}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} />
            Hiện cả ô trống
          </label>
          {view && (
            <>
              <Link
                href={`/registry?case=${encodeURIComponent(caseId)}`}
                className="rounded border border-teal-700 px-3 py-1 text-sm text-teal-800 hover:bg-teal-50"
              >
                Sửa ở Duyệt hồ sơ
              </Link>
              <button type="button" onClick={() => window.print()} className="rounded bg-slate-800 px-3 py-1 text-sm text-white">
                In / Lưu PDF
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500 print:hidden">
        Phiếu tự điền từ Duyệt hồ sơ: ô đã duyệt in giá trị đã duyệt; ô chưa duyệt in giá trị nguồn hoặc giá trị đề
        xuất, kèm ghi chú bên ngoài ô. Bấm vào một giá trị để mở ô đó ở Duyệt hồ sơ.
      </p>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Đang tải phiếu…</p>}
      {view && (
        <p
          className={`mt-3 rounded px-3 py-2 text-sm print:hidden ${
            counts.pending ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {counts.pending
            ? `BẢN NHÁP – CHƯA DUYỆT ĐỦ · ${counts.approved} ô đã duyệt, ${counts.pending} ô còn là giá trị nguồn hoặc đề xuất`
            : `Đã duyệt ${counts.approved} ô`}
        </p>
      )}

      {view?.layout && placement && (
        <article className="mt-4 space-y-2 rounded border border-slate-300 bg-white p-6 text-sm leading-relaxed print:border-0 print:p-0">
          {afterBlock(0)}
          {view.layout.map((block) => (
            <section key={block.index}>
              {!block.rows ? (
                block.index === 1 ? (
                  <h2 className="text-center text-base font-bold">{block.text}</h2>
                ) : (
                  <p className="whitespace-pre-line">
                    {block.checkbox_slot ? <Checkboxes spec={block} shown={shownFor(block.checkbox_slot)} /> : block.text}
                  </p>
                )
              ) : (
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {block.rows.map((cells, r) => (
                      <tr key={r}>
                        {cells.map((cell, c) => (
                          <td
                            key={c}
                            colSpan={cell.span ?? 1}
                            rowSpan={cell.row_span ?? 1}
                            className="border border-slate-400 px-1.5 py-1 align-top"
                          >
                            {renderCell(block, cell, r, c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {afterBlock(block.index)}
            </section>
          ))}
        </article>
      )}

      {view?.score_form && (
        <article className="mt-6 rounded border border-slate-300 bg-white p-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Chấm điểm EULAR/ACR 2019 và SLEDAI-2K</h2>
            <label className="flex items-center gap-2 text-sm print:hidden">
              Tiêu chí vào ANA ≥ 1:80
              <select
                className="rounded border border-slate-300 px-2 py-1"
                value={ana}
                onChange={(event) => setAna(event.target.value as "" | "yes" | "no")}
              >
                <option value="">Chưa xác nhận</option>
                <option value="yes">Có</option>
                <option value="no">Không</option>
              </select>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Mỗi tiêu chí in giá trị đã duyệt, hoặc giá trị đề xuất kèm ghi chú. Tổng điểm do backend tính, chỉ từ các
            tiêu chí đã duyệt. Ngày đánh giá SLEDAI: {view.score_default_date || "—"}.
          </p>
          {scoreError && <p className="mt-2 text-xs text-red-700">{scoreError}</p>}
          {Object.entries(view.score_form).map(([group, rows]) => {
            const summary = summaries?.[group];
            return (
              <div key={group} className="mt-4">
                <h3 className="font-semibold">
                  {group === "eular" ? "EULAR/ACR 2019" : "SLEDAI-2K"} ·{" "}
                  {summary?.total != null ? (
                    <span className="font-mono">{summary.total} điểm</span>
                  ) : (
                    <span className="text-amber-700 print:hidden">
                      chưa đủ để tính{summary ? ` (còn ${summary.missing} tiêu chí chưa duyệt)` : ""}
                    </span>
                  )}
                </h3>
                <table className="mt-1 w-full border-collapse text-xs">
                  <tbody>
                    {rows
                      .filter((row) => row.field_id !== "EAC22" && row.field_id !== "SDA25")
                      .map((row) => {
                        const field = fieldsBySlot.get(row.field_id + "/result");
                        const shown = field ? shownValue(field, approved) : null;
                        return (
                          <tr key={row.field_id}>
                            <td className="border border-slate-300 px-1.5 py-1">{row.label}</td>
                            <td className="w-12 border border-slate-300 px-1.5 py-1 text-center font-mono">{row.weight}</td>
                            <td className="border border-slate-300 px-1.5 py-1">
                              {field && shown ? (
                                <Value field={field} shown={shown} caseId={caseId} withLabel={false} />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </article>
      )}
    </main>
  );
}
