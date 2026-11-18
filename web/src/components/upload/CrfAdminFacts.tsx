"use client";

/**
 * Age, gender, height, weight, BMI, ICF date, Physician and Nurse of a submission,
 * read from the backend CRF (ADM02–ADM09): the approved value, else the value read
 * from the images or the proposal, marked "chưa duyệt". Each value links to its cell
 * on "Duyệt hồ sơ" (/registry), where the doctor ticks it or types a correction.
 *
 * Also hosts the shared lazy backend reads (intake listing + one CRF view per case,
 * cached 30 s) so every visible dashboard row can show its review progress cheaply.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { UiIcon } from "@/components/UiIcon";
import type { CrfField, CrfView } from "@/lib/crfApproval";
import { caseForIntake, viAdminValue, withoutHidden } from "@/lib/crfEvidence";
import { shownValue, type Shown } from "@/lib/crfForm";
import { parseSlot } from "@/lib/crfSlot";

const FACTS = [
  ["ADM02", "Tuổi", "Age"],
  ["ADM03", "Giới", "Gender"],
  ["ADM05", "Chiều cao", "Height"],
  ["ADM06", "Cân nặng", "Weight"],
  ["ADM07", "BMI", "BMI"],
  ["ADM04", "ICF", "ICF"],
  ["ADM08", "Bác sĩ", "Physician"],
  ["ADM09", "Điều dưỡng", "Nurse"],
] as const;

type Jobs = { jobs?: { job_id?: string; case_id?: string | null }[] };
export type Fact = { id: string; label: string; slot: string; shown: Shown | null };
type CrfCaseState = { caseId: string; intakeId: string; view: CrfView } | { error: true } | null;

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
const CACHE_MS = 30_000;
function intakeJobs(): Promise<Jobs> {
  if (!jobsCache || Date.now() - jobsCache.at > CACHE_MS) {
    const entry = { at: Date.now(), promise: pipeline<Jobs>("/api/intakes") };
    jobsCache = entry;
    entry.promise.catch(() => {
      if (jobsCache === entry) jobsCache = null;
    });
  }
  return jobsCache.promise;
}

// One CRF view per case shared by the row progress and the expanded facts.
const viewCache = new Map<string, { at: number; promise: Promise<CrfView> }>();
function crfViewForCase(caseId: string): Promise<CrfView> {
  const now = Date.now();
  for (const [id, entry] of viewCache) {
    if (now - entry.at > CACHE_MS) viewCache.delete(id);
  }
  const entry = viewCache.get(caseId);
  if (entry) return entry.promise;
  const promise = pipeline<CrfView>(`/api/crf?case_id=${encodeURIComponent(caseId)}`)
    .then(({ fields, review, source_snapshot, draft_sha256 }) =>
      withoutHidden({ fields, review, source_snapshot, draft_sha256 }));
  viewCache.set(caseId, { at: now, promise });
  promise.catch(() => {
    if (viewCache.get(caseId)?.promise === promise) viewCache.delete(caseId);
  });
  return promise;
}

/** Drop cached views after a review/approval so the dashboard reloads fresh progress. */
export function clearCrfViewCache(): void {
  viewCache.clear();
  jobsCache = null;
}

/** Lazy per-case backend read: intake → case → CRF view, shared across rows. */
export function useCrfCase(intakeId: string | null | undefined): CrfCaseState {
  const [loaded, setLoaded] = useState<{ intakeId: string; state: CrfCaseState } | null>(null);
  useEffect(() => {
    if (!intakeId) return;
    let cancelled = false;
    (async () => {
      try {
        const caseId = caseForIntake((await intakeJobs()).jobs, intakeId);
        if (!caseId) throw new Error("No linked CRF");
        const view = await crfViewForCase(caseId);
        if (!cancelled) setLoaded({ intakeId, state: { caseId, intakeId, view } });
      } catch {
        if (!cancelled) setLoaded({ intakeId, state: { error: true } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intakeId]);
  return loaded && loaded.intakeId === intakeId ? loaded.state : null;
}

function factsFrom(view: CrfView, isVi: boolean): Fact[] {
  const approved = view.review?.values;
  return FACTS.map(([id, vi, en]) => {
    const fields = view.fields.filter((field: CrfField) => {
      const slot = parseSlot(field.slot);
      return slot.fieldId === id && slot.instance === 1;
    });
    const field = fields.find((item) => item.component === "result") ?? fields[0];
    return { id, label: isVi ? vi : en, slot: field?.slot ?? `${id}/result`, shown: field ? shownValue(field, approved) : null };
  });
}

export function AdminFactsList({ facts, caseId, intakeId, isVi = true }: {
  facts: Fact[];
  caseId: string;
  intakeId?: string;
  isVi?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {facts.map((fact) => {
        const params = new URLSearchParams({ case: caseId, slot: fact.slot });
        if (intakeId) params.set("intake", intakeId);
        const tone =
          fact.shown?.kind === "approved"
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : fact.shown
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-slate-200 bg-slate-50 text-slate-500";
        const text = fact.shown ? (isVi ? viAdminValue(fact.id, fact.shown.text) : fact.shown.text) : "—";
        return (
          <li key={fact.id}>
            <Link
              href={`/registry?${params}`}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:underline ${tone}`}
            >
              <span className="text-slate-600">{fact.label}:</span>
              <span className="font-mono font-semibold">{text}</span>
              {fact.shown && fact.shown.kind !== "approved" && (
                <span className="text-[10px]">{isVi ? "(chưa duyệt)" : "(unreviewed)"}</span>
              )}
              <span className="inline-flex items-center gap-1 text-[10px] text-teal-800">
                <UiIcon name="manual" className="size-3 shrink-0" />{isVi ? "Sửa" : "Edit"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CrfAdminFacts({ state, isVi = true }: { state: CrfCaseState; isVi?: boolean }) {
  if (!state || "error" in state) {
    const text = state
      ? (isVi ? "Không đọc được thông tin hành chính." : "Administrative details are unavailable.")
      : (isVi ? "Đang đọc thông tin hành chính…" : "Loading administrative details…");
    return <p className="px-5 py-2 text-xs text-slate-600 @lg:px-6">{text}</p>;
  }

  return (
    <div className="border-b border-slate-200 px-5 py-2.5 @lg:px-6">
      <p className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {isVi ? "Thông tin hành chính" : "Administrative details"}
      </p>
      <AdminFactsList facts={factsFrom(state.view, isVi)} caseId={state.caseId} intakeId={state.intakeId} isVi={isVi} />
    </div>
  );
}
