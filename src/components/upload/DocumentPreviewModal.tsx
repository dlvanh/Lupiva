"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  SleCrfPatientRecord,
  UploadedDocFile,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";
import type { UploadPageCopy } from "@/data/uploadTranslations";
import { TruncatedFilename } from "./TruncatedFilename";

interface DocumentPreviewModalProps {
  patient: SleCrfPatientRecord | null;
  activeFileId: string | null;
  isVi: boolean;
  copy: UploadPageCopy["doctor"];
  onClose: () => void;
  onSelectFile: (fileId: string) => void;
}

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;

function getFileFormatBadge(file: UploadedDocFile): "IMG" | "DOCX" | "PDF" {
  if (file.isImage || /\.(png|jpe?g|webp)$/i.test(file.name)) {
    return "IMG";
  }
  if (/\.docx?$/i.test(file.name)) {
    return "DOCX";
  }
  return "PDF";
}

function buildDownloadableClinicalReportHtml(
  patient: SleCrfPatientRecord,
  file: UploadedDocFile,
  isVi: boolean
): string {
  const rowsHtml = patient.ocrFields
    .map(
      (f) => `
      <tr>
        <td>${isVi ? f.labelVi : f.labelEn} (<code>${f.code}</code>)</td>
        <td><strong>${f.value || f.printedValue}</strong></td>
        <td>${f.unit}</td>
        <td>${f.referenceRange}</td>
        <td>${f.flag}</td>
        <td>${f.confidence}%</td>
      </tr>`
    )
    .join("");

  const blotsHtml = patient.antibodyBlots
    .filter((b) => b.printedResult !== "Negative" || b.confidence <= 90)
    .map(
      (b) => `
      <tr>
        <td>${b.name} (${b.panel.toUpperCase()})</td>
        <td><strong>${b.result || b.printedResult}</strong></td>
        <td>${b.intensity || b.printedIntensity}</td>
        <td>${b.confidence}%</td>
      </tr>`
    )
    .join("");

  const txHtml = patient.treatments
    .map(
      (t) =>
        `<li><strong>${t.name}</strong> — ${t.dose} (${t.route}, ${t.frequency}) • ${t.duration}</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${isVi ? "vi" : "en"}">
<head>
  <meta charset="utf-8" />
  <title>${file.name} — ${patient.studyId}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.45; }
    h1, h2 { margin-bottom: 6px; }
    .meta { background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>VINMEC CENTRAL LABORATORY • SLE CLINICAL DOSSIER</h1>
  <p><strong>Document:</strong> ${file.name}</p>
  <div class="meta">
    <strong>PID:</strong> ${patient.studyId} &bull;
    <strong>Patient:</strong> ${patient.patientName} (${patient.age} / ${patient.gender}) &bull;
    <strong>ICF:</strong> ${patient.icfSignedDate} &bull;
    <strong>Uploaded:</strong> ${patient.submittedAt ?? "—"}
  </div>
  <h2>1. Clinical Laboratory &amp; Serology Biomarkers</h2>
  <table>
    <thead>
      <tr>
        <th>Biomarker / Assay</th>
        <th>Result</th>
        <th>Unit</th>
        <th>Reference Range</th>
        <th>Flag</th>
        <th>OCR</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <h2>2. Immunoblot Strip Summary</h2>
  <table>
    <thead>
      <tr>
        <th>Antibody</th>
        <th>Result</th>
        <th>Intensity</th>
        <th>OCR</th>
      </tr>
    </thead>
    <tbody>${blotsHtml}</tbody>
  </table>
  <h2>3. Current Treatments</h2>
  <ul>${txHtml || "<li>None listed</li>"}</ul>
  <p><strong>Attending Physician:</strong> ${patient.physician} &bull; <strong>Nurse:</strong> ${patient.nurse}</p>
</body>
</html>`;
}

export function DocumentPreviewModal({
  patient,
  activeFileId,
  isVi,
  copy,
  onClose,
  onSelectFile,
}: DocumentPreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const uploadedFiles = patient?.uploadedFiles ?? [];
  const activeFile =
    uploadedFiles.find((f) => f.id === activeFileId) ?? uploadedFiles[0] ?? null;

  const isOpen = Boolean(patient && activeFile);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="specialist-doc-viewer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className="m-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/65"
    >
      {patient && activeFile ? (
        <DocumentPreviewDialogBody
          key={`${patient.id}:${activeFile.id}`}
          patient={patient}
          activeFile={activeFile}
          uploadedFiles={uploadedFiles}
          isVi={isVi}
          copy={copy}
          onClose={onClose}
          onSelectFile={onSelectFile}
        />
      ) : null}
    </dialog>
  );
}

