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
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import { CrfFormTitle } from "@/components/CrfDossierStatus";
import { UiIcon } from "@/components/UiIcon";
import { useCrfCases } from "@/components/upload/CrfAdminFacts";
import { getSubmissionStatus } from "@/data/crfData";
import { TRANSLATIONS } from "@/data/translations";
import type { CrfField } from "@/lib/crfApproval";
import { parseSlot } from "@/lib/crfSlot";
import { linkedCases, withoutHidden, type CrfViewWithSources } from "@/lib/crfEvidence";
import { dashboardPatient } from "@/lib/doctorDashboard";
import { useWebCaseIdentities, webCaseLabel, type IntakeJob } from "@/lib/webCaseIdentities";
import {
  approvedCriteria,
  cellKey,
  choiceText,
  fillTemplateLine,
  isFieldLine,
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

const scoreCriteriaIds = (form: Record<string, ScoreRow[]> | undefined) =>
  Object.values(form ?? {})
    .flat()
    .map((row) => row.field_id)
    .filter((id) => id !== "EAC22" && id !== "SDA25");

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

function Value({
  field,
  shown,
  withLabel,
  control,
}: {
  field: CrfField;
  shown: Shown | null;
  withLabel: boolean;
  control: React.ReactNode;
}) {
  const component = COMPONENT[field.component];
  const instance = parseSlot(field.slot).instance;
  return (
    <span className={`mr-2 ${instance > 1 ? "block" : "inline-block"} ${blankOnPrint(shown) ? "print:hidden" : ""}`}>
      {instance > 1 && <span>-{instance}: </span>}
      {withLabel && component && <span className="text-xs text-slate-500">{component}: </span>}
      <span className="print:hidden">{control}</span>
      {shown && <span className="hidden font-mono print:inline">{shown.text}</span>}
      {shown && shown.kind !== "approved" && (
        <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
      )}
    </span>
  );
}

function Checkboxes({ spec, shown, onPick }: { spec: CheckboxSpec; shown: Shown | null; onPick: (code: string) => void }) {
  const codes = spec.checkbox_values ?? [];
  const parts = (spec.text ?? "").split("☐");
  return (
    <>
      {parts[0]}
      {codes.map((code, index) => {
        const checked = shown?.value === code;
        return (
          <span key={code} className="mr-2 cursor-pointer" onClick={() => onPick(code)}>
            <UiIcon
              name={checked ? "checked" : "unchecked"}
              className={`inline size-[1em] align-text-bottom ${checked && blankOnPrint(shown) ? "print:hidden" : ""}`}
            />
            {checked && blankOnPrint(shown) && (
              <UiIcon name="unchecked" className="hidden size-[1em] align-text-bottom print:inline" />
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
  const { currentUser, language } = useLupiva();
  const isSpecialist = currentUser?.role === "specialist";
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [intakeJobs, setIntakeJobs] = useState<IntakeJob[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<FormView | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [ana, setAna] = useState<"" | "yes" | "no">("");
  const [summaries, setSummaries] = useState<Record<string, Summary> | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // What the form shows in each cell, editable: starts from the approved value, else the
  // source value, else the proposal. "Lưu / Duyệt" approves every filled cell.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Cells with a source value or proposal not yet decided on "Duyệt hồ sơ".
  const [waiting, setWaiting] = useState(0);
  const { identityByCase } = useWebCaseIdentities(intakeJobs, setError);
  const patientCases = useMemo(() => linkedCases(cases, new Set(identityByCase.keys()), caseId), [cases, identityByCase, caseId]);
  const selectedSubmission = identityByCase.get(caseId);
  const webApproved = !!selectedSubmission && getSubmissionStatus(selectedSubmission.record) === "approved";
  const demographicsIntakes = patientCases.flatMap(({ case_id }) => {
    const submission = identityByCase.get(case_id);
    if (!submission?.pipelineIntakeId) return [];
    const { record } = submission;
    if (dashboardPatient(record.patientName, null, language === "vi").name || (record.gender && record.age.trim())) return [];
    return [submission.pipelineIntakeId];
  });
  const demographicsCases = useCrfCases(demographicsIntakes, intakeJobs);
  const loadVersion = useRef(0);

  const load = useCallback(async (id: string) => {
    const version = ++loadVersion.current;
    setCaseId(id);
    setView(null);
    setSummaries(null);
    setScoreError(null);
    setError(null);
    setNotice(null);
    setLoading(!!id);
    if (!id) return;
    try {
      const raw = withoutHidden(await backend<FormView>("/api/crf", { case_id: id }));
      if (version !== loadVersion.current) return;
      // The form is filled from approved values only: source values and proposals are
      // reviewed on "Duyệt hồ sơ" first. Cells still waiting there are counted, not shown.
      const reviewed = raw.review?.values ?? {};
      setWaiting(
        raw.fields.filter((field) => (field.options.length > 0 || field.proposal) && !reviewed[field.slot]).length,
      );
      const next: FormView = {
        ...raw,
        fields: raw.fields.map((field) => ({ ...field, options: [], proposal: undefined })),
      };
      const initial: Record<string, string> = {};
      for (const field of next.fields) {
        const shown = shownValue(field, next.review?.values);
        if (shown) initial[field.slot] = shown.value;
      }
      setEdits(initial);
      setView(next);
    } catch (reason) {
      if (version === loadVersion.current) setError((reason as Error).message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSpecialist) return;
    let cancelled = false;
    void backend<{ jobs?: IntakeJob[] }>("/api/intakes")
      .then(({ jobs }) => { if (!cancelled) setIntakeJobs(jobs ?? []); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    void backend<{ cases: CaseItem[] }>("/api/summary")
      .then((summary) => {
        if (cancelled) return;
        setCases(summary.cases);
        const initial = new URLSearchParams(window.location.search).get("case") ?? "";
        if (initial && summary.cases.some((item) => item.case_id === initial)) void load(initial);
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [isSpecialist, load]);

  const approved = view?.review?.values;
  const fieldsBySlot = useMemo(() => new Map((view?.fields ?? []).map((field) => [field.slot, field])), [view]);
  const placement = useMemo(
    () =>
      view?.layout
        ? placeFields(view.layout, view.fields, approved, showEmpty, new Set(scoreCriteriaIds(view.score_form)))
        : null,
    [view, approved, showEmpty],
  );

  // Totals from the backend, counting only criteria the doctor has approved.
  useEffect(() => {
    if (!view?.score_form || !caseId) return;
    let cancelled = false;
    const criteria = approvedCriteria(view.score_form, approved);
    backend<{ summaries: Record<string, Summary> }>("/api/crf/scores", undefined, {
      case_id: caseId,
      source_snapshot: view.source_snapshot,
      assessment: { ana, date: view.score_default_date ?? "", criteria },
    })
      .then((report) => {
        if (cancelled) return;
        setSummaries(report.summaries);
        setScoreError(null);
      })
      .catch((reason: Error) => { if (!cancelled) setScoreError(reason.message); });
    return () => { cancelled = true; };
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

  /** The cell's current answer: the doctor's edit if any, with where it came from. */
  const effective = (field: CrfField): Shown | null => {
    const original = shownValue(field, approved);
    if (!(field.slot in edits)) return original;
    const value = edits[field.slot];
    if (!value) return null;
    if (original && original.value === value) return original;
    return { value, text: choiceText(field, value), kind: "approved", origin: "manual_entry" };
  };
  const setEdit = (slot: string, value: string) => setEdits((previous) => ({ ...previous, [slot]: value }));
  const toggle = (slot: string, code: string) =>
    setEdits((previous) => ({ ...previous, [slot]: previous[slot] === code ? "" : code }));
  const controlFor = (field: CrfField) =>
    field.choices.length ? (
      <select
        aria-label={field.label}
        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
        value={edits[field.slot] ?? ""}
        onChange={(event) => setEdit(field.slot, event.target.value)}
      >
        <option value="">—</option>
        {field.choices.map((choice) => (
          <option key={choice.code} value={choice.code}>
            {choice.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        aria-label={field.label}
        className="w-36 rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-xs"
        value={edits[field.slot] ?? ""}
        onChange={(event) => setEdit(field.slot, event.target.value)}
      />
    );
  const shownFor = (slot: string | null | undefined) => {
    const field = slot ? fieldsBySlot.get(slot) : undefined;
    return field ? effective(field) : null;
  };
  const pick = (slot: string | null | undefined) => (code: string) => {
    if (slot) toggle(slot, code);
  };

  // Approve every filled cell: matching draft values by id, other text as typed values,
  // score criteria as the score assessment.
  const save = async () => {
    if (!view) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const scoreIds = new Set(scoreCriteriaIds(view.score_form));
      const selections: Record<string, string> = {};
      const manual: Record<string, string> = {};
      const criteria: Record<string, string> = {};
      for (const field of view.fields) {
        const value = (edits[field.slot] ?? "").trim();
        const { fieldId: fid, instance } = parseSlot(field.slot);
        if (!value || fid === "EAC22" || fid === "SDA25") continue;
        if (instance === 1 && scoreIds.has(fid)) {
          if (value === "yes" || value === "no") criteria[fid] = value;
          continue;
        }
        const option =
          field.options.find((item) => item.value === value) ??
          (field.proposal?.value === value ? field.proposal : undefined) ??
          field.manual_options?.find((item) => item.value === value);
        if (option) selections[field.slot] = option.id;
        else if (!field.choices.length) manual[field.slot] = value;
      }
      const scored = Object.keys(criteria).length > 0 || ana !== "";
      await backend("/api/crf/approve", undefined, {
        case_id: caseId,
        source_snapshot: view.source_snapshot,
        draft_sha256: view.draft_sha256,
        selections,
        manual_values: manual,
        ...(scored ? { score_assessment: { ana, date: view.score_default_date ?? "", criteria } } : {}),
      });
      await load(caseId);
      setNotice(
        `Đã duyệt ${Object.keys(selections).length + Object.keys(manual).length} ô và ${Object.keys(criteria).length} tiêu chí chấm điểm.`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // "SLE: 2019 EULAR/ACR score: Total = ……" and "SLEDAI-2K score: Total = ……".
  const totalFor = (group: "eular" | "sledai") => {
    const saved = approved?.[(group === "eular" ? "EAC22" : "SDA25") + "/result"]?.value;
    if (saved) return { value: saved, note: "" };
    const total = summaries?.[group]?.total;
    return total != null ? { value: String(total), note: "Tính từ các tiêu chí đã duyệt · chưa duyệt tổng" } : null;
  };
  const withTotal = (text: string) => {
    const group = /total\s*=/i.test(text) ? (/eular/i.test(text) ? "eular" : /sledai/i.test(text) ? "sledai" : null) : null;
    const total = group ? totalFor(group) : null;
    if (!total) return text;
    return (
      <>
        {text.replace(/[.…]{3,}\s*$/, "")}
        <span className="font-mono font-semibold">{total.value}</span>
        {total.note && <span className="ml-1 text-[10px] text-amber-700 print:hidden">({total.note})</span>}
      </>
    );
  };

  const renderFields = (fields: CrfField[]) =>
    fields.map((field) => {
      const shown = effective(field);
      return (
        <Value key={field.slot} field={field} shown={shown} withLabel={fields.length > 1} control={controlFor(field)} />
      );
    });

  const renderCell = (block: LayoutBlock, cell: LayoutCell, r: number, c: number) => {
    const k = cellKey(block.index, r, c);
    const placed = placement?.inCell.get(k) ?? [];
    if (placement?.ticks.has(k)) return <UiIcon name="checked" className="inline size-[1em] align-text-bottom" />;
    const criterion = placement?.checks.get(k);
    if (criterion) {
      const shown = effective(criterion);
      const ticked = shown?.value === "yes";
      return (
        <>
          <button
            type="button"
            role="checkbox"
            aria-checked={ticked}
            aria-label={criterion.label}
            className="cursor-pointer"
            title="Bấm để tích / bỏ tích"
            onClick={() => setEdit(criterion.slot, ticked ? "no" : "yes")}
          >
            <UiIcon name={ticked ? "checked" : "unchecked"} className="inline size-[1em] align-text-bottom" />
          </button>
          {ticked && shown && shown.kind !== "approved" && (
            <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
          )}
          {renderFields(placed)}
        </>
      );
    }
    if (cell.checkbox_slot) {
      return <><Checkboxes spec={cell} shown={shownFor(cell.checkbox_slot)} onPick={pick(cell.checkbox_slot)} />{renderFields(placed)}</>;
    }
    if (cell.field_id) return placed.length ? renderFields(placed) : null;
    if (placement?.cleared.has(k)) return <div>{renderFields(placed)}</div>;
    // Write each answer on the template line that prints its label (tick or fill the blanks);
    // only fields whose line cannot take the value are listed under the cell.
    const used = new Set<string>();
    const lines = cell.text.split("\n").map((line, index) => {
      for (const field of placed) {
        if (used.has(field.slot)) continue;
        const shown = effective(field);
        const filled = shown ? fillTemplateLine(line, field, shown) : null;
        const own = isFieldLine(line, field);
        if (own) {
          used.add(field.slot);
          const repeats = placed.filter((item) => {
            const slot = parseSlot(item.slot);
            return slot.instance > 1 && slot.baseSlot === parseSlot(field.slot).baseSlot;
          });
          repeats.forEach((item) => used.add(item.slot));
          const plain = !shown || blankOnPrint(shown) || filled === null;
          return (
            <div key={index} className="whitespace-pre-wrap">
              {plain && <span className="hidden print:inline">{line}</span>}
              <span className={plain ? "print:hidden" : ""}>{filled ?? line}</span>
              <span className="ml-2 print:hidden">{controlFor(field)}</span>
              {shown && shown.kind !== "approved" && (
                <span className={`ml-1 text-[10px] ${NOTE_TONE[shown.kind]} print:hidden`}>({shownNote(shown)})</span>
              )}
              {renderFields(repeats)}
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
          const shown = effective(field);
          const component = COMPONENT[field.component];
          return (
            <div key={field.slot} className="flex flex-wrap gap-x-2">
              <span className="text-slate-700">
                {field.label}
                {component ? ` · ${component}` : ""}:
              </span>
              <Value field={field} shown={shown} withLabel={false} control={controlFor(field)} />
            </div>
          );
        })}
      </div>
    ));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <CrfFormTitle language={language} webApproved={webApproved} />
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label={TRANSLATIONS[language].doctor.dashboard.columns.patient}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={caseId}
            disabled={saving}
            onChange={(event) => {
              setAna("");
              void load(event.target.value);
            }}
          >
            <option value="">{language === "vi" ? "Chọn bệnh nhân…" : "Choose a patient…"}</option>
            {patientCases.map((item) => {
              const submission = identityByCase.get(item.case_id);
              const crf = submission?.pipelineIntakeId ? demographicsCases[submission.pipelineIntakeId] : null;
              const view = crf && "view" in crf && crf.caseId === item.case_id ? crf.view : null;
              return (
                <option key={item.case_id} value={item.case_id}>
                  {submission ? webCaseLabel(submission.record, view, language) : item.registry_code}
                </option>
              );
            })}
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
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Đang lưu…" : "Lưu / Duyệt"}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500 print:hidden">
        Phiếu chỉ điền các giá trị đã duyệt ở Duyệt hồ sơ. Vẫn sửa trực tiếp được: bấm ô để tích, chọn hoặc gõ giá
        trị vào ô, rồi &quot;Lưu / Duyệt&quot;.
      </p>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700 print:hidden">{error}</p>}
      {notice && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700 print:hidden">{notice}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Đang tải phiếu…</p>}
      {view && (
        <p
          className={`mt-3 rounded px-3 py-2 text-sm print:hidden ${
            waiting ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {waiting ? (
            <>
              CHƯA DUYỆT XONG · {counts.approved} ô đã điền vào phiếu, còn {waiting} ô có giá trị đọc từ ảnh hoặc đề
              xuất chờ duyệt.{" "}
              <Link href={`/registry?case=${encodeURIComponent(caseId)}`} className="font-semibold underline">
                Duyệt tiếp ở Duyệt hồ sơ
              </Link>
            </>
          ) : (
            `Đã duyệt xong · ${counts.approved} ô đã điền vào phiếu`
          )}
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
                    {block.checkbox_slot ? (
                      <Checkboxes spec={block} shown={shownFor(block.checkbox_slot)} onPick={pick(block.checkbox_slot)} />
                    ) : (
                      withTotal(block.text ?? "")
                    )}
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
        <article className="mt-6 rounded border border-slate-300 bg-white p-6 text-sm print:hidden">
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
            Tiêu chí EULAR được tích trong bảng của mẫu; SLEDAI-2K chỉ in tổng. Tổng điểm do backend tính từ các tiêu
            chí đã duyệt ở Duyệt hồ sơ. Ngày đánh giá SLEDAI: {view.score_default_date || "—"}.
          </p>
          {scoreError && <p className="mt-2 text-xs text-red-700">{scoreError}</p>}
          {Object.keys(view.score_form).map((group) => {
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
              </div>
            );
          })}
        </article>
      )}
    </main>
  );
}
