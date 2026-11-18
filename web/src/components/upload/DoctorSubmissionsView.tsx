"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import {
  SleCrfPatientRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";
import { getUploadPageCopy, type UploadPageCopy } from "@/data/uploadTranslations";
import {
  CLINICAL_RISK_FILTERS,
  DEFAULT_SUBMISSION_FILTERS,
  GENDER_FILTERS,
  PAGE_SIZE_OPTIONS,
  SUBMISSION_REVIEW_FILTERS,
  SUBMISSION_SORT_OPTIONS,
  UPLOADED_DATE_PRESETS,
  buildSubmissionFilterSearchParams,
  countActiveDoctorFilters,
  type PaginationMeta,
  type SubmissionQueryFilters,
  type UploadedDatePreset,
} from "@/lib/submissionFilters";
import type { SubmissionItemDTO as ApiSubmissionItem } from "@/lib/submissionsService";
import { CrfAdminFacts } from "./CrfAdminFacts";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { TruncatedFilename } from "./TruncatedFilename";

const PIPELINE_BADGES = {
  none: { label: "Chưa gửi", tone: "bg-slate-100 text-slate-700" },
  privacy_check: { label: "Đang kiểm tra che", tone: "bg-sky-100 text-sky-900" },
  privacy_review: { label: "Chờ duyệt che", tone: "bg-amber-100 text-amber-950" },
  processing: { label: "Đang xử lý", tone: "bg-sky-100 text-sky-900" },
  completed: { label: "Đã đọc xong", tone: "bg-teal-100 text-teal-900" },
  failed: { label: "Lỗi", tone: "bg-rose-100 text-rose-950" },
} satisfies Record<NonNullable<ApiSubmissionItem["pipelineStatus"]>, { label: string; tone: string }>;

interface ApiSubmissionsResponse {
  items: ApiSubmissionItem[];
  stats: {
    total: number;
    new: number;
    pending: number;
    approved: number;
    manualRequiredDossiers: number;
    filteredTotal: number;
  };
  pagination: PaginationMeta;
}

type DossierLayoutMode = "grid" | "list";
const LAYOUT_STORAGE_KEY = "lupiva-upload-layout";
const LAYOUT_CHANGE_EVENT = "lupiva-upload-layout-change";

function subscribeLayoutMode(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === LAYOUT_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LAYOUT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LAYOUT_CHANGE_EVENT, callback);
  };
}

function getClientLayoutMode(): DossierLayoutMode {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === "list" || stored === "grid") return stored;
  } catch {
    // ignore storage access errors
  }
  return "grid";
}

function getServerLayoutMode(): DossierLayoutMode {
  return "grid";
}

