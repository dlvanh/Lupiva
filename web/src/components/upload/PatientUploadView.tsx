"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CenterNotice } from "@/components/CenterNotice";
import { UiIcon } from "@/components/UiIcon";
import { useLupiva } from "@/context/LupivaContext";
import { UploadedDocFile } from "@/data/crfData";
import type { PatientSubmissionStatusDTO } from "@/lib/submissionsService";
import { patientTabAfterLoad, type PatientTab } from "@/lib/patientTabs";
import { EMBEDDED_UPLOAD_COPY, fileLabel, getUploadPageCopy } from "@/data/uploadTranslations";
import { DEFAULT_PAGE_SIZE, type PaginationMeta } from "@/lib/submissionFilters";
import { PatientSubmissionProgress } from "./PatientSubmissionProgress";
import { TruncatedFilename } from "./TruncatedFilename";
import { renameCapturedPhoto } from "@/lib/capturedPhoto";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_TYPE_BY_EXTENSION = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
]);
const IMAGE_ACCEPT = [...IMAGE_MIME_TYPES, ...Array.from(IMAGE_TYPE_BY_EXTENSION.keys(), (ext) => `.${ext}`)].join(",");

function uploadMimeType(file: File, embedded: boolean): string | undefined {
  const type = file.type.toLowerCase();
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? "";
  const imageTypeByExtension = IMAGE_TYPE_BY_EXTENSION.get(extension);
  if (embedded) {
    if (IMAGE_MIME_TYPES.has(type) || type === "application/pdf" || imageTypeByExtension || extension === "pdf") {
      return file.type || imageTypeByExtension || "application/pdf";
    }
    return;
  }

  if (IMAGE_MIME_TYPES.has(type)) return type;
  if (!type || type === "application/octet-stream") return imageTypeByExtension;
}

function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Image upload into the Python pipeline. Patients upload their own documents;
 * a doctor (``embedded`` inside the submission list) uploads for a named patient.
 */
