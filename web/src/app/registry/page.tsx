"use client";

/**
 * CRF view backed by the Python pipeline (via /api/pipeline). The backend is the
 * source of truth: values read from source documents, LLM or rule proposals,
 * calculated values and blanks come from /api/crf. Nothing is approved
 * automatically; a specialist picks each value and approves through
 * /api/crf/approve, which re-checks the draft it holds.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import {
  approvalPayload,
  fieldChoices,
  initialSelections,
  type CrfField,
  type CrfView,
  type FieldChoice,
} from "@/lib/crfApproval";

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

function FieldRow({
  field,
  canApprove,
  selected,
  approved,
  onSelect,
}: {
  field: CrfField;
  canApprove: boolean;
  selected: string;
  approved?: string;
  onSelect: (id: string) => void;
}) {
  const source = field.options[0];
  const proposal = !source ? field.proposal : undefined;
  const component = COMPONENT[field.component] ?? field.component;
  const choices = fieldChoices(field);
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
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Từ nguồn</span>
          </div>
        )}
        {proposal && (
          <div>
            <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono italic">
              {label(field, proposal.value)}
            </span>
            <span className="ml-2 text-xs text-amber-800">{proposalNote(proposal.origin)}</span>
            {proposal.reason && <p className="mt-1 text-xs text-slate-500">{proposal.reason}</p>}
          </div>
        )}
        {!source && !proposal && !canApprove && <span className="text-slate-400">—</span>}
        {approved && (
          <p className="mt-1 text-xs text-emerald-700">
            Đã duyệt: <span className="font-mono">{label(field, approved)}</span>
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
                {KIND[choice.kind]}: {label(field, choice.value)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function RegistryCrfPage() {
  const { currentUser } = useLupiva();
  const canApprove = currentUser?.role === "specialist";
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<CrfView | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canApprove) return;
    backend<{ cases: CaseItem[] }>("/api/summary")
      .then((summary) => setCases(summary.cases))
      .catch((reason: Error) => setError(reason.message));
  }, [canApprove]);

  const load = useCallback(async (id: string) => {
    setCaseId(id);
    setView(null);
    setSelections({});
    setError(null);
    setNotice(null);
    if (!id) return;
    setLoading(true);
    try {
      const next = await backend<CrfView>("/api/crf", { case_id: id });
      setView(next);
      setSelections(initialSelections(next));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async () => {
    if (!view) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const payload = approvalPayload(caseId, view, selections);
      await backend("/api/crf/approve", undefined, payload);
      const count = Object.keys(payload.selections).length;
      await load(caseId);
      setNotice(`Đã duyệt ${count} ô.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }, [caseId, view, selections, load]);

  const sections = useMemo(() => {
    const groups = new Map<string, CrfField[]>();
    for (const field of view?.fields ?? []) {
      if (!showEmpty && !field.options.length && !field.proposal && !view?.review?.values[field.slot]) continue;
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
      approved: Object.keys(view?.review?.values ?? {}).length,
      selected: Object.values(selections).filter(Boolean).length,
    };
  }, [view, selections]);

  if (currentUser && !canApprove) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">Trang phiếu CRF chỉ dành cho bác sĩ.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-800">Phiếu CRF theo dữ liệu backend</h1>
      <p className="mt-1 text-sm text-slate-500">
        Giá trị đọc từ hồ sơ và đề xuất LLM đều chờ bác sĩ duyệt. Không ô nào được chọn sẵn; chỉ các ô bác sĩ chọn
        mới vào lượt duyệt.
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
            {counts.source} ô có giá trị nguồn · {counts.proposal} ô có đề xuất · {counts.approved} ô đã duyệt ·{" "}
            {counts.total} ô CRF
          </span>
        )}
      </div>
      {view?.review && (
        <p className="mt-3 text-xs text-slate-500">
          Lượt duyệt gần nhất: {view.review.reviewer?.name ?? "—"} · {new Date(view.review.reviewed_at).toLocaleString("vi-VN")}
        </p>
      )}
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Đang tải phiếu…</p>}
      {sections.map(([section, fields]) => (
        <section key={section} className="mt-5 rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-slate-800">{section}</h2>
          {fields.map((field) => (
            <FieldRow
              key={field.slot}
              field={field}
              canApprove={canApprove}
              selected={selections[field.slot] ?? ""}
              approved={view?.review?.values[field.slot]?.value}
              onSelect={(id) => setSelections((previous) => ({ ...previous, [field.slot]: id }))}
            />
          ))}
        </section>
      ))}
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