function DocumentPreviewDialogBody({
  patient,
  activeFile,
  uploadedFiles,
  isVi,
  copy,
  onClose,
  onSelectFile,
}: {
  patient: SleCrfPatientRecord;
  activeFile: UploadedDocFile;
  uploadedFiles: UploadedDocFile[];
  isVi: boolean;
  copy: UploadPageCopy["doctor"];
  onClose: () => void;
  onSelectFile: (fileId: string) => void;
}) {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fileFormat = getFileFormatBadge(activeFile);
  const hasDirectImagePreview = Boolean(activeFile.isImage && activeFile.url);
  const totalPages = hasDirectImagePreview ? 1 : 2;

  const approved = getSubmissionStatus(patient) === "approved";
  const eular = calculateEularAcrSummary(
    patient.eularAcrCriteria,
    patient.anaEntryCriterionMet
  );
  const sledai = calculateSledai2kSummary(patient.sledai2kCriteria);

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  };

  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDownload = () => {
    if (activeFile.url) {
      const a = document.createElement("a");
      a.href = activeFile.url;
      a.download = activeFile.name;
      a.click();
      return;
    }

    const htmlContent = buildDownloadableClinicalReportHtml(
      patient,
      activeFile,
      isVi
    );
    const blob = new Blob([htmlContent], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = activeFile.name.replace(/\.(pdf|docx?)$/i, "");
    a.download = `${baseName}_Preview.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const vc = copy.docViewer;
  const highlightedBlots = patient.antibodyBlots.filter(
    (b) => b.printedResult !== "Negative" || b.confidence <= 90
  );

  return (
    <div className="flex max-h-[90vh] flex-col">
      {/* Top Header: Patient Identity, File Switcher & Close Button */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                {copy.pidPrefix} {patient.studyId}
              </span>
              <h2
                id="specialist-doc-viewer-title"
                className="text-sm font-bold text-slate-900"
              >
                {patient.patientName} — {vc.dialogTitle}
              </h2>
              <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-900">
                {fileFormat}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-600">
              <TruncatedFilename name={activeFile.name} />
            </p>
          </div>

          <button
            type="button"
            id="doc-viewer-close"
            onClick={onClose}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 cursor-pointer"
          >
            {vc.closeBtn} (Esc)
          </button>
        </header>

        {/* Secondary File Switcher + Document Controls Toolbar */}
        <div
          role="toolbar"
          aria-label={vc.dialogTitle}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5 text-xs"
        >
          {/* Attachment Switcher Pills */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-mono text-[11px] font-semibold text-slate-500">
              {vc.filesLabel}
            </span>
            {uploadedFiles.map((f) => {
              const isCurrent = f.id === activeFile.id;
              const badge = getFileFormatBadge(f);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={isCurrent}
                  onClick={() => onSelectFile(f.id)}
                  className={`inline-flex max-w-60 items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition cursor-pointer ${
                    isCurrent
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="shrink-0 font-bold">{badge}:</span>
                  <TruncatedFilename name={f.name} />
                </button>
              );
            })}
          </div>

          {/* PDF / DOCX / Image Controls: Page X of Y, Zoom In/Out, Rotate, Download */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Page Navigation & Count */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 font-mono text-[11px]">
              <button
                type="button"
                id="doc-viewer-prev-page"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label={vc.prevPage}
                className="min-h-7 rounded px-2 py-0.5 font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                ← {vc.prevPage}
              </button>
              <span className="px-2.5 font-bold text-slate-900">
                {vc.pageIndicator(currentPage, totalPages)}
              </span>
              <button
                type="button"
                id="doc-viewer-next-page"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                aria-label={vc.nextPage}
                className="min-h-7 rounded px-2 py-0.5 font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                {vc.nextPage} →
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 font-mono text-[11px]">
              <button
                type="button"
                id="doc-viewer-zoom-out"
                disabled={zoom <= ZOOM_MIN}
                onClick={handleZoomOut}
                title={vc.zoomOut}
                aria-label={vc.zoomOut}
                className="min-h-7 min-w-7 rounded px-2 py-0.5 font-bold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                −
              </button>
              <button
                type="button"
                id="doc-viewer-zoom-reset"
                onClick={handleResetZoom}
                title={vc.resetZoom}
                className="min-h-7 rounded px-2 py-0.5 font-bold text-slate-900 hover:bg-white cursor-pointer"
              >
                {zoom}%
              </button>
              <button
                type="button"
                id="doc-viewer-zoom-in"
                disabled={zoom >= ZOOM_MAX}
                onClick={handleZoomIn}
                title={vc.zoomIn}
                aria-label={vc.zoomIn}
                className="min-h-7 min-w-7 rounded px-2 py-0.5 font-bold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Rotate Controls */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 font-mono text-[11px]">
              <button
                type="button"
                id="doc-viewer-rotate-left"
                onClick={handleRotateLeft}
                title={vc.rotateLeft}
                aria-label={vc.rotateLeft}
                className="min-h-7 rounded px-2 py-0.5 font-semibold text-slate-800 hover:bg-white cursor-pointer"
              >
                ↺ -90°
              </button>
              <button
                type="button"
                id="doc-viewer-rotate-right"
                onClick={handleRotateRight}
                title={vc.rotateRight}
                aria-label={vc.rotateRight}
                className="min-h-7 rounded px-2 py-0.5 font-semibold text-slate-800 hover:bg-white cursor-pointer"
              >
                ↻ +90°
              </button>
              {rotation !== 0 && (
                <span className="px-1.5 text-[10px] font-bold text-teal-800">
                  {rotation}°
                </span>
              )}
            </div>

            {/* Download Action */}
            <button
              type="button"
              id="doc-viewer-download"
              onClick={handleDownload}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1 font-semibold text-white shadow-2xs transition hover:bg-teal-800 cursor-pointer"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{vc.downloadBtn}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Viewport */}
        <div className="flex-1 overflow-auto bg-slate-200/80 p-6">
          <div className="flex min-h-full items-start justify-center">
            <div
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: "top center",
              }}
              className="w-full max-w-3xl transition-transform duration-150"
            >
              {hasDirectImagePreview && activeFile.url ? (
                <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeFile.url}
                    alt={activeFile.name}
                    className="mx-auto max-h-[68vh] w-auto rounded object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-300 bg-[#fcfcfa] p-6 text-slate-900 shadow-md">
                  {/* Document Sheet Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-800 pb-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-900">
                        VINMEC CENTRAL LABORATORY • SLE DOSSIER ({fileFormat})
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                        {currentPage === 1
                          ? vc.labSheetTitle
                          : vc.blotAndTxSheetTitle}
                      </h3>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                        {activeFile.name}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <p className="font-bold text-slate-900">
                        {copy.pidPrefix} {patient.studyId}
                      </p>
                      <p className="text-slate-600">
                        {vc.pageIndicator(currentPage, totalPages)}
                      </p>
                    </div>
                  </div>

                  {/* Patient Demographics Strip */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100/80 px-3 py-2 font-mono text-[11px] text-slate-800">
                    <span>
                      <strong>{patient.patientName}</strong> ({patient.age}{" "}
                      {copy.ageUnit} •{" "}
                      {patient.gender === "Female" ? copy.female : copy.male})
                    </span>
                    <span>
                      { patient.heightCm } cm / { patient.weightKg } kg • ICF:{" "}
                      {patient.icfSignedDate}
                    </span>
                    {patient.submittedAt && (
                      <span>
                        {copy.submittedAtPrefix} {patient.submittedAt}
                      </span>
                    )}
                  </div>

                  {currentPage === 1 ? (
                    /* PAGE 1: Clinical Laboratory & Serology Biomarkers Table */
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse border border-slate-300 font-mono text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-left text-[11px] text-slate-700">
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5">
                              {vc.testCol}
                            </th>
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5 text-right">
                              {vc.resultCol}
                            </th>
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5">
                              {vc.unitCol}
                            </th>
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5">
                              {vc.refCol}
                            </th>
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5 text-center">
                              {vc.flagCol}
                            </th>
                            <th scope="col" className="border border-slate-300 px-2.5 py-1.5 text-right">
                              {vc.confCol}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {patient.ocrFields.map((f) => {
                            const printed = f.value.trim() || f.printedValue;
                            const isAbnormal = f.flag !== "Normal";
                            return (
                              <tr
                                key={f.id}
                                className={
                                  isAbnormal ? "bg-rose-50/35" : "bg-white"
                                }
                              >
                                <td className="border border-slate-300 px-2.5 py-1.5 font-sans">
                                  <span className="font-semibold text-slate-900">
                                    {isVi ? f.labelVi : f.labelEn}
                                  </span>{" "}
                                  <span className="font-mono text-[10px] text-slate-500">
                                    [{f.code}]
                                  </span>
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 text-right font-bold text-slate-900">
                                  {printed}
                                  {f.printedSecondaryValue
                                    ? ` (${f.printedSecondaryValue})`
                                    : ""}
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 text-slate-600">
                                  {f.unit}
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 text-slate-600">
                                  {f.referenceRange}
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 text-center">
                                  <span
                                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      isAbnormal
                                        ? "bg-rose-100 text-rose-900"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {f.flag}
                                  </span>
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 text-right font-bold">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                                      f.confidence < 80
                                        ? "bg-rose-100 text-rose-900"
                                        : f.confidence <= 90
                                        ? "bg-amber-100 text-amber-950"
                                        : "bg-teal-50 text-teal-900"
                                    }`}
                                  >
                                    {f.confidence}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* PAGE 2: Immunoblot Strip, Treatments & Care Team Sign-Off */
                    <div className="mt-4 space-y-4">
                      <div>
                        <h4 className="font-mono text-xs font-bold uppercase tracking-wide text-slate-700">
                          {vc.blotHeading}
                        </h4>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {highlightedBlots.map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
                            >
                              <div>
                                <p className="font-bold text-slate-900">
                                  {b.name}{" "}
                                  <span className="text-[10px] font-normal text-slate-500">
                                    ({b.panel.toUpperCase()})
                                  </span>
                                </p>
                                <p className="text-[11px] text-slate-700">
                                  {b.result || b.printedResult}{" "}
                                  <strong>
                                    {b.intensity || b.printedIntensity}
                                  </strong>
                                </p>
                              </div>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  b.confidence < 80
                                    ? "bg-rose-100 text-rose-900"
                                    : b.confidence <= 90
                                    ? "bg-amber-100 text-amber-950"
                                    : "bg-teal-50 text-teal-900"
                                }`}
                              >
                                {b.confidence}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3">
                        <h4 className="font-mono text-xs font-bold uppercase tracking-wide text-slate-700">
                          {vc.txHeading}
                        </h4>
                        {patient.treatments.length > 0 ? (
                          <ul className="mt-2 space-y-1.5 text-xs">
                            {patient.treatments.map((t) => (
                              <li
                                key={t.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                              >
                                <span className="font-semibold text-slate-900">
                                  {t.name} ({t.dose})
                                </span>
                                <span className="font-mono text-[11px] text-slate-600">
                                  {t.route} • {t.frequency} • {t.duration}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-slate-600">
                            {copy.noTreatments}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-100/80 p-3 text-xs">
                        <h4 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-700">
                          {vc.careTeamHeading}
                        </h4>
                        <p className="mt-1 text-slate-700">
                          {copy.physicianPrefix}{" "}
                          <strong className="text-slate-900">
                            {patient.physician}
                          </strong>{" "}
                          • {copy.nursePrefix} {patient.nurse}
                        </p>
                        {approved ? (
                          <p className="mt-1.5 font-mono text-[11px] font-semibold text-teal-900">
                            {vc.signedByLabel}{" "}
                            {patient.signedOffBy ?? patient.physician} • EULAR/ACR:{" "}
                            {eular.totalScore} pts • SLEDAI-2K:{" "}
                            {sledai.totalScore} pts
                          </p>
                        ) : (
                          <p className="mt-1.5 font-mono text-[11px] font-semibold text-amber-900">
                            {vc.pendingSignOff}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
