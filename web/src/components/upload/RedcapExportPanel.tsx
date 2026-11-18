"use client";

import React, { useState } from "react";
import { caseForIntake } from "@/lib/crfEvidence";
import type { SubmissionItemDTO } from "@/lib/submissionsService";

type Jobs = { jobs?: { job_id?: string; case_id?: string | null }[] };
type Created = { export_id: string; files: { name: string }[] };

async function pipeline<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/pipeline" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function saveFile(exportId: string, name: string) {
  const query = new URLSearchParams({ export_id: exportId, name });
  const response = await fetch(`/api/pipeline/api/exports/download?${query}`, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Approved submissions with a backend CRF, each downloadable as a REDCap import. */
export function RedcapExportPanel({ items, isVi }: { items: SubmissionItemDTO[]; isVi: boolean }) {
  const ready = items.filter((item) => item.record.submissionStatus === "approved" && item.pipelineIntakeId);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const download = async (item: SubmissionItemDTO) => {
    setBusy(item.dbSubmissionId);
    setMessage(null);
    try {
      const caseId = caseForIntake((await pipeline<Jobs>("/api/intakes")).jobs, item.pipelineIntakeId!);
      if (!caseId) throw new Error(isVi ? "Chưa có phiếu CRF ở backend cho hồ sơ này." : "No backend CRF for this submission yet.");
      const preview = await pipeline<{ preview_id: string }>("/api/exports/preview", { case_id: caseId });
      const created = await pipeline<Created>("/api/exports/create", { preview_id: preview.preview_id, format: "redcap" });
      for (const file of created.files) await saveFile(created.export_id, file.name);
      setMessage({ tone: "ok", text: isVi ? `Đã tải ${created.files.length} tệp REDCap.` : `Downloaded ${created.files.length} REDCap file(s).` });
    } catch (error) {
      setMessage({ tone: "error", text: (isVi ? "Không xuất được REDCap: " : "REDCap export failed: ") + (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="doctor-redcap-panel" aria-labelledby="doctor-redcap-heading" className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <h2 id="doctor-redcap-heading" className="text-sm font-bold text-indigo-950">
        {isVi ? "Xuất REDCap (chỉ giá trị đã duyệt)" : "REDCap export (approved values only)"}
      </h2>
      {message && (
        <p role="status" className={`mt-2 text-xs font-semibold ${message.tone === "ok" ? "text-teal-800" : "text-rose-700"}`}>
          {message.text}
        </p>
      )}
      {ready.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">
          {isVi ? "Chưa có hồ sơ đã phê duyệt có phiếu CRF trên trang này." : "No approved submission with a CRF on this page yet."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-indigo-100">
          {ready.map((item) => (
            <li key={item.dbSubmissionId} className="flex items-center justify-between gap-3 py-2">
              <span className="font-mono text-xs text-slate-800">{item.record.studyId || item.dbSubmissionId.slice(0, 8)}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void download(item)}
                className="min-h-8 rounded-lg bg-indigo-700 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
              >
                {busy === item.dbSubmissionId ? (isVi ? "Đang xuất…" : "Exporting…") : isVi ? "Tải REDCap" : "Download REDCap"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
