"use client";

/**
 * CRF view backed by the Python pipeline (via /api/pipeline). The backend is the
 * source of truth: values read from source documents, LLM or rule proposals,
 * calculated values and blanks come from /api/crf. Nothing is approved
 * automatically; a specialist picks each value (one by one, or by an explicit
 * "tick this section" action) and approves through /api/crf/approve, which
 * re-checks the draft it holds.
 *
 * Layout: fields on the left grouped by the decision they need (values to
 * weigh first, then single source values by section, then the "Chưa rõ"
 * clinical questions collapsed); on the right the source crop of the active
 * field with its date and, when the image size matches, the row box.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import {
  approvalPayload,
  fieldChoices,
  initialSelections,
  type CrfField,
  type FieldChoice,
} from "@/lib/crfApproval";
import {
  caseForIntake,
  evidenceFor,
  optionDate,
  reviewGroup,
  singleSourceSelections,
  type CrfViewWithSources,
  type Evidence,
  type SourceDetail,
  withoutHidden,
} from "@/lib/crfEvidence";

type CaseItem = { case_id: string; registry_code: string };
type ScoreRow = { field_id: string; label: string; weight: number; definition?: string };
type ReviewView = CrfViewWithSources & {
  score_form?: Record<string, ScoreRow[]>;
  model?: string | null;
  job?: { status?: string; error?: string } | null;
  review: (CrfViewWithSources["review"] & { scores?: { assessment?: { ana?: string; date?: string } } }) | null;
};
type Answer = "yes" | "no";
const TOTALS = new Set(["EAC22", "SDA25"]);
type Sources = Record<string, SourceDetail> | undefined;

const COMPONENT: Record<string, string> = {
  result: "",
  intensity: "Cường độ",
  absolute_count: "Số lượng tuyệt đối",
  percentage: "Tỷ lệ %",
  pre_measured: "Trước · giá trị đo",
  pre_percent_predicted: "Trước · % dự đoán",
  titre: "Hiệu giá",
  method: "Phương pháp",
};

const KIND: Record<FieldChoice["kind"], string> = {
  source: "Từ nguồn",
  proposal: "Đề xuất",
  manual: "Bác sĩ chọn",
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

function label(field: CrfField, value: string): string {
  return field.choices.find((choice) => choice.code === value)?.label ?? value;
}

function proposalNote(origin?: string): string {
  if (origin === "calculated") return "Tính từ số đo";
  if (origin === "knowledge_rule") return "Quy tắc đề xuất · chưa duyệt";
  if (origin === "no_evidence") return "Chưa rõ · không có dữ kiện";
  return "LLM đề xuất · chưa duyệt";
}

function choiceText(field: CrfField, choice: FieldChoice, sources: Sources): string {
  const option = choice.kind === "source" ? field.options.find((item) => item.id === choice.id) : undefined;
  const date = option ? optionDate(option, sources) : undefined;
  return `${KIND[choice.kind]}: ${label(field, choice.value)}${date ? ` · ${date}` : ""}`;
}

function SourceImage({ item }: { item: Evidence }) {
  const [matches, setMatches] = useState(false);
  if (!item.imageUrl) return null;
  return (
    <figure className="mt-2">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated backend crop via the proxy */}
        <img
          src={item.imageUrl}
          alt={`Ảnh nguồn ${item.label}`}
          className="block max-h-[60vh] max-w-full rounded border border-slate-200"
          onLoad={(event) => {
            const image = event.currentTarget;
            setMatches(
              !!item.imageSize &&
                image.naturalWidth === item.imageSize[0] &&
                image.naturalHeight === item.imageSize[1],
            );
          }}
        />
        {item.box && matches && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-300/20"
            style={{
              left: `${item.box.left}%`,
              top: `${item.box.top}%`,
              width: `${item.box.width}%`,
              height: `${item.box.height}%`,
            }}
          />
        )}
      </div>
      {item.box && matches && (
        <figcaption className="mt-1 text-xs text-slate-500">Khung vàng: vùng hàng do AI đề xuất, có thể lệch.</figcaption>
      )}
    </figure>
  );
}