function DocumentsAndTreatmentsGrid({
  patient,
  copy,
  onOpenDocument,
  showCareTeam = false,
  className = "",
}: {
  patient: SleCrfPatientRecord;
  copy: UploadPageCopy["doctor"];
  onOpenDocument: (patient: SleCrfPatientRecord, fileId: string) => void;
  showCareTeam?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 @md:grid-cols-2 ${className}`}>
      <div>
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {copy.attachedDocsHeading}
        </h3>
        {patient.uploadedFiles && patient.uploadedFiles.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {patient.uploadedFiles.map((f) => {
              const extBadge = f.isImage
                ? "IMG"
                : /\.docx?$/i.test(f.name)
                ? "DOCX"
                : "PDF";
              return (
                <li key={f.id} className="min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => onOpenDocument(patient, f.id)}
                    title={copy.openDocHint}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-700/30 bg-teal-50/60 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-900 transition hover:border-teal-700 hover:bg-teal-100/70 cursor-pointer"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-teal-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="shrink-0 font-bold text-teal-900">
                      {extBadge}:
                    </span>
                    <TruncatedFilename name={f.name} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-600">{copy.noAttachedDocs}</p>
        )}
        {showCareTeam && (
          <p className="mt-2 text-xs text-slate-600">
            {copy.physicianPrefix}{" "}
            <strong className="text-slate-900">{patient.physician}</strong> •{" "}
            {copy.nursePrefix}{" "}
            <span className="text-slate-700">{patient.nurse}</span>
          </p>
        )}
      </div>

      <div>
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {copy.treatmentsHeading}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {patient.treatments.length > 0 ? (
            patient.treatments.map((trt) => (
              <span
                key={trt.id}
                className="rounded-md border border-teal-200 bg-teal-50/70 px-2 py-0.5 text-[11px] font-medium text-teal-950"
              >
                {trt.name} ({trt.dose})
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-600">{copy.noTreatments}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PatientDossierCard({
  item,
  copy,
  onOpenRegistry,
  onOpenDocument,
  onRetried,
}: {
  item: ApiSubmissionItem;
  copy: UploadPageCopy["doctor"];
  onOpenRegistry: (intakeId: string) => void;
  onOpenDocument: (patient: SleCrfPatientRecord, fileId: string) => void;
  onRetried: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const p = item.record;
  const pipelineStatus = item.pipelineStatus ?? "none";
  const pipelineBadge = PIPELINE_BADGES[pipelineStatus];
  const approved = getSubmissionStatus(p) === "approved";
  // Once the backend has read the images, age/BMI/Physician/Nurse… come from its CRF
  // (and are corrected on "Duyệt hồ sơ"), not from this submission's own profile.
  const fromCrf = pipelineStatus === "completed" && !!item.pipelineIntakeId;
  const h = parseFloat(p.heightCm);
  const w = parseFloat(p.weightKg);
  const bmi = h > 0 && w > 0 ? (w / Math.pow(h / 100, 2)).toFixed(1) : "—";
  const eular = calculateEularAcrSummary(
    p.eularAcrCriteria,
    p.anaEntryCriterionMet
  );
  const sledai = calculateSledai2kSummary(p.sledai2kCriteria);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/submissions/${item.dbSubmissionId}/retry`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Không gửi lại được hồ sơ.");
      }
      onRetried();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Không gửi lại được hồ sơ.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <article className="@container flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* Card Header: PID Identifier, Personal Information, Uploaded Date & Status-Specific Actions */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 @lg:px-6">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
              {copy.pidPrefix} {p.studyId}
            </span>
            <h2 className="text-base font-bold text-slate-900">
              {p.patientName}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                approved
                  ? "bg-teal-100 text-teal-900"
                  : "bg-amber-100 text-amber-950"
              }`}
            >
              {approved ? copy.approvedBadge : copy.pendingBadge}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pipelineBadge.tone}`}>
              {pipelineBadge.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            {!fromCrf && (
            <span>
              {p.age || "—"} {copy.ageUnit} •{" "}
              {p.gender === "Female" ? copy.female : p.gender === "Male" ? copy.male : "—"} • {p.heightCm || "—"}{" "}
              cm / {p.weightKg || "—"} kg (BMI{" "}
              <span className="font-mono font-semibold text-slate-800">
                {bmi}
              </span>
              ) • ICF: <span className="font-mono">{p.icfSignedDate || "—"}</span>
            </span>
            )}
            {p.submittedAt ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700">
                <span>{copy.submittedAtPrefix}</span>
                <strong className="font-semibold text-slate-900">
                  {p.submittedAt}
                </strong>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pipelineStatus === "failed" && (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void handleRetry()}
              className="min-h-9 cursor-pointer rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-900 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
            >
              {retrying ? "Đang gửi lại…" : "Gửi lại"}
            </button>
          )}
          {(() => {
            // Review opens only once the backend has finished reading the images.
            const ready = pipelineStatus === "completed" && !!item.pipelineIntakeId;
            const waiting =
              pipelineStatus === "failed"
                ? "Xử lý lỗi"
                : pipelineStatus === "privacy_review"
                  ? "Chờ duyệt vùng che"
                  : "Đang xử lý…";
            return (
              <button
                type="button"
                disabled={!ready}
                title={ready ? undefined : "Hồ sơ chưa xử lý xong; nút sẽ bật khi đọc ảnh xong"}
                onClick={() => ready && onOpenRegistry(item.pipelineIntakeId!)}
                className={
                  ready
                    ? "min-h-9 cursor-pointer rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800"
                    : "min-h-9 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400"
                }
              >
                {ready ? copy.reviewCrfBtn : waiting}
              </button>
            );
          })()}
        </div>
      </header>

      {pipelineStatus === "failed" && item.pipelineError && (
        <p className="break-words border-b border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-950 @lg:px-6">
          {item.pipelineError}
        </p>
      )}
      {pipelineStatus === "privacy_review" && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-950 @lg:px-6">
          Cần duyệt vùng che trên giao diện duyệt nguồn (backend) trước khi gửi
        </p>
      )}
      {retryError && (
        <p role="alert" className="px-5 py-3 text-xs text-rose-900 @lg:px-6">
          {retryError}
        </p>
      )}
      {fromCrf && <CrfAdminFacts intakeId={item.pipelineIntakeId!} />}

      {approved ? (
        /* Approved Dossiers: Attached Documents & Current Treatments + SLE Score Preview */
        <div className="grid flex-1 grid-cols-1 gap-4 px-5 py-3.5 @lg:px-6 @2xl:grid-cols-12 @2xl:items-start">
          <div className="@2xl:col-span-7">
            <DocumentsAndTreatmentsGrid
              patient={p}
              copy={copy}
              onOpenDocument={onOpenDocument}
            />
          </div>

          <div className="border-t border-slate-200 pt-3 @2xl:col-span-5 @2xl:border-t-0 @2xl:border-l @2xl:pl-5 @2xl:pt-0">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {copy.scorePreviewHeading}
            </h3>

            <div className="mt-2 grid grid-cols-1 gap-2 @sm:grid-cols-2">
              <div
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                  eular.isClassifiedSle
                    ? "border-teal-200 bg-teal-50/60"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <span className="font-semibold text-slate-700">
                  EULAR/ACR 2019
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {eular.totalScore} pts
                </span>
              </div>

              <div
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                  sledai.badgeTone === "rose"
                    ? "border-rose-200 bg-rose-50/60"
                    : sledai.badgeTone === "amber"
                    ? "border-amber-200 bg-amber-50/60"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <span className="font-semibold text-slate-700">SLEDAI-2K</span>
                <span className="font-mono font-bold text-slate-900">
                  {sledai.totalScore} pts
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Pending Review Dossiers: Concise 1-Line OCR Triage + Expandable Documents & Treatments */
        <>
          {item.pipelineIntakeId ? (
            <p className="px-5 py-3 text-xs text-slate-600 @lg:px-6">
              Dữ liệu đọc từ ảnh nằm ở phiếu CRF backend; bấm &quot;{copy.reviewCrfBtn}&quot; để xem nguồn và duyệt.
            </p>
          ) : (
          <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 @lg:px-6">
            <h3 className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {copy.triageHeading}
            </h3>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 font-mono text-xs @xs:grid-cols-3">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 whitespace-nowrap text-rose-950">
                <span className="text-[11px] font-semibold text-rose-800">
                  {copy.manualTierLabel}
                </span>
                <span className="text-sm font-bold">
                  {item.ocrSummary.manualCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 whitespace-nowrap text-amber-950">
                <span className="text-[11px] font-semibold text-amber-900">
                  {copy.verifyTierLabel}
                </span>
                <span className="text-sm font-bold">
                  {item.ocrSummary.verifyCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 whitespace-nowrap text-teal-950">
                <span className="text-[11px] font-semibold text-teal-800">
                  {copy.approvedTierLabel}
                </span>
                <span className="text-sm font-bold">
                  {item.ocrSummary.approvedCount}
                </span>
              </div>
            </div>
          </div>
          )}

          <details className="group mt-auto border-t border-slate-200 bg-slate-50/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100/80 @lg:px-6">
              <span>
                {copy.clinicalDetailsSummary(
                  p.uploadedFiles?.length ?? 0,
                  p.treatments.length
                )}
              </span>
              <svg
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>

            <DocumentsAndTreatmentsGrid
              patient={p}
              copy={copy}
              onOpenDocument={onOpenDocument}
              showCareTeam={!fromCrf}
              className="border-t border-slate-200 bg-white px-5 py-3.5 @lg:px-6"
            />
          </details>
        </>
      )}
    </article>
  );
}

