"use client";

/**
 * Age, gender, height, weight, BMI, ICF date, Physician and Nurse of a submission,
 * read from the backend CRF (ADM02–ADM09): the approved value, else the value read
 * from the images or the proposal, marked "chưa duyệt". Each value links to its cell
 * on "Duyệt hồ sơ" (/registry), where the doctor ticks it or types a correction.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CrfField, CrfView } from "@/lib/crfApproval";
import { caseForIntake } from "@/lib/crfEvidence";
import { shownValue, type Shown } from "@/lib/crfForm";

const FACTS: { id: string; label: string }[] = [
  { id: "ADM02", label: "Tuổi" },
  { id: "ADM03", label: "Giới" },
  { id: "ADM05", label: "Cao (cm)" },
  { id: "ADM06", label: "Nặng (kg)" },
  { id: "ADM07", label: "BMI" },
  { id: "ADM04", label: "ICF" },
  { id: "ADM08", label: "Physician" },
  { id: "ADM09", label: "Nurse" },
];

type Jobs = { jobs?: { job_id?: string; case_id?: string | null }[] };
type Fact = { id: string; label: string; slot: string; shown: Shown | null };

async function pipeline<T>(path: string): Promise<T> {
  const response = await fetch("/api/pipeline" + path, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// One intake listing shared by every card on the page (refetched after 30 s).
let jobsCache: { at: number; promise: Promise<Jobs> } | null = null;
function intakeJobs(): Promise<Jobs> {
  if (!jobsCache || Date.now() - jobsCache.at > 30_000) {
    jobsCache = { at: Date.now(), promise: pipeline<Jobs>("/api/intakes") };
    jobsCache.promise.catch(() => (jobsCache = null));
  }
  return jobsCache.promise;
}

function factsFrom(view: CrfView): Fact[] {
  const approved = view.review?.values;
  return FACTS.map(({ id, label }) => {
    const fields = view.fields.filter((field: CrfField) => field.slot.split("/")[0] === id);
    const field = fields.find((item) => item.component === "result") ?? fields[0];
    return { id, label, slot: field?.slot ?? `${id}/result`, shown: field ? shownValue(field, approved) : null };
  });
}

export function CrfAdminFacts({ intakeId }: { intakeId: string }) {
  const [state, setState] = useState<{ caseId: string; facts: Fact[] } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caseId = caseForIntake((await intakeJobs()).jobs, intakeId);
        if (!caseId) throw new Error("Chưa có phiếu CRF ở backend cho hồ sơ này.");
        const view = await pipeline<CrfView>(`/api/crf?case_id=${encodeURIComponent(caseId)}`);
        if (!cancelled) setState({ caseId, facts: factsFrom(view) });
      } catch (reason) {
        if (!cancelled) setState({ error: (reason as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intakeId]);

  if (!state) return <p className="px-5 py-2 text-xs text-slate-500 @lg:px-6">Đang đọc thông tin hành chính từ CRF…</p>;
  if ("error" in state) return <p className="px-5 py-2 text-xs text-rose-800 @lg:px-6">{state.error}</p>;

  return (
    <div className="border-b border-slate-200 px-5 py-2.5 @lg:px-6">
      <p className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
        Thông tin hành chính (từ CRF)
      </p>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {state.facts.map((fact) => {
          const tone =
            fact.shown?.kind === "approved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : fact.shown
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-slate-200 bg-slate-50 text-slate-500";
          return (
            <li key={fact.id}>
              <Link
                href={`/registry?case=${encodeURIComponent(state.caseId)}&slot=${encodeURIComponent(fact.slot)}`}
                title={
                  fact.shown?.kind === "approved"
                    ? "Đã duyệt · bấm để sửa ở Duyệt hồ sơ"
                    : fact.shown
                      ? "Chưa duyệt · bấm để duyệt hoặc nhập tay ở Duyệt hồ sơ"
                      : "Chưa có giá trị · bấm để nhập tay ở Duyệt hồ sơ"
                }
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:underline ${tone}`}
              >
                <span className="text-slate-600">{fact.label}:</span>
                <span className="font-mono font-semibold">{fact.shown?.text ?? "—"}</span>
                {fact.shown && fact.shown.kind !== "approved" && <span className="text-[10px]">(chưa duyệt)</span>}
                <span className="text-[10px] text-teal-800">✎ Sửa</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