function EvidencePanel({ field, sources }: { field: CrfField | null; sources: Sources }) {
  if (!field) {
    return <p className="text-sm text-slate-500">Bấm vào một ô bên trái để xem ảnh nguồn.</p>;
  }
  const component = COMPONENT[field.component] ?? field.component;
  return (
    <div>
      <h3 className="font-medium text-slate-800">
        {field.label}
        {component && <span className="text-slate-400"> · {component}</span>}
      </h3>
      <p className="font-mono text-xs text-slate-400">{field.slot}</p>
      {field.options.map((option, index) => {
        const evidence = evidenceFor(option, sources);
        return (
          <div key={option.id} className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-sm">
              <span className="text-slate-500">Giá trị {field.options.length > 1 ? index + 1 : ""}: </span>
              <span className="font-mono font-semibold">{label(field, option.value)}</span>
            </p>
            {evidence.length === 0 && <p className="text-xs text-slate-500">Không có ảnh nguồn cho giá trị này.</p>}
            {evidence.map((item, n) => (
              <div key={n} className="mt-1">
                <p className="text-xs text-slate-600">
                  Trên phiếu: <span className="font-medium">{item.label || "—"}</span> ={" "}
                  <span className="font-mono">{item.value}</span>
                  {item.date && (
                    <>
                      {" "}
                      · {item.dateKind ?? "ngày"} <span className="font-mono">{item.date}</span>
                    </>
                  )}
                </p>
                <SourceImage item={item} />
              </div>
            ))}
          </div>
        );
      })}
      {field.proposal && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          <p>
            <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono italic">
              {label(field, field.proposal.value)}
            </span>
            <span className="ml-2 text-xs text-amber-800">{proposalNote(field.proposal.origin)}</span>
          </p>
          {field.proposal.reason && <p className="mt-1 text-xs text-slate-600">{field.proposal.reason}</p>}
        </div>
      )}
      {!field.options.length && !field.proposal && <p className="mt-3 text-sm text-slate-500">Hồ sơ chưa có giá trị.</p>}
    </div>
  );
}

