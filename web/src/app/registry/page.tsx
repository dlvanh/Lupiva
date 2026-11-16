"use client";

/**
 * CRF view backed by the Python pipeline (via /api/pipeline). The backend is the
 * source of truth: values read from source documents, LLM or rule proposals
 * (never approved here), calculated values and blanks come from /api/crf.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type Option = { id: string; value: string; sources?: unknown[] };
type Proposal = { id: string; value: string; reason?: string; origin?: string; requires_confirmation?: boolean };
type Field = {
  slot: string;
  label: string;
  section: string;
  component: string;
  choices: { code: string; label: string }[];
  options: Option[];
  proposal?: Proposal;
};
type CrfView = { fields: Field[]; review: unknown | null; score_default_date?: string };
type CaseItem = { case_id: string; registry_code: string };

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

async function backend<T>(path: string, query?: Record<string, string>): Promise<T> {
  const url = "/api/pipeline" + path + (query ? "?" + new URLSearchParams(query).toString() : "");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function label(field: Field, value: string): string {
  return field.choices.find((choice) => choice.code === value)?.label ?? value;
}

function FieldRow({ field }: { field: Field }) {
  const source = field.options[0];
  const proposal = !source ? field.proposal : undefined;
  const component = COMPONENT[field.component] ?? field.component;
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="text-sm text-slate-700">
        {field.label}
        {component && <span className="text-slate-400"> · {component}</span>}
      </div>
      <div className="text-sm">
        {source && (
          <div>
            <span className="font-mono">{label(field, source.value)}</span>
            {field.options.length > 1 && (
              <span className="ml-2 text-xs text-amber-700">+{field.options.length - 1} giá trị nguồn khác</span>
            )}
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Từ nguồn · chờ duyệt</span>
          </div>
        )}
        {proposal && (
          <div>
            <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono italic">
              {label(field, proposal.value)}
            </span>
            <span className="ml-2 text-xs text-amber-800">
              {proposal.origin === "calculated" ? "Tính từ số đo" : "LLM đề xuất · chưa duyệt"}
            </span>
            {proposal.reason && <p className="mt-1 text-xs text-slate-500">{proposal.reason}</p>}
          </div>
        )}
        {!source && !proposal && <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}

export default function RegistryCrfPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<CrfView | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    backend<{ cases: CaseItem[] }>("/api/summary")
      .then((summary) => setCases(summary.cases))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const load = useCallback(async (id: string) => {
    setCaseId(id);
    setView(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      setView(await backend<CrfView>("/api/crf", { case_id: id }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sections = useMemo(() => {
    const groups = new Map<string, Field[]>();
    for (const field of view?.fields ?? []) {
      if (!showEmpty && !field.options.length && !field.proposal) continue;
      groups.set(field.section, [...(groups.get(field.section) ?? []), field]);
    }
    return [...groups.entries()];
  }, [view, showEmpty]);

  const counts = useMemo(() => {
    const fields = view?.fields ?? [];
    return {
      total: fields.length,
      source: fields.filter((field) => field.options.length).length,
      proposal: fields.filter((field) => !field.options.length && field.proposal).length,
    };
  }, [view]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-800">Phiếu CRF theo dữ liệu backend</h1>
      <p className="mt-1 text-sm text-slate-500">
        Giá trị đọc từ hồ sơ và đề xuất LLM đều chờ bác sĩ duyệt. Trang này không tự duyệt ô nào.
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
        {view && (
          <span className="text-xs text-slate-500">
            {counts.source} ô có giá trị nguồn · {counts.proposal} ô có đề xuất · {counts.total} ô CRF
          </span>
        )}
      </div>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Đang tải phiếu…</p>}
      {sections.map(([section, fields]) => (
        <section key={section} className="mt-5 rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-slate-800">{section}</h2>
          {fields.map((field) => (
            <FieldRow key={field.slot} field={field} />
          ))}
        </section>
      ))}
    </main>
  );
}
