"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  SleCrfPatientRecord,
  UploadedDocFile,
} from "@/data/crfData";
import type { UploadPageCopy } from "@/data/uploadTranslations";
import { downloadOriginalClinicalFile } from "@/lib/originalFileGenerator";
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

  const fileFormat = getFileFormatBadge(activeFile);
  const hasDirectImagePreview = Boolean(activeFile.isImage && activeFile.url);

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const handleDownload = () => {
    void downloadOriginalClinicalFile(patient, activeFile);
  };

  const vc = copy.docViewer;

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
            <span className="text-xs font-semibold text-slate-600">
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

          {/* Zoom & Download Controls */}
          <div className="flex flex-wrap items-center gap-1.5">

            {/* Zoom Controls */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs tabular-nums">
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
                transform: `scale(${zoom / 100})`,
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
                <div className="rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-900">
                        {fileFormat}
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                        {activeFile.name}
                      </h3>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-600">
                      <p className="font-bold text-slate-900">
                        {copy.pidPrefix} {patient.studyId}
                      </p>
                      {patient.submittedAt && (
                        <p>{copy.submittedAtPrefix} {patient.submittedAt}</p>
                      )}
                    </div>
                  </div>

                  {patient.ocrFields.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-600">
                      <p>
                        {isVi
                          ? "Tài liệu không hỗ trợ xem ảnh trực tiếp trong trình duyệt. Vui lòng nhấn Tải xuống để mở tệp gốc."
                          : "Inline preview is unavailable for this file format. Click Download to open the file."}
                      </p>
                    </div>
                  ) : (
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
                          </tr>
                        </thead>
                        <tbody>
                          {patient.ocrFields.map((f) => (
                            <tr key={f.id} className="bg-white">
                              <td className="border border-slate-300 px-2.5 py-1.5 font-sans">
                                <span className="font-semibold text-slate-900">
                                  {isVi ? f.labelVi : f.labelEn}
                                </span>
                              </td>
                              <td className="border border-slate-300 px-2.5 py-1.5 text-right font-bold text-slate-900">
                                {f.value.trim() || "—"}
                              </td>
                              <td className="border border-slate-300 px-2.5 py-1.5 text-slate-600">
                                {f.unit}
                              </td>
                              <td className="border border-slate-300 px-2.5 py-1.5 text-slate-600">
                                {f.referenceRange}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
