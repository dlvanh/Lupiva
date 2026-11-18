"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import {
  SleCrfPatientRecord,
  UploadedDocFile,
  getSubmissionStatus,
} from "@/data/crfData";
import { getUploadPageCopy } from "@/data/uploadTranslations";
import { DEFAULT_PAGE_SIZE, type PaginationMeta } from "@/lib/submissionFilters";
import { TruncatedFilename } from "./TruncatedFilename";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILE_MB = 15;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXT_RE = /\.(png|jpe?g|webp|pdf)$/i;

function isAllowedUploadFile(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  return ALLOWED_EXT_RE.test(file.name);
}

function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PatientSubmissionDto {
  record: SleCrfPatientRecord;
  dbSubmissionId: string;
  submittedAtIso: string;
}

export function PatientUploadView() {
  const {
    language,
    currentUser,
    authLoading,
    submitPatientUpload,
  } = useLupiva();

  const copy = getUploadPageCopy(language).patient;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewDialogRef = useRef<HTMLDialogElement | null>(null);
  const unsubmittedUrlsRef = useRef<Set<string>>(new Set());

  const [files, setFiles] = useState<UploadedDocFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewTarget, setPreviewTarget] = useState<UploadedDocFile | null>(
    null
  );

  const [trackerPage, setTrackerPage] = useState(1);
  const [trackerState, setTrackerState] = useState<{
    loading: boolean;
    error: string | null;
    items: PatientSubmissionDto[];
    pagination: PaginationMeta;
  }>({
    loading: false,
    error: null,
    items: [],
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalItems: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  });
  const [trackerTick, setTrackerTick] = useState(0);

  // Revoke any un-submitted object URLs when leaving the page
  useEffect(() => {
    const trackedUrls = unsubmittedUrlsRef.current;
    return () => {
      for (const url of trackedUrls) {
        URL.revokeObjectURL(url);
      }
      trackedUrls.clear();
    };
  }, []);

  // Load authenticated patient's submissions from API (server returns sorted by upload date newest-first)
  useEffect(() => {
    if (currentUser?.role !== "patient") {
      return;
    }

    const controller = new AbortController();
    const utcOffsetMinutes = -new Date().getTimezoneOffset();

    async function loadPatientSubmissions() {
      setTrackerState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(
          `/api/submissions?page=${trackerPage}&pageSize=${DEFAULT_PAGE_SIZE}&utcOffsetMinutes=${utcOffsetMinutes}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const payload = (await res.json().catch(() => ({}))) as {
          items?: PatientSubmissionDto[];
          pagination?: PaginationMeta;
          error?: string;
        };
        if (!res.ok || !Array.isArray(payload.items)) {
          setTrackerState((prev) => ({
            ...prev,
            loading: false,
            error: payload.error || copy.trackerErrorTitle,
          }));
          return;
        }
        setTrackerState((prev) => ({
          loading: false,
          error: null,
          items: payload.items ?? [],
          pagination: payload.pagination ?? prev.pagination,
        }));
      } catch {
        if (controller.signal.aborted) return;
        setTrackerState((prev) => ({
          ...prev,
          loading: false,
          error: copy.trackerErrorTitle,
        }));
      }
    }

    void loadPatientSubmissions();
    return () => controller.abort();
  }, [currentUser, trackerPage, trackerTick, copy.trackerErrorTitle]);

  const patientName =
    currentUser?.role === "patient" ? currentUser.name : "Tran Thi Mai";

  const addFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;

      const messages: string[] = [];
      const existingNames = new Set(
        files.map((item) => item.name.toLowerCase())
      );
      const added: UploadedDocFile[] = [];

      Array.from(list).forEach((file, idx) => {
        if (!isAllowedUploadFile(file)) {
          messages.push(copy.invalidFileType(file.name));
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          messages.push(copy.fileTooLarge(file.name, MAX_FILE_MB));
          return;
        }
        const key = file.name.toLowerCase();
        if (existingNames.has(key)) {
          messages.push(copy.duplicateFile(file.name));
          return;
        }
        existingNames.add(key);

        const isImage =
          file.type.startsWith("image/") ||
          /\.(png|jpe?g|webp)$/i.test(file.name);
        const objectUrl = URL.createObjectURL(file);
        unsubmittedUrlsRef.current.add(objectUrl);

        added.push({
          id: `up-${Date.now()}-${idx}`,
          name: file.name,
          url: objectUrl,
          isImage,
          mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
          sizeBytes: file.size,
        });
      });

      setValidationMessages(messages);
      if (added.length > 0) {
        setFiles((prev) => [...prev, ...added]);
      }
    },
    [files, copy]
  );

  const removeFile = (target: UploadedDocFile) => {
    if (target.url) {
      URL.revokeObjectURL(target.url);
      unsubmittedUrlsRef.current.delete(target.url);
    }
    setFiles((prev) => prev.filter((x) => x.id !== target.id));
    setValidationMessages([]);
  };

  const loadSample = () => {
    const sampleName = "Sample_Hospital_Lab_Dossier.pdf";
    if (files.some((f) => f.name.toLowerCase() === sampleName.toLowerCase())) {
      setValidationMessages([copy.duplicateFile(sampleName)]);
      return;
    }
    setValidationMessages([]);
    setFiles((prev) => [
      ...prev,
      {
        id: `sample-${Date.now()}`,
        name: sampleName,
        url: null,
        isImage: false,
        mimeType: "application/pdf",
        sizeBytes: 245760,
      },
    ]);
  };

  const openImagePreview = (file: UploadedDocFile) => {
    if (!file.url) return;
    setPreviewTarget(file);
    previewDialogRef.current?.showModal();
  };

  const closeImagePreview = () => {
    previewDialogRef.current?.close();
    setPreviewTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !currentUser || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await submitPatientUpload(patientName, files);
      if (created) {
        // Hand off object URLs cleanly to LupivaContext so /ocr can preview them
        for (const f of files) {
          if (f.url) {
            unsubmittedUrlsRef.current.delete(f.url);
          }
        }
        setFiles([]);
        setValidationMessages([]);
        setTrackerPage(1);
        setTrackerTick((t) => t + 1);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 py-10 focus:outline-none"
    >
      <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        {!authLoading && !currentUser && (
          <section
            aria-label={copy.guestBannerTitle}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4"
          >
            <div>
              <h2 className="text-sm font-bold text-amber-950">
                {copy.guestBannerTitle}
              </h2>
              <p className="mt-0.5 text-xs text-amber-900">
                {copy.guestBannerDesc}
              </p>
            </div>
            <Link
              href="/login?next=/upload"
              id="upload-guest-signin-cta"
              className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800"
            >
              {copy.guestSignInCta}
            </Link>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h1 className="text-2xl font-bold text-slate-900">
            {copy.heading}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{copy.subheading}</p>

          <form onSubmit={handleSubmit} className="mt-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                isDragging
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <input
                ref={inputRef}
                id="upload-file-input"
                name="documents"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                aria-describedby="upload-file-constraints"
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <label
                htmlFor="upload-file-input"
                className="flex cursor-pointer flex-col items-center"
              >
                <span
                  aria-hidden="true"
                  className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-teal-700 shadow-2xs"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {copy.dropzonePrompt}
                </span>
                <span
                  id="upload-file-constraints"
                  className="mt-1 text-xs text-slate-600"
                >
                  {copy.dropzoneHint}
                </span>
              </label>

              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  id="upload-btn-browse"
                  onClick={() => inputRef.current?.click()}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  {copy.browseBtn}
                </button>
                <button
                  type="button"
                  id="upload-btn-sample"
                  onClick={loadSample}
                  className="min-h-10 rounded-lg border border-teal-700/30 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
                >
                  {copy.sampleBtn}
                </button>
              </div>
            </div>

            {validationMessages.length > 0 && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950"
              >
                <p className="font-bold">{copy.validationNoticeTitle}</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {validationMessages.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <p role="status" aria-live="polite" className="sr-only">
              {copy.stagedAnnouncement(files.length)}
            </p>

            {files.length > 0 && (
              <div className="mt-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  {copy.stagedListHeading(files.length)}
                </h2>
                <ul className="mt-2 space-y-2">
                  {files.map((f) => {
                    const sizeText = formatFileSize(f.sizeBytes);
                    return (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {f.isImage && f.url ? (
                            <button
                              type="button"
                              onClick={() => openImagePreview(f)}
                              aria-label={copy.previewImageAction(f.name)}
                              className="shrink-0 overflow-hidden rounded border border-slate-200 hover:border-teal-600 cursor-pointer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={f.url}
                                alt={f.name}
                                width={40}
                                height={40}
                                className="h-10 w-10 object-cover"
                              />
                            </button>
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-700">
                              PDF
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">
                              <TruncatedFilename name={f.name} />
                            </p>
                            {sizeText && (
                              <p className="font-mono text-[11px] text-slate-600">
                                {sizeText}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(f)}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-rose-50 hover:text-rose-800 cursor-pointer"
                          aria-label={copy.removeFileAction(f.name)}
                        >
                          <svg
                            aria-hidden="true"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <button
              type="submit"
              id="upload-btn-submit"
              disabled={files.length === 0 || !currentUser || isSubmitting}
              className="mt-5 min-h-11 w-full rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-2xs transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? copy.submittingBtn : copy.submitBtn}
            </button>
          </form>
        </section>

        {currentUser?.role === "patient" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {copy.trackerHeading}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {copy.trackerSortNote}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                {copy.trackerCount(trackerState.pagination.totalItems)}
              </span>
            </div>

            {trackerState.error && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900"
              >
                {trackerState.error}
              </div>
            )}

            <div
              aria-busy={trackerState.loading}
              className="mt-4 space-y-3"
            >
              {trackerState.loading && trackerState.items.length === 0 ? (
                <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
              ) : trackerState.items.length === 0 ? (
                <p className="text-xs text-slate-600">{copy.trackerEmpty}</p>
              ) : (
                trackerState.items.map(({ record: p, dbSubmissionId }) => {
                  const approved = getSubmissionStatus(p) === "approved";
                  return (
                    <article
                      key={dbSubmissionId}
                      className="rounded-lg border border-slate-200 p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-bold text-slate-900">
                          {p.patientName} •{" "}
                          <span className="font-mono">{p.studyId}</span>
                        </p>
                        {p.submittedAt && (
                          <span className="font-mono text-[11px] font-semibold text-slate-700">
                            {p.submittedAt}
                          </span>
                        )}
                      </div>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.uploadedFiles?.map((f) => (
                          <li key={f.id} className="min-w-0 max-w-full">
                            <span className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                              <TruncatedFilename name={f.name} />
                            </span>
                          </li>
                        ))}
                      </ul>
                      <ol className="mt-3 grid grid-cols-1 gap-2 font-semibold sm:grid-cols-3">
                        <li className="flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-teal-900">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
                          />
                          <span>{copy.stepUploaded}</span>
                        </li>
                        <li className="flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-teal-900">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
                          />
                          <span>{copy.stepOcrExtracted}</span>
                        </li>
                        <li
                          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 ${
                            approved
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-amber-200 bg-amber-50 text-amber-950"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              approved ? "bg-white" : "bg-amber-500"
                            }`}
                          />
                          <span>
                            {approved
                              ? copy.stepApproved
                              : copy.stepPendingDoctor}
                          </span>
                        </li>
                      </ol>
                    </article>
                  );
                })
              )}
            </div>

            {trackerState.pagination.totalPages > 1 && (
              <nav
                aria-label={copy.paginationLabel}
                className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs"
              >
                <span className="font-semibold tabular-nums text-slate-700">
                  {copy.pageOfTotal(
                    trackerState.pagination.page,
                    trackerState.pagination.totalPages
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={
                      !trackerState.pagination.hasPreviousPage ||
                      trackerState.loading
                    }
                    onClick={() =>
                      setTrackerPage(trackerState.pagination.page - 1)
                    }
                    className="min-h-8 rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                  >
                    ← {copy.prevPage}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !trackerState.pagination.hasNextPage ||
                      trackerState.loading
                    }
                    onClick={() =>
                      setTrackerPage(trackerState.pagination.page + 1)
                    }
                    className="min-h-8 rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                  >
                    {copy.nextPage} →
                  </button>
                </div>
              </nav>
            )}
          </section>
        )}
      </div>

      {/* Native <dialog> Thumbnail Lightbox Preview */}
      <dialog
        ref={previewDialogRef}
        aria-labelledby="upload-preview-dialog-title"
        onClose={() => setPreviewTarget(null)}
        onClick={(e) => {
          if (e.target === previewDialogRef.current) {
            closeImagePreview();
          }
        }}
        className="m-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/60"
      >
        {previewTarget?.url && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <h2
                  id="upload-preview-dialog-title"
                  className="text-sm font-bold text-slate-900"
                >
                  {copy.previewDialogTitle}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-slate-600">
                  <TruncatedFilename name={previewTarget.name} />
                </p>
              </div>
              <button
                type="button"
                onClick={closeImagePreview}
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                {copy.previewDialogClose}
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-50 p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewTarget.url}
                alt={previewTarget.name}
                className="mx-auto max-h-[68vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        )}
      </dialog>
    </main>
  );
}