function FieldRow({
  field,
  sources,
  canApprove,
  active,
  selected,
  approved,
  onActivate,
  onSelect,
}: {
  field: CrfField;
  sources: Sources;
  canApprove: boolean;
  active: boolean;
  selected: string;
  approved?: string;
  onActivate: () => void;
  onSelect: (id: string) => void;
}) {
  const component = COMPONENT[field.component] ?? field.component;
  const choices = fieldChoices(field);
  const single = reviewGroup(field) === "source";
  const source = field.options[0];
  const date = source ? optionDate(source, sources) : undefined;
  return (
    <div
      id={`slot-${field.slot}`}
      className={`grid cursor-pointer grid-cols-1 gap-1 border-b border-slate-100 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] ${
        active ? "bg-sky-50" : "hover:bg-slate-50"
      }`}
      onClick={onActivate}
    >
      <div className="text-sm text-slate-700">
        {field.label}
        {component && <span className="text-slate-400"> · {component}</span>}
      </div>
      <div className="text-sm">
        {single && canApprove ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Duyệt ${field.label}`}
              checked={selected === source.id}
              onChange={(event) => onSelect(event.target.checked ? source.id : "")}
            />
            <span className="font-mono">{label(field, source.value)}</span>
            {date && <span className="text-xs text-slate-500">{date}</span>}
          </label>
        ) : (
          <div>
            {field.options.length > 1 && (
              <p className="text-xs text-amber-800">
                {field.options.length} giá trị nguồn:{" "}
                {field.options
                  .map((option) => {
                    const when = optionDate(option, sources);
                    return `${label(field, option.value)}${when ? ` (${when})` : ""}`;
                  })
                  .join(" · ")}
              </p>
            )}
            {!field.options.length && field.proposal && (
              <p>
                <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono italic">
                  {label(field, field.proposal.value)}
                </span>
                <span className="ml-2 text-xs text-amber-800">{proposalNote(field.proposal.origin)}</span>
              </p>
            )}
            {canApprove && choices.length > 0 && (
              <select
                aria-label={`Duyệt ${field.label}`}
                className={`mt-1 w-full rounded border px-2 py-1 text-sm ${
                  selected ? "border-emerald-500 bg-emerald-50" : "border-slate-300"
                }`}
                value={selected}
                onChange={(event) => onSelect(event.target.value)}
              >
                <option value="">— Chưa duyệt —</option>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choiceText(field, choice, sources)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {approved && (
          <p className="mt-1 text-xs text-emerald-700">
            Đã duyệt: <span className="font-mono">{label(field, approved)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function bySection(fields: CrfField[]): [string, CrfField[]][] {
  const groups = new Map<string, CrfField[]>();
  for (const field of fields) groups.set(field.section, [...(groups.get(field.section) ?? []), field]);
  return [...groups.entries()];
}

export default function RegistryCrfPage() {
  const { currentUser } = useLupiva();
  const canApprove = currentUser?.role === "specialist";
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<ReviewView | null>(null);
  // Score criteria (EULAR/SLEDAI): the doctor's Có/Không per criterion, approved with the rest.
  const [criteria, setCriteria] = useState<Record<string, Answer>>({});
  const [ana, setAna] = useState<"" | Answer>("");
  const [scoreDate, setScoreDate] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async (id: string) => {
    setCaseId(id);
    setView(null);
    setSelections({});
    setActiveSlot(null);
    setError(null);
    setNotice(null);
    if (!id) return;
    setLoading(true);
    try {
      const next = withoutHidden(await backend<ReviewView>("/api/crf", { case_id: id }));
      const scoreIds = Object.values(next.score_form ?? {}).flat().map((row) => row.field_id);
      const chosen = initialSelections(next);
      const answered: Record<string, Answer> = {};
      for (const fid of scoreIds) {
        delete chosen[fid + "/result"];
        const value = next.review?.values[fid + "/result"]?.value;
        if (!TOTALS.has(fid) && (value === "yes" || value === "no")) answered[fid] = value;
      }
      setView(next);
      setSelections(chosen);
      setCriteria(answered);
      const previous = next.review?.scores?.assessment;
      setAna(previous?.ana === "yes" || previous?.ana === "no" ? previous.ana : "");
      setScoreDate(previous?.date || next.score_default_date || "");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canApprove) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await backend<{ cases: CaseItem[] }>("/api/summary");
        if (cancelled) return;
        setCases(summary.cases);
        // Opened from a submission card: /registry?intake=<job id> or ?case=<case id>.
        const params = new URLSearchParams(window.location.search);
        let initial = params.get("case") ?? "";
        const intake = params.get("intake");
        if (!initial && intake) {
          const listing = await backend<{ jobs?: { job_id?: string; case_id?: string | null }[] }>("/api/intakes");
          initial = caseForIntake(listing.jobs, intake) ?? "";
          if (!initial && !cancelled) {
            setError("Hồ sơ này chưa có phiếu CRF ở backend (intake chưa xong hoặc chưa tạo ca).");
          }
        }
        if (initial && !cancelled && summary.cases.some((item) => item.case_id === initial)) {
          await load(initial);
          // Opened from the CRF form: show that field and its source.
          const slot = params.get("slot");
          if (slot && !cancelled) {
            setActiveSlot(slot);
            setTimeout(() => document.getElementById(`slot-${slot}`)?.scrollIntoView({ block: "center" }), 50);
          }
        }
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canApprove, load]);

  const approve = useCallback(async () => {
    if (!view) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const scored = Object.keys(criteria).length > 0 || ana !== "";
      const anyField = Object.values(selections).some(Boolean);
      const payload =
        anyField || !scored
          ? approvalPayload(caseId, view, selections)
          : { case_id: caseId, source_snapshot: view.source_snapshot, draft_sha256: view.draft_sha256, selections: {} };
      await backend("/api/crf/approve", undefined, {
        ...payload,
        ...(scored ? { score_assessment: { ana, date: scoreDate, criteria } } : {}),
      });
      const count = Object.keys(payload.selections).length + Object.keys(criteria).length;
      await load(caseId);
      setNotice(`Đã duyệt ${count} ô.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }, [caseId, view, selections, criteria, ana, scoreDate, load]);

  // Ask the backend LLM to answer the clinical questions from labs, report notes and
  // printed diagnoses; proposals arrive as "LLM đề xuất · chưa duyệt".
  const draftClinical = useCallback(async () => {
    if (!caseId) return;
    setError(null);
    setNotice(null);
    setDrafting(true);
    try {
      await backend("/api/crf/generate", undefined, { case_id: caseId });
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const next = await backend<CrfViewWithSources & { job?: { status?: string; error?: string } }>("/api/crf", {
          case_id: caseId,
        });
        if (next.job?.status !== "running") {
          if (next.job?.status === "failed") throw new Error(next.job.error ?? "Không tạo được đề xuất.");
          await load(caseId);
          setNotice("Đã tạo đề xuất LLM cho các câu lâm sàng; xem mục Cần bác sĩ quyết định.");
          return;
        }
      }
      throw new Error("Tạo đề xuất quá lâu; tải lại trang sau.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDrafting(false);
    }
  }, [caseId, load]);

  // No draft yet for this case: create the LLM proposals without being asked.
  const autoDrafted = useRef(new Set<string>());
  useEffect(() => {
    if (!view || !caseId || !canApprove || drafting || view.model || view.job?.status === "running") return;
    if (autoDrafted.current.has(caseId)) return;
    autoDrafted.current.add(caseId);
    void draftClinical();
  }, [view, caseId, canApprove, drafting, draftClinical]);

  const fieldBySlot = useMemo(() => new Map((view?.fields ?? []).map((field) => [field.slot, field])), [view]);
  const acceptScoreProposals = () =>
    setCriteria((previous) => {
      const next = { ...previous };
      for (const row of Object.values(view?.score_form ?? {}).flat()) {
        const value = fieldBySlot.get(row.field_id + "/result")?.proposal?.value;
        if (!TOTALS.has(row.field_id) && !next[row.field_id] && (value === "yes" || value === "no")) {
          next[row.field_id] = value;
        }
      }
      return next;
    });

  const groups = useMemo(() => {
    // Score criteria are answered in their own section, not in the field lists.
    const scoreSlots = new Set(Object.values(view?.score_form ?? {}).flat().map((row) => row.field_id + "/result"));
    const fields = (view?.fields ?? []).filter((field) => !scoreSlots.has(field.slot));
    const approved = view?.review?.values ?? {};
    const pick = (group: string) => fields.filter((field) => reviewGroup(field) === group);
    return {
      decide: pick("decide"),
      source: bySection(pick("source")),
      unknown: pick("unknown"),
      empty: bySection(pick("empty").filter((field) => showEmpty || approved[field.slot])),
    };
  }, [view, showEmpty]);

  const counts = useMemo(
    () => ({
      total: view?.fields.length ?? 0,
      decide: groups.decide.length,
      source: groups.source.reduce((sum, [, list]) => sum + list.length, 0),
      unknown: groups.unknown.length,
      approved: Object.keys(view?.review?.values ?? {}).length,
      selected: Object.values(selections).filter(Boolean).length + Object.keys(criteria).length,
    }),
    [view, groups, selections, criteria],
  );

  const activeField = useMemo(
    () => view?.fields.find((field) => field.slot === activeSlot) ?? null,
    [view, activeSlot],
  );

  const select = (slot: string, id: string) => setSelections((previous) => ({ ...previous, [slot]: id }));
  const tickAll = (fields: CrfField[]) => setSelections((previous) => ({ ...previous, ...singleSourceSelections(fields) }));
  const untickAll = (fields: CrfField[]) =>
    setSelections((previous) => {
      const next = { ...previous };
      for (const field of fields) delete next[field.slot];
      return next;
    });

  const rows = (fields: CrfField[]) =>
    fields.map((field) => (
      <FieldRow
        key={field.slot}
        field={field}
        sources={view?.sources}
        canApprove={canApprove}
        active={field.slot === activeSlot}
        selected={selections[field.slot] ?? ""}
        approved={view?.review?.values[field.slot]?.value}
        onActivate={() => setActiveSlot(field.slot)}
        onSelect={(id) => select(field.slot, id)}
      />
    ));

  if (currentUser && !canApprove) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">Trang phiếu CRF chỉ dành cho bác sĩ.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-800">Duyệt hồ sơ</h1>
      <p className="mt-1 text-sm text-slate-500">
        Giá trị đọc từ ảnh và đề xuất đều chờ bác sĩ duyệt. Không ô nào được chọn sẵn; bấm một ô để xem ảnh nguồn,
        tích từng ô hoặc dùng &quot;Tích cả mục&quot; sau khi đã đối chiếu.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          Hiện cả các ô trống
        </label>
        {view && canApprove && (
          <button
            type="button"
            disabled={drafting}
            onClick={() => void draftClinical()}
            className="rounded border border-amber-600 px-2 py-1 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
          >
            {drafting ? "Đang tạo đề xuất…" : "Tạo đề xuất LLM"}
          </button>
        )}
        {view && (
          <span className="text-xs text-slate-500">
            {counts.decide} ô cần quyết định · {counts.source} giá trị đọc từ ảnh · {counts.unknown} câu chưa rõ ·{" "}
            {counts.approved} ô đã duyệt · {counts.total} ô CRF
          </span>
        )}
      </div>
      {view?.review && (
        <p className="mt-3 text-xs text-slate-500">
          Lượt duyệt gần nhất: {view.review.reviewer?.name ?? "—"} ·{" "}
          {new Date(view.review.reviewed_at).toLocaleString("vi-VN")}
        </p>
      )}
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Đang tải phiếu…</p>}

      {view && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {groups.decide.length > 0 && (
              <section className="rounded border border-amber-300 bg-white p-4">
                <h2 className="font-medium text-slate-800">Cần bác sĩ quyết định ({groups.decide.length})</h2>
                <p className="mb-2 text-xs text-slate-500">
                  Nhiều giá trị nguồn (thường là các lần xét nghiệm khác ngày) hoặc giá trị do quy tắc, LLM hay phép tính
                  đề xuất.
                </p>
                {rows(groups.decide)}
              </section>
            )}
            {groups.source.map(([section, fields]) => (
              <section key={section} className="mt-5 rounded border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-slate-800">
                    {section} <span className="text-sm font-normal text-slate-500">({fields.length})</span>
                  </h2>
                  {canApprove && (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded border border-emerald-600 px-2 py-1 text-emerald-800 hover:bg-emerald-50"
                        onClick={() => tickAll(fields)}
                      >
                        Tích cả mục
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                        onClick={() => untickAll(fields)}
                      >
                        Bỏ tích
                      </button>
                    </div>
                  )}
                </div>
                {rows(fields)}
              </section>
            ))}
            {view.score_form && (
              <section className="mt-5 rounded border border-indigo-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-slate-800">Chấm điểm EULAR/ACR 2019 và SLEDAI-2K</h2>
                  {canApprove && (
                    <button
                      type="button"
                      className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-900 hover:bg-amber-50"
                      onClick={acceptScoreProposals}
                    >
                      Nhận các đề xuất
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    ANA ≥ 1:80 (tiêu chí vào EULAR)
                    <select
                      className="rounded border border-slate-300 px-2 py-1"
                      value={ana}
                      disabled={!canApprove}
                      onChange={(event) => setAna(event.target.value as "" | Answer)}
                    >
                      <option value="">Chưa xác nhận</option>
                      <option value="yes">Có</option>
                      <option value="no">Không</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Ngày đánh giá SLEDAI
                    <input
                      type="date"
                      className="rounded border border-slate-300 px-2 py-1"
                      value={scoreDate.slice(0, 10)}
                      disabled={!canApprove}
                      onChange={(event) => setScoreDate(event.target.value)}
                    />
                  </label>
                </div>
                {Object.entries(view.score_form).map(([group, scoreRows]) => (
                  <details key={group} className="mt-3" open>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      {group === "eular" ? "EULAR/ACR 2019" : "SLEDAI-2K"} ·{" "}
                      {scoreRows.filter((row) => criteria[row.field_id]).length}/
                      {scoreRows.filter((row) => !TOTALS.has(row.field_id)).length} tiêu chí đã chọn
                    </summary>
                    {scoreRows
                      .filter((row) => !TOTALS.has(row.field_id))
                      .map((row) => {
                        const slot = row.field_id + "/result";
                        const proposal = fieldBySlot.get(slot)?.proposal;
                        const approvedValue = view.review?.values[slot]?.value;
                        return (
                          <div
                            key={row.field_id}
                            id={`slot-${slot}`}
                            className={`grid cursor-pointer grid-cols-1 gap-1 border-b border-slate-100 px-2 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] ${
                              slot === activeSlot ? "bg-sky-50" : "hover:bg-slate-50"
                            }`}
                            onClick={() => setActiveSlot(slot)}
                          >
                            <div className="text-slate-700" title={row.definition}>
                              {row.label} <span className="font-mono text-xs text-slate-400">({row.weight})</span>
                            </div>
                            <div>
                              <select
                                aria-label={`Chấm ${row.label}`}
                                disabled={!canApprove}
                                className={`rounded border px-2 py-1 text-sm ${
                                  criteria[row.field_id] ? "border-emerald-500 bg-emerald-50" : "border-slate-300"
                                }`}
                                value={criteria[row.field_id] ?? ""}
                                onChange={(event) =>
                                  setCriteria((previous) => {
                                    const next = { ...previous };
                                    if (event.target.value) next[row.field_id] = event.target.value as Answer;
                                    else delete next[row.field_id];
                                    return next;
                                  })
                                }
                              >
                                <option value="">— Chưa chấm —</option>
                                <option value="yes">Có</option>
                                <option value="no">Không</option>
                              </select>
                              {proposal && (proposal.value === "yes" || proposal.value === "no") && (
                                <span className="ml-2 text-xs text-amber-800">
                                  {proposalNote(proposal.origin)}: {proposal.value === "yes" ? "Có" : "Không"}
                                </span>
                              )}
                              {approvedValue && (
                                <span className="ml-2 text-xs text-emerald-700">
                                  Đã duyệt: {approvedValue === "yes" ? "Có" : approvedValue === "no" ? "Không" : approvedValue}
                                </span>
                              )}
                              {proposal?.reason && <p className="text-xs text-slate-500">{proposal.reason}</p>}
                            </div>
                          </div>
                        );
                      })}
                  </details>
                ))}
              </section>
            )}
            {groups.unknown.length > 0 && (
              <details
                className="mt-5 rounded border border-slate-200 bg-white p-4"
                open={groups.unknown.some((field) => field.slot === activeSlot) || undefined}
              >
                <summary className="cursor-pointer font-medium text-slate-800">
                  Câu hỏi lâm sàng chưa có dữ kiện ({groups.unknown.length})
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    nháp &quot;Chưa rõ&quot;; không cần duyệt để lưu các ô khác
                  </span>
                </summary>
                <div className="mt-2">{rows(groups.unknown)}</div>
              </details>
            )}
            {groups.empty.map(([section, fields]) => (
              <section key={`empty-${section}`} className="mt-5 rounded border border-slate-200 bg-white p-4">
                <h2 className="mb-2 font-medium text-slate-500">{section} · ô trống</h2>
                {rows(fields)}
              </section>
            ))}
          </div>
          <aside className="min-w-0">
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-auto rounded border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Nguồn</h2>
              <EvidencePanel field={activeField} sources={view.sources} />
            </div>
          </aside>
        </div>
      )}

      {view && canApprove && (
        <div className="sticky bottom-0 mt-5 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 py-3">
          <span className="text-sm text-slate-600">{counts.selected} ô sẽ vào lượt duyệt</span>
          <button
            type="button"
            disabled={saving || !counts.selected}
            onClick={approve}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Đang duyệt…" : "Duyệt các ô đã chọn"}
          </button>
        </div>
      )}
    </main>
  );
}