export function DoctorSubmissionsView() {
  const router = useRouter();
  const { language, mergeCrfPatientsFromApi } =
    useLupiva();
  const isVi = language === "vi";
  const copy = getUploadPageCopy(language).doctor;

  const [filters, setFilters] = useState<SubmissionQueryFilters>(
    DEFAULT_SUBMISSION_FILTERS
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const silentReloadRef = useRef(false);
  const [viewerTarget, setViewerTarget] = useState<{
    patient: SleCrfPatientRecord;
    fileId: string;
  } | null>(null);
  const layoutMode = useSyncExternalStore(
    subscribeLayoutMode,
    getClientLayoutMode,
    getServerLayoutMode
  );
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || "focusGroup" in HTMLElement.prototype) return;
    const buttons = Array.from(
      bar.querySelectorAll<HTMLButtonElement>("button")
    );
    buttons.forEach((btn) => {
      btn.tabIndex = btn.getAttribute("aria-pressed") === "true" ? 0 : -1;
    });
  }, [layoutMode]);

  const handleLayoutModeChange = (mode: DossierLayoutMode) => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      // ignore storage access errors
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(LAYOUT_CHANGE_EVENT));
    }
  };

  const handleToolbarFocusCapture = (
    e: React.FocusEvent<HTMLDivElement>
  ) => {
    if ("focusGroup" in HTMLElement.prototype) return;
    const bar = toolbarRef.current;
    if (!bar) return;
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const buttons = Array.from(
      bar.querySelectorAll<HTMLButtonElement>("button")
    );
    if (!buttons.includes(target)) return;
    buttons.forEach((btn) => {
      btn.tabIndex = btn === target ? 0 : -1;
    });
  };

  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ("focusGroup" in HTMLElement.prototype) return;
    const bar = toolbarRef.current;
    if (!bar) return;
    const buttons = Array.from(
      bar.querySelectorAll<HTMLButtonElement>("button")
    );
    const currentIdx = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    );
    if (currentIdx === -1 || buttons.length === 0) return;

    const rtl = getComputedStyle(bar).direction === "rtl";
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") {
      nextIdx = (currentIdx + (rtl ? -1 : 1) + buttons.length) % buttons.length;
    } else if (e.key === "ArrowLeft") {
      nextIdx = (currentIdx + (rtl ? 1 : -1) + buttons.length) % buttons.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = buttons.length - 1;
    }

    if (nextIdx !== null) {
      e.preventDefault();
      buttons[nextIdx]?.focus();
    }
  };

  const [apiState, setApiState] = useState<{
    loading: boolean;
    error: string | null;
    data: ApiSubmissionsResponse | null;
  }>({
    loading: true,
    error: null,
    data: null,
  });

  // Debounce text query before triggering API fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Server-side API query whenever any filter or sort changes
  useEffect(() => {
    const controller = new AbortController();
    const utcOffsetMinutes = -new Date().getTimezoneOffset();
    const effectiveFilters: SubmissionQueryFilters = {
      ...filters,
      q: debouncedSearch,
      utcOffsetMinutes,
    };
    const query = buildSubmissionFilterSearchParams(effectiveFilters);

    async function loadSubmissions() {
      // A background status poll refreshes the list without the loading state.
      const silent = silentReloadRef.current;
      silentReloadRef.current = false;
      if (!silent) setApiState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`/api/submissions?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({}))) as
          | ApiSubmissionsResponse
          | { error?: string };

        if (!res.ok || !("items" in payload)) {
          const message =
            ("error" in payload && payload.error) || copy.errorTitle;
          setApiState((prev) => ({
            loading: false,
            error: message,
            data: prev.data,
          }));
          return;
        }

        mergeCrfPatientsFromApi(payload.items.map((item) => item.record));
        setApiState({ loading: false, error: null, data: payload });
      } catch (err) {
        if (controller.signal.aborted) return;
        setApiState((prev) => ({
          loading: false,
          error: err instanceof Error ? err.message : copy.errorTitle,
          data: prev.data,
        }));
      }
    }

    void loadSubmissions();
    return () => controller.abort();
  }, [
    filters,
    debouncedSearch,
    reloadTick,
    copy.errorTitle,
    mergeCrfPatientsFromApi,
  ]);

  // While the backend is still reading a submission, re-check every 10 s so the
  // review button turns on without reloading the page.
  const hasPending = (apiState.data?.items ?? []).some(
    (item) => item.pipelineStatus === "processing" || item.pipelineStatus === "privacy_check",
  );
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      silentReloadRef.current = true;
      setReloadTick((n) => n + 1);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [hasPending]);

  const activeFilterCount = countActiveDoctorFilters({
    ...filters,
    q: searchInput,
  });

  const handleResetFilters = () => {
    setFilters(DEFAULT_SUBMISSION_FILTERS);
    setSearchInput("");
    setDebouncedSearch("");
  };

  const handleDatePresetChange = (preset: UploadedDatePreset) => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      datePreset: preset,
      fromDate: preset === "custom" ? prev.fromDate : "",
      toDate: preset === "custom" ? prev.toDate : "",
    }));
  };

  const handleCustomDateChange = (
    bound: "fromDate" | "toDate",
    value: string
  ) => {
    setFilters((prev) => {
      const nextFrom = bound === "fromDate" ? value : prev.fromDate ?? "";
      const nextTo = bound === "toDate" ? value : prev.toDate ?? "";
      return {
        ...prev,
        page: 1,
        datePreset: nextFrom || nextTo ? "custom" : "all",
        fromDate: nextFrom,
        toDate: nextTo,
      };
    });
  };

  const handlePageChange = (nextPage: number) => {
    setFilters((prev) => ({ ...prev, page: nextPage }));
    if (typeof window !== "undefined" && window.scrollY > 240) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  };

  const openRegistry = (intakeId: string) => {
    router.push(`/registry?intake=${encodeURIComponent(intakeId)}`);
  };

  const stats = apiState.data?.stats ?? {
    total: 0,
    new: 0,
    pending: 0,
    approved: 0,
    manualRequiredDossiers: 0,
    filteredTotal: 0,
  };
  const pagination: PaginationMeta = apiState.data?.pagination ?? {
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };
  const items = apiState.data?.items ?? [];
  const rangeStart =
    pagination.totalItems === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 py-8 focus:outline-none"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header, Cohort KPIs & Server-Backed Filter Toolbar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
                {copy.eyebrow}
              </span>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                {copy.heading}
              </h1>
            </div>

            <dl className="grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-slate-600">
                  {copy.kpiTotal}
                </dt>
                <dd className="mt-0.5 font-mono text-xl font-bold text-slate-900">
                  {stats.total}
                </dd>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-amber-900">
                  {copy.kpiPending}
                </dt>
                <dd className="mt-0.5 font-mono text-xl font-bold text-amber-950">
                  {stats.pending}
                </dd>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-rose-900">
                  {copy.kpiManual}
                </dt>
                <dd className="mt-0.5 font-mono text-xl font-bold text-rose-950">
                  {stats.manualRequiredDossiers}
                </dd>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-teal-900">
                  {copy.kpiApproved}
                </dt>
                <dd className="mt-0.5 font-mono text-xl font-bold text-teal-950">
                  {stats.approved}
                </dd>
              </div>
            </dl>
          </div>

          {/* Semantic <search><form> Filter Controls */}
          <search className="mt-5 border-t border-slate-200 pt-4">
            <form
              aria-labelledby="doctor-filter-heading"
              onSubmit={(e) => e.preventDefault()}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="doctor-filter-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  {copy.filterHeading}
                </h2>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    id="doctor-filter-reset"
                    onClick={handleResetFilters}
                    className="min-h-8 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 cursor-pointer"
                  >
                    {copy.resetFilters} ({copy.activeFiltersBadge(activeFilterCount)})
                  </button>
                )}
              </div>

              {/* Row 1: Submission Status + Search + Sort */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <fieldset className="space-y-1">
                  <legend className="text-[11px] font-semibold text-slate-600">
                    {copy.statusLegend}
                  </legend>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SUBMISSION_REVIEW_FILTERS.map((key) => {
                      const count =
                        key === "all"
                          ? stats.total
                          : key === "new"
                          ? stats.new
                          : key === "pending_doctor_review"
                          ? stats.pending
                          : stats.approved;
                      const isActive = filters.status === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          id={`doctor-filter-status-${key}`}
                          aria-pressed={isActive}
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              page: 1,
                              status: key,
                            }))
                          }
                          className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                            isActive
                              ? "bg-teal-700 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
                          }`}
                        >
                          {copy.statusOptions[key]} ({count})
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:w-72">
                    <label
                      htmlFor="doctor-submissions-search"
                      className="text-[11px] font-semibold text-slate-600"
                    >
                      {copy.searchLabel}
                    </label>
                    <input
                      id="doctor-submissions-search"
                      name="q"
                      type="search"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        setFilters((prev) =>
                          prev.page === 1 ? prev : { ...prev, page: 1 }
                        );
                      }}
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={copy.searchPlaceholder}
                      className="min-h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-teal-700"
                    />
                  </div>

                  <div className="flex flex-col gap-1 sm:w-56">
                    <label
                      htmlFor="doctor-filter-sort"
                      className="text-[11px] font-semibold text-slate-600"
                    >
                      {copy.sortLabel}
                    </label>
                    <select
                      id="doctor-filter-sort"
                      name="sort"
                      value={filters.sort}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          page: 1,
                          sort: e.target
                            .value as SubmissionQueryFilters["sort"],
                        }))
                      }
                      className="min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-700"
                    >
                      {SUBMISSION_SORT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {copy.sortOptions[opt]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 2: Uploaded Date, Custom Range, SLE Risk, Sex */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="doctor-filter-date-preset"
                    className="text-[11px] font-semibold text-slate-700"
                  >
                    {copy.datePresetLabel}
                  </label>
                  <select
                    id="doctor-filter-date-preset"
                    name="datePreset"
                    value={filters.datePreset}
                    onChange={(e) =>
                      handleDatePresetChange(
                        e.target.value as UploadedDatePreset
                      )
                    }
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700"
                  >
                    {UPLOADED_DATE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {copy.datePresetOptions[preset]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="doctor-filter-from-date"
                    className="text-[11px] font-semibold text-slate-700"
                  >
                    {copy.fromDateLabel}
                  </label>
                  <input
                    id="doctor-filter-from-date"
                    name="fromDate"
                    type="date"
                    value={filters.fromDate ?? ""}
                    max={filters.toDate || undefined}
                    onChange={(e) =>
                      handleCustomDateChange("fromDate", e.target.value)
                    }
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="doctor-filter-to-date"
                    className="text-[11px] font-semibold text-slate-700"
                  >
                    {copy.toDateLabel}
                  </label>
                  <input
                    id="doctor-filter-to-date"
                    name="toDate"
                    type="date"
                    value={filters.toDate ?? ""}
                    min={filters.fromDate || undefined}
                    onChange={(e) =>
                      handleCustomDateChange("toDate", e.target.value)
                    }
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="doctor-filter-risk"
                    className="text-[11px] font-semibold text-slate-700"
                  >
                    {copy.clinicalRiskLabel}
                  </label>
                  <select
                    id="doctor-filter-risk"
                    name="clinicalRisk"
                    value={filters.clinicalRisk}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        clinicalRisk: e.target
                          .value as SubmissionQueryFilters["clinicalRisk"],
                      }))
                    }
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700"
                  >
                    {CLINICAL_RISK_FILTERS.map((opt) => (
                      <option key={opt} value={opt}>
                        {copy.clinicalRiskOptions[opt]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="doctor-filter-gender"
                    className="text-[11px] font-semibold text-slate-700"
                  >
                    {copy.genderLabel}
                  </label>
                  <select
                    id="doctor-filter-gender"
                    name="gender"
                    value={filters.gender}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        gender: e.target
                          .value as SubmissionQueryFilters["gender"],
                      }))
                    }
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700"
                  >
                    {GENDER_FILTERS.map((opt) => (
                      <option key={opt} value={opt}>
                        {copy.genderOptions[opt]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          </search>

          {/* Results Summary, Display Mode Switcher & Inline Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <p
                role="status"
                aria-live="polite"
                className="text-xs font-medium text-slate-700"
              >
                {apiState.data
                  ? pagination.totalItems === 0
                    ? copy.resultsEmptyAnnouncement
                    : copy.resultsAnnouncement(
                        rangeStart,
                        rangeEnd,
                        pagination.totalItems,
                        pagination.page,
                        pagination.totalPages
                      )
                  : ""}
              </p>
              {apiState.loading && (
                <span className="font-mono text-xs text-teal-800">
                  {copy.loadingText}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Grid / List View Mode Toolbar */}
              <div
                ref={toolbarRef}
                role="toolbar"
                aria-label={copy.viewToolbarLabel}
                aria-controls="doctor-dossiers-container"
                {...({ focusgroup: "toolbar wrap" } as Record<string, string>)}
                onFocusCapture={handleToolbarFocusCapture}
                onKeyDown={handleToolbarKeyDown}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/90 p-0.5"
              >
                <div
                  role="group"
                  aria-label={copy.viewModeLabel}
                  className="inline-flex items-center gap-0.5"
                >
                  <button
                    type="button"
                    id="doctor-layout-grid"
                    aria-pressed={layoutMode === "grid"}
                    onClick={() => handleLayoutModeChange("grid")}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 transition cursor-pointer hover:text-slate-900 aria-[pressed=true]:bg-teal-700 aria-[pressed=true]:text-white aria-[pressed=true]:shadow-2xs forced-colors:aria-[pressed=true]:border forced-colors:aria-[pressed=true]:border-[Highlight]"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span>{copy.viewGridLabel}</span>
                  </button>

                  <button
                    type="button"
                    id="doctor-layout-list"
                    aria-pressed={layoutMode === "list"}
                    onClick={() => handleLayoutModeChange("list")}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 transition cursor-pointer hover:text-slate-900 aria-[pressed=true]:bg-teal-700 aria-[pressed=true]:text-white aria-[pressed=true]:shadow-2xs forced-colors:aria-[pressed=true]:border forced-colors:aria-[pressed=true]:border-[Highlight]"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
                      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
                      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    <span>{copy.viewListLabel}</span>
                  </button>
                </div>
              </div>

              {/* Inline Server-Backed Pagination */}
              {pagination.totalItems > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700">
                    <label
                      htmlFor="doctor-pagination-pagesize"
                      className="text-slate-600"
                    >
                      {copy.perPageLabel}
                    </label>
                    <select
                      id="doctor-pagination-pagesize"
                      name="pageSize"
                      value={filters.pageSize}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          page: 1,
                          pageSize: Number(e.target.value),
                        }))
                      }
                      className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-teal-700"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>

                  <nav
                    aria-label={copy.paginationLabel}
                    className="flex flex-wrap items-center gap-1"
                  >
                    <button
                      type="button"
                      id="doctor-pagination-prev"
                      disabled={!pagination.hasPreviousPage || apiState.loading}
                      onClick={() => handlePageChange(pagination.page - 1)}
                      className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                    >
                      ← {copy.prevPage}
                    </button>

                    {Array.from(
                      { length: pagination.totalPages },
                      (_, i) => i + 1
                    ).map((pageNum) => {
                      const isCurrent = pageNum === pagination.page;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          id={`doctor-pagination-page-${pageNum}`}
                          aria-label={copy.pageLabel(pageNum)}
                          aria-current={isCurrent ? "page" : undefined}
                          disabled={apiState.loading}
                          onClick={() => handlePageChange(pageNum)}
                          className={`min-h-9 min-w-9 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition cursor-pointer ${
                            isCurrent
                              ? "bg-teal-700 text-white shadow-2xs"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      id="doctor-pagination-next"
                      disabled={!pagination.hasNextPage || apiState.loading}
                      onClick={() => handlePageChange(pagination.page + 1)}
                      className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                    >
                      {copy.nextPage} →
                    </button>
                  </nav>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* API Error Alert */}
        {apiState.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-950"
          >
            <div>
              <p className="font-semibold">{copy.errorTitle}</p>
              <p className="mt-0.5 text-xs text-rose-800">{apiState.error}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="min-h-9 rounded-lg border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer"
            >
              {copy.retryBtn}
            </button>
          </div>
        )}

        {/* Patient Dossier Cards (Grid Default / List Toggle) */}
        <div
          id="doctor-dossiers-container"
          aria-busy={apiState.loading}
          className={`grid grid-cols-1 gap-4 transition-opacity ${
            layoutMode === "grid" ? "md:grid-cols-2" : ""
          } ${apiState.loading && items.length > 0 ? "opacity-70" : "opacity-100"}`}
        >
          {apiState.loading && items.length === 0 ? (
            <>
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-6"
                />
              ))}
            </>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center md:col-span-full">
              <p className="text-sm font-semibold text-slate-800">
                {copy.emptyTitle}
              </p>
              <p className="mt-1 text-xs text-slate-600">{copy.emptyHint}</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 min-h-9 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
                >
                  {copy.resetFilters}
                </button>
              )}
            </div>
          ) : (
            items.map((item) => (
              <PatientDossierCard
                key={item.dbSubmissionId}
                item={item}
                copy={copy}
                onOpenRegistry={openRegistry}
                onOpenDocument={(patient, fileId) =>
                  setViewerTarget({ patient, fileId })
                }
                onRetried={() => setReloadTick((n) => n + 1)}
              />
            ))
          )}
        </div>
      </div>

      {/* On-Screen Attached Document Viewer Modal */}
      <DocumentPreviewModal
        patient={viewerTarget?.patient ?? null}
        activeFileId={viewerTarget?.fileId ?? null}
        isVi={isVi}
        copy={copy}
        onClose={() => setViewerTarget(null)}
        onSelectFile={(fileId) =>
          setViewerTarget((prev) => (prev ? { ...prev, fileId } : null))
        }
      />
    </main>
  );
}