export function PatientUploadView({ embedded = false, onSubmitted }: { embedded?: boolean; onSubmitted?: () => void } = {}) {
  const router = useRouter();
  const {
    language,
    t,
    currentUser,
    authLoading,
    submitPatientUpload,
  } = useLupiva();

  const copy = getUploadPageCopy(language).patient;
  const embeddedCopy = EMBEDDED_UPLOAD_COPY[language];
  const formCopy = embedded ? embeddedCopy : copy;
  const portal = t.patientPortal;
  const maxFileMb = embedded ? 15 : 20;
  const maxFileBytes = maxFileMb * 1024 * 1024;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const trackerHeadingRef = useRef<HTMLHeadingElement>(null);
  const previewDialogRef = useRef<HTMLDialogElement | null>(null);
  const unsubmittedUrlsRef = useRef<Set<string>>(new Set());

  const [files, setFiles] = useState<UploadedDocFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<{ id: string; fileCount: number } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<UploadedDocFile | null>(
    null
  );

  const [trackerPage, setTrackerPage] = useState(1);
  const [trackerState, setTrackerState] = useState<{
    loading: boolean;
    error: string | null;
    items: PatientSubmissionStatusDTO[];
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
  // Patients get two tabs: submit, and the status of what they already sent.
  const usesTabs = !embedded && currentUser?.role === "patient";
  const [chosenTab, setChosenTab] = useState<PatientTab | null>(null);
  const tab: PatientTab = trackerState.loading && chosenTab === null
    ? "submit"
    : patientTabAfterLoad(chosenTab, trackerState.pagination.totalItems);
  const isVi = language === "vi";

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
          items?: PatientSubmissionStatusDTO[];
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

  const [namedPatient, setNamedPatient] = useState("");
  const forDoctor = currentUser?.role === "specialist";
  const patientName =
    currentUser?.role === "patient" ? currentUser.name : namedPatient.trim();

  const addFiles = useCallback(
    (list: FileList | readonly File[] | null) => {
      if (!list || list.length === 0 || isSubmitting) return;

      const messages: string[] = [];
      const existingNames = new Set(
        files.map((item) => item.name.toLowerCase())
      );
      const added: UploadedDocFile[] = [];

      Array.from(list).forEach((file, idx) => {
        const mimeType = uploadMimeType(file, embedded);
        if (!mimeType) {
          messages.push(formCopy.invalidFileType(file.name));
          return;
        }
        if (file.size > maxFileBytes) {
          messages.push(copy.fileTooLarge(file.name, maxFileMb));
          return;
        }
        const key = file.name.toLowerCase();
        if (existingNames.has(key)) {
          messages.push(copy.duplicateFile(file.name));
          return;
        }
        existingNames.add(key);

        const isImage =
          !embedded ||
          file.type.startsWith("image/") ||
          /\.(png|jpe?g|webp)$/i.test(file.name);
        const objectUrl = isImage ? URL.createObjectURL(file) : null;
        if (objectUrl) {
          unsubmittedUrlsRef.current.add(objectUrl);
        }

        added.push({
          id: objectUrl ?? `up-${Date.now()}-${idx}`,
          name: file.name,
          url: objectUrl,
          isImage,
          mimeType,
          sizeBytes: file.size,
        });
      });

      setValidationMessages(messages);
      if (added.length > 0) {
        setFiles((prev) => [...prev, ...added]);
      }
    },
    [files, copy, embedded, formCopy, isSubmitting, maxFileBytes, maxFileMb]
  );

  const removeFile = (target: UploadedDocFile) => {
    if (target.url) {
      URL.revokeObjectURL(target.url);
      unsubmittedUrlsRef.current.delete(target.url);
    }
    setFiles((prev) => prev.filter((x) => x.id !== target.id));
    setValidationMessages([]);
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

  const closeSuccessNotice = useCallback(() => {
    setReceipt(null);
    setChosenTab("status");
    setTimeout(() => trackerHeadingRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  const showSubmissionStatus = () => {
    setReceipt(null);
    setChosenTab("status");
    // The status panel mounts on the next render; focus it then.
    setTimeout(() => {
      trackerHeadingRef.current?.focus({ preventScroll: true });
      trackerHeadingRef.current?.scrollIntoView({ block: "start" });
    }, 0);
  };

  const returnHome = () => {
    setReceipt(null);
    router.push("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !currentUser || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await submitPatientUpload(patientName, files);
      if (created) {
        // Specialists keep object URLs in context for OCR previews.
        for (const f of files) {
          if (f.url) {
            if (currentUser.role === "patient") URL.revokeObjectURL(f.url);
            unsubmittedUrlsRef.current.delete(f.url);
          }
        }
        if (currentUser.role === "patient" && created.filesUploaded !== false) {
          setReceipt({ id: created.id, fileCount: files.length });
        }
        setFiles([]);
        setValidationMessages([]);
        setTrackerPage(1);
        setTrackerTick((t) => t + 1);
        setNamedPatient("");
        onSubmitted?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const Wrapper = embedded ? "section" : "main";
  const submitHint = !embedded && !isSubmitting
    ? files.length === 0 ? copy.submitEmptyHint : !currentUser ? copy.submitSignInHint : null
    : null;
  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!isSubmitting) setIsDragging(true);
    },
    onDragLeave: () => setIsDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      addFiles(event.dataTransfer.files);
    },
  };
  return (
    <Wrapper
      {...(embedded ? {} : { id: "main-content", tabIndex: -1 })}
      className={embedded ? "py-4" : "flex-1 py-5 focus:outline-none sm:py-8"}
    >
      <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        {!authLoading && !currentUser && (
          <section
            aria-label={copy.guestBannerTitle}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4"
          >
            <div>
              <h2 className="text-lg font-bold text-amber-950">
                {copy.guestBannerTitle}
              </h2>
              <p className="mt-1 text-base leading-relaxed text-amber-950">
                {copy.guestBannerDesc}
              </p>
            </div>
            <Link
              href="/login?next=/upload"
              id="upload-guest-signin-cta"
              className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 py-2 text-base font-semibold text-white shadow-2xs transition hover:bg-teal-800"
            >
              {copy.guestSignInCta}
            </Link>
          </section>
        )}

        {usesTabs && (
          <div role="tablist" aria-label={isVi ? "Hồ sơ của bạn" : "Your submissions"} className="flex gap-2 border-b border-slate-200">
            {([
              ["submit", isVi ? "Nộp hồ sơ" : "Submit"],
              ["status", (isVi ? "Trạng thái hồ sơ" : "Submission status") + ` (${trackerState.pagination.totalItems})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`patient-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`patient-panel-${key}`}
                onClick={() => setChosenTab(key)}
                className={`-mb-px min-h-11 cursor-pointer border-b-2 px-3 py-2 text-base font-semibold transition ${
                  tab === key ? "border-teal-700 text-teal-900" : "border-transparent text-slate-700 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {(!usesTabs || tab === "submit") && (
        <section
          {...(usesTabs ? { id: "patient-panel-submit", role: "tabpanel", "aria-labelledby": "patient-tab-submit" } : {})}
          className={`rounded-xl border border-slate-200 bg-white shadow-2xs ${embedded ? "p-6" : "p-4 sm:p-6"}`}
        >
          {embedded && (
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">
              {embeddedCopy.eyebrow}
            </span>
          )}
          <h1 className={`text-2xl font-bold text-slate-900 ${embedded ? "mt-1" : ""}`}>
            {formCopy.heading}
          </h1>
          <p className={embedded ? "mt-1 text-sm text-slate-600" : "mt-2 text-base leading-relaxed text-slate-800"}>{formCopy.subheading}</p>

          <form onSubmit={handleSubmit} className="mt-5">
            <input
              ref={inputRef}
              id="upload-file-input"
              name="documents"
              type="file"
              multiple
              accept={embedded ? "image/png,image/jpeg,image/webp,application/pdf,.pdf" : IMAGE_ACCEPT}
              aria-describedby="upload-file-constraints"
              className={embedded ? "sr-only" : "hidden"}
              disabled={isSubmitting}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <input
              ref={cameraInputRef}
              id="upload-camera-input"
              name="camera"
              type="file"
              accept="image/*"
              capture="environment"
              className={embedded ? "sr-only" : "hidden"}
              disabled={isSubmitting}
              onChange={(e) => {
                const photo = e.target.files?.[0];
                if (photo) addFiles([renameCapturedPhoto(photo)]);
                e.target.value = "";
              }}
            />

            {embedded ? (
              <div
                {...dropHandlers}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                  isDragging ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-slate-50"
                }`}
              >
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
                    {embeddedCopy.dropzonePrompt}
                  </span>
                  <span
                    id="upload-file-constraints"
                    className="mt-1 text-xs text-slate-600"
                  >
                    {embeddedCopy.dropzoneHint}
                  </span>
                </label>

                <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    id="upload-btn-browse"
                    onClick={() => inputRef.current?.click()}
                    disabled={isSubmitting}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    {embeddedCopy.browseBtn}
                  </button>
                  <label
                    htmlFor="upload-camera-input"
                    id="upload-btn-camera"
                    className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    {embeddedCopy.cameraBtn}
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    id="upload-btn-camera"
                    onClick={() => cameraInputRef.current?.click()}
                    aria-describedby="upload-file-constraints"
                    disabled={isSubmitting}
                    className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-base font-bold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed"
                  >
                    <UiIcon name="camera" />{copy.cameraBtn}
                  </button>
                  <button
                    type="button"
                    id="upload-btn-browse"
                    onClick={() => inputRef.current?.click()}
                    aria-describedby="upload-file-constraints"
                    disabled={isSubmitting}
                    className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-700 bg-white px-4 py-3 text-base font-bold text-teal-900 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed"
                  >
                    <UiIcon name="image" />{copy.browseBtn}
                  </button>
                </div>
                <p id="upload-file-constraints" className="mt-2 text-base leading-relaxed text-slate-700">
                  {copy.dropzoneHint(maxFileMb)}
                </p>
                <div
                  {...dropHandlers}
                  className={`hidden rounded-lg border border-dashed px-3 py-3 text-center text-base text-slate-800 lg:mt-3 lg:block ${
                    isDragging ? "border-teal-700 bg-teal-50" : "border-slate-400 bg-slate-50"
                  }`}
                >
                  {copy.dropzonePrompt}
                </div>
              </>
            )}

            {validationMessages.length > 0 && (
              <div
                role="alert"
                className={`mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-950 ${embedded ? "text-xs" : "text-base"}`}
              >
                <p className="font-bold">{copy.validationNoticeTitle}</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {[...new Set(validationMessages)].map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <p role="status" aria-live="polite" className="sr-only">
              {formCopy.stagedAnnouncement(files.length)}
            </p>

            {files.length > 0 && (
              <div className="mt-4">
                <h2 className={embedded ? "text-xs font-bold uppercase tracking-wider text-slate-600" : "text-lg font-bold text-slate-900"}>
                  {formCopy.stagedListHeading(files.length)}
                </h2>
                <ul className="mt-2 space-y-2">
                  {files.map((f, index) => {
                    const sizeText = formatFileSize(f.sizeBytes);
                    return (
                      <li
                        key={f.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 ${embedded ? "text-xs" : "text-base"}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {f.url ? (
                            <button
                              type="button"
                              onClick={() => openImagePreview(f)}
                              aria-label={copy.previewImageAction(f.name)}
                              disabled={isSubmitting}
                              className={`shrink-0 cursor-pointer overflow-hidden rounded border focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed ${embedded ? "border-slate-200 hover:border-teal-600" : "min-h-11 min-w-11 border-slate-300 hover:border-teal-700"}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={f.url}
                                alt={embedded ? f.name : ""}
                                width={embedded ? 40 : 56}
                                height={embedded ? 40 : 56}
                                className={embedded ? "size-10 object-cover" : "size-14 object-cover"}
                              />
                            </button>
                          ) : embedded && (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-700">
                              PDF
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={embedded ? "text-[11px] font-semibold text-teal-800" : "font-semibold text-teal-900"}>
                              {fileLabel(index, language)}
                            </p>
                            <p className="font-medium text-slate-900">
                              <TruncatedFilename name={f.name} />
                            </p>
                            {sizeText && (
                              <p className={embedded ? "font-mono text-[11px] text-slate-600" : "text-base text-slate-700"}>
                                {sizeText}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(f)}
                          disabled={isSubmitting}
                          className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-700 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed ${embedded ? "size-10" : "size-11"}`}
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

            {forDoctor && (
              <label className="mt-5 block text-sm font-medium text-slate-700">
                Tên bệnh nhân <span className="font-normal text-slate-500">(không bắt buộc, tên đã có trên phiếu)</span>
                <input
                  type="text"
                  value={namedPatient}
                  onChange={(event) => setNamedPatient(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Họ tên bệnh nhân của bộ ảnh này"
                />
              </label>
            )}
            <button
              type="submit"
              id="upload-btn-submit"
              disabled={files.length === 0 || !currentUser || isSubmitting}
              aria-describedby={submitHint ? "upload-submit-hint" : undefined}
              className={`mt-5 min-h-11 w-full cursor-pointer rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white shadow-2xs transition enabled:hover:bg-teal-800 disabled:cursor-not-allowed ${embedded ? "text-sm disabled:opacity-50" : "text-base disabled:bg-slate-200 disabled:text-slate-700"}`}
            >
              {isSubmitting ? formCopy.submittingBtn : formCopy.submitBtn}
            </button>
            {submitHint && (
              <p id="upload-submit-hint" className="mt-2 text-center text-base text-slate-800">{submitHint}</p>
            )}
          </form>
          {!embedded && <PatientPhotoTips copy={copy} />}
        </section>
        )}

        {currentUser?.role === "patient" && (!usesTabs || tab === "status") && (
          <section
            {...(usesTabs ? { id: "patient-panel-status", role: "tabpanel", "aria-labelledby": "patient-tab-status" } : {})}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 ref={trackerHeadingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-bold text-slate-900">
                {copy.trackerHeading}
              </h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-base font-semibold text-slate-800">
                {copy.trackerCount(trackerState.pagination.totalItems)}
              </span>
            </div>

            {trackerState.error && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-base text-rose-900"
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
                <p className="text-base text-slate-800">{copy.trackerEmpty}</p>
              ) : (
                trackerState.items.map(({ record: p, dbSubmissionId }) => (
                  <article
                    key={dbSubmissionId}
                    className="rounded-lg border border-slate-200 p-3 text-base sm:p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold text-slate-900">
                        {p.patientName} •{" "}
                        <span className="wrap-anywhere">{p.studyId}</span>
                      </p>
                      {p.submittedAt && (
                        <span className="font-semibold text-slate-700">
                          {p.submittedAt}
                        </span>
                      )}
                    </div>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.uploadedFiles?.map((f) => (
                        <li key={f.id} className="min-w-0 max-w-full">
                          <span className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-base text-slate-800">
                            <TruncatedFilename name={f.name} />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <PatientSubmissionProgress
                      processingStage={p.processingStage}
                      submissionStatus={p.submissionStatus}
                      copy={copy}
                    />
                  </article>
              ))
            )}
          </div>

          {trackerState.pagination.totalPages > 1 && (
            <nav
              aria-label={copy.paginationLabel}
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-base"
            >
              <span className="font-semibold text-slate-800">
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
                  className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-800 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
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
                  className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-800 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                >
                  {copy.nextPage} →
                </button>
              </div>
            </nav>
          )}
          {usesTabs && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                id="patient-submit-more"
                onClick={() => setChosenTab("submit")}
                className="min-h-11 cursor-pointer rounded-lg bg-teal-700 px-4 py-2 text-base font-semibold text-white hover:bg-teal-800"
              >
                {isVi ? "+ Nộp thêm hồ sơ" : "+ Submit more"}
              </button>
            </div>
          )}
        </section>
      )}
      {!embedded && (
        <p className="wrap-anywhere px-1 text-base leading-relaxed text-slate-800">
          {portal.supportLine(portal.contactEmail, portal.contactPhone)}
        </p>
      )}
    </div>

    {currentUser?.role === "patient" && receipt && (
      <div className="[&_button]:text-base">
          <CenterNotice
            open
            tone="success"
            title={portal.successTitle}
            onClose={closeSuccessNotice}
            actions={[
              { label: portal.successStatusBtn, onClick: showSubmissionStatus },
              { label: portal.successHomeBtn, onClick: returnHome, variant: "secondary" },
            ]}
          >
            <p className="text-base leading-relaxed text-slate-800">{portal.successBody(portal.contactLead, portal.contactEmail)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-base text-slate-800">
              <div>
                <dt>{portal.successCodeLabel}</dt>
                <dd className="break-all font-mono font-semibold text-slate-900">{receipt.id}</dd>
              </div>
            <div>
              <dt>{portal.successFilesLabel}</dt>
              <dd className="font-mono font-semibold text-slate-900">{receipt.fileCount}</dd>
            </div>
          </dl>
        </CenterNotice>
        </div>
      )}

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
                  className={embedded ? "text-sm font-bold text-slate-900" : "text-lg font-bold text-slate-900"}
                >
                  {formCopy.previewDialogTitle}
                </h2>
                <p className={embedded ? "mt-0.5 font-mono text-xs text-slate-600" : "mt-1 text-base text-slate-800"}>
                  <TruncatedFilename name={previewTarget.name} />
                </p>
              </div>
              <button
                type="button"
                onClick={closeImagePreview}
                className={`cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 ${embedded ? "min-h-9 text-xs" : "min-h-11 text-base"}`}
              >
                {formCopy.previewDialogClose}
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
    </Wrapper>
  );
}

function PatientPhotoTips({ copy }: { copy: ReturnType<typeof getUploadPageCopy>["patient"] }) {
  return (
    <div className="mt-6 space-y-5 border-t border-slate-200 pt-5">
      <section aria-labelledby="upload-photo-tips-heading" className="flex items-start gap-3 rounded-xl bg-teal-50 p-3 sm:gap-4 sm:p-4">
        <svg aria-hidden="true" viewBox="0 0 72 72" className="size-12 shrink-0 rounded-xl bg-white text-teal-800 sm:size-16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 11h18l8 8v32H23z" fill="white" />
          <path d="M41 11v8h8M29 26h14m-14 7h14m-14 7h8" />
          <path d="M17 17h-6v8m44-8h6v8M17 55h-6v-8m44 8h6v-8" />
          <path d="m42 55 5 5 9-11" className="stroke-teal-700" />
        </svg>
        <div>
          <h2 id="upload-photo-tips-heading" className="text-lg font-bold text-slate-900">{copy.photoTipsHeading}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-base leading-relaxed text-slate-800">
            {copy.photoTips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
      </section>
      <section aria-labelledby="upload-suggested-records-heading">
        <h2 id="upload-suggested-records-heading" className="text-lg font-bold text-slate-900">{copy.suggestedRecordsHeading}</h2>
        <p className="mt-1 text-base leading-relaxed text-slate-800">{copy.suggestedRecords}</p>
      </section>
    </div>
  );
}
