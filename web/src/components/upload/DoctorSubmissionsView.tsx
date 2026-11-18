"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import {
  SleCrfPatientRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";
import { TRANSLATIONS } from "@/data/translations";
import { getUploadPageCopy, type UploadPageCopy } from "@/data/uploadTranslations";
import {
  CLINICAL_RISK_FILTERS,
  DEFAULT_DOCTOR_SUBMISSION_FILTERS,
  GENDER_FILTERS,
  PAGE_SIZE_OPTIONS,
  SUBMISSION_SORT_OPTIONS,
  UPLOADED_DATE_PRESETS,
  buildSubmissionFilterSearchParams,
  countActiveDoctorFilters,
  type PaginationMeta,
  type SubmissionQueryFilters,
  type UploadedDatePreset,
} from "@/lib/submissionFilters";
import {
  reviewProgress,
  stageLabel,
  submissionStage,
  type SubmissionStage,
} from "@/lib/crfEvidence";
import type { SubmissionItemDTO as ApiSubmissionItem } from "@/lib/submissionsService";
import { classifyPipelineError, dashboardPatient, dashboardReviewer, groupDashboardRows, sectionProgress, type SectionTone } from "@/lib/doctorDashboard";
import { CrfAdminFacts, useCrfCases, type CrfCaseState } from "./CrfAdminFacts";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { RedcapExportPanel } from "./RedcapExportPanel";
import { TruncatedFilename } from "./TruncatedFilename";

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

const STAGE_TONES: Record<SubmissionStage, string> = {
  processing: "bg-sky-100 text-sky-900",
  failed: "bg-rose-100 text-rose-950",
  awaiting: "bg-amber-100 text-amber-950",
  reviewing: "bg-indigo-100 text-indigo-950",
  approved: "bg-teal-100 text-teal-900",
  exported: "bg-teal-100 text-teal-900",
};

const STATUS_COUNTERS = ["new", "pending_doctor_review", "approved"] as const;
type StatusCounter = (typeof STATUS_COUNTERS)[number];

const DOT_TONES: Record<SectionTone, string> = {
  empty: "bg-slate-400",
  unverified: "bg-amber-400",
  complete: "bg-emerald-600",
};
const COLUMN_WIDTHS = { studyId: "12%", patient: "17%", date: "11%", images: "7%", progress: "24%", status: "17%", actions: "12%" };

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
  const careTeam = [
    { label: copy.physicianPrefix, name: patient.physician.trim() },
    { label: copy.nursePrefix, name: patient.nurse.trim() },
  ].filter(({ name }) => name);
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
        {showCareTeam && careTeam.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-700">
            {careTeam.map(({ label, name }) => <span key={label}>{label} <strong>{name}</strong></span>)}
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

function SubmissionCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td role="cell" className="block min-w-0 [overflow-wrap:anywhere] lg:table-cell lg:px-3 lg:py-3">
      <span aria-hidden="true" className="mb-0.5 block text-sm font-medium text-slate-600 lg:hidden">{label}</span>
      {children}
    </td>
  );
}

/** One compact row per case; administrative facts only when expanded. */
export function SubmissionRow({
  item,
  copy,
  isVi,
  crf = null,
  expanded,
  redcapExported,
  onToggle,
  onOpenRegistry,
  onOpenDocument,
  onRetried,
}: {
  item: ApiSubmissionItem;
  copy: UploadPageCopy["doctor"];
  isVi: boolean;
  crf?: CrfCaseState | null;
  expanded: boolean;
  redcapExported: boolean;
  onToggle: () => void;
  onOpenRegistry: (intakeId: string) => void;
  onOpenDocument: (patient: SleCrfPatientRecord, fileId: string) => void;
  onRetried: () => void;
}) {
  const dc = TRANSLATIONS[isVi ? "vi" : "en"].doctor;
  const dashboard = dc.dashboard;
  const { columns } = dashboard;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const p = item.record;
  const pipelineStatus = item.pipelineStatus ?? "none";
  const intakeId = pipelineStatus === "completed" ? item.pipelineIntakeId : null;
  const loadedCrf = crf && "view" in crf ? crf : null;
  const progress = loadedCrf ? reviewProgress(loadedCrf.view) : null;
  const webApproved = getSubmissionStatus(p) === "approved";
  const failed = pipelineStatus === "failed" ? classifyPipelineError(item.pipelineError) : null;
  const unread = !item.firstOpenedAt && !webApproved;
  const patient = dashboardPatient(p.patientName, loadedCrf?.view ?? null, isVi);
  const reviewer = loadedCrf ? dashboardReviewer(loadedCrf.view.review) : null;
  const stage = failed ? "failed" : submissionStage({
    pipelineStatus,
    webApproved,
    reviewStarted: !!loadedCrf?.view.review,
    redcapExported,
  });
  const readyForSignOff = stage === "reviewing" && progress?.pending === 0;
  const imageCount = p.uploadedFiles?.filter((f) => f.isImage).length ?? 0;
  const eular = calculateEularAcrSummary(p.eularAcrCriteria, p.anaEntryCriterionMet);
  const sledai = calculateSledai2kSummary(p.sledai2kCriteria);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(false);
    try {
      const response = await fetch(`/api/submissions/${item.dbSubmissionId}/retry`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok) onRetried();
      else setRetryError(true);
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <tr
        role="row"
        className={`grid cursor-pointer grid-cols-1 gap-x-4 gap-y-3 border-t border-slate-200 bg-white px-4 py-3 align-top text-sm text-slate-900 hover:bg-slate-50 sm:grid-cols-2 lg:table-row ${unread ? "font-bold" : "font-normal"}`}
        onClick={onToggle}
      >
        <SubmissionCell label={columns.studyId}>{p.studyId}</SubmissionCell>
        <SubmissionCell label={columns.patient}>
          {patient.name || <>
            {patient.demographics && <span className="block">{patient.demographics}</span>}
            <span className="text-xs font-normal text-slate-600">{dashboard.noName}</span>
          </>}
        </SubmissionCell>
        <SubmissionCell label={columns.date}>{p.submittedAt || "—"}</SubmissionCell>
        <SubmissionCell label={columns.images}>{dc.imagesCount(imageCount)}</SubmissionCell>
        <SubmissionCell label={columns.progress}>
          {loadedCrf && progress ? <>
            <div className="flex flex-wrap items-center gap-0.5">
              {sectionProgress(loadedCrf.view).map(({ group, approved, total, tone }) => {
                const label = dashboard.sectionProgress(dashboard.sections[group], approved, total);
                const params = new URLSearchParams({ case: loadedCrf.caseId, intake: loadedCrf.intakeId, section: group });
                return (
                  <Link
                    key={group}
                    href={`/registry?${params}`}
                    prefetch={false}
                    aria-label={label}
                    title={label}
                    onClick={(event) => event.stopPropagation()}
                    className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-teal-700"
                  >
                    <span aria-hidden="true" className={`size-3.5 rounded-full ${DOT_TONES[tone]}`} />
                  </Link>
                );
              })}
            </div>
            <p>{dashboard.remaining(progress.pending)}</p>
            {reviewer && <p className="mt-1 text-sm text-slate-700">{dashboard.reviewer(reviewer.name, reviewer.dateTime)}</p>}
          </> : !intakeId ? "—" : crf ? dc.progressUnavailable : dc.progressLoading}
        </SubmissionCell>
        <SubmissionCell label={columns.status}>
          <span className={`inline-block rounded-md px-2 py-0.5 ${STAGE_TONES[stage]}`}>
            {readyForSignOff ? dashboard.readyForSignOff : stageLabel(stage, progress?.percent ?? 0, isVi)}
          </span>
          {failed && (
            <div className="mt-1 text-rose-950">
              <p>{dashboard.errors[failed.kind]}</p>
              {failed.kind === "unknown" && item.pipelineError && (
                <details onClick={(event) => event.stopPropagation()} className="mt-1">
                  <summary className="cursor-pointer underline">{dashboard.errorDetails}</summary>
                  <p className="mt-1 font-normal">{item.pipelineError}</p>
                </details>
              )}
            </div>
          )}
        </SubmissionCell>
        <SubmissionCell label={columns.actions}>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={!intakeId}
              title={intakeId ? undefined : dashboard.reviewUnavailable}
              onClick={(event) => {
                event.stopPropagation();
                if (intakeId) onOpenRegistry(intakeId);
              }}
              className="min-h-8 cursor-pointer rounded-lg bg-teal-700 px-2 py-1 text-sm text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              {dc.reviewBtn}
            </button>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? dc.collapseBtn : dc.detailsBtn}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            >
              <svg
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {failed?.retryable && (
              <button
                type="button"
                disabled={retrying}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleRetry();
                }}
                className="min-h-8 cursor-pointer rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-900 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
              >
                {retrying ? dashboard.retrying : dashboard.retry}
              </button>
            )}
          </div>
          {retryError && <p role="alert" className="mt-1 text-sm text-rose-900">{dashboard.retryFailed}</p>}
        </SubmissionCell>
      </tr>

      {expanded && (
        <tr role="row" className="block border-t border-slate-200 bg-slate-50/40 lg:table-row">
          <td role="cell" colSpan={7} className="@container block min-w-0 lg:table-cell">
            {pipelineStatus === "privacy_review" && (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
                {isVi ? "Cần duyệt vùng che trước khi gửi." : "Review the redactions before sending."}
              </p>
            )}
            {intakeId && <CrfAdminFacts state={crf} isVi={isVi} />}
            <DocumentsAndTreatmentsGrid
              patient={p}
              copy={copy}
              onOpenDocument={onOpenDocument}
              showCareTeam={!intakeId}
              className="px-4 py-3"
            />
            {webApproved && !intakeId && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2 text-xs">
                <span className="font-mono font-bold uppercase tracking-wide text-slate-600">
                  {copy.scorePreviewHeading}:
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-800">
                  EULAR/ACR 2019: <strong>{eular.totalScore} pts</strong>
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-800">
                  SLEDAI-2K: <strong>{sledai.totalScore} pts</strong>
                </span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function SubmissionTable({
  items, crfCases, copy, isVi, expandedId, exportedIds, onToggle, onOpenRegistry, onOpenDocument, onRetried,
}: {
  items: readonly ApiSubmissionItem[];
  crfCases: Record<string, CrfCaseState>;
  copy: UploadPageCopy["doctor"];
  isVi: boolean;
  expandedId: string | null;
  exportedIds: ReadonlySet<string>;
  onToggle: (item: ApiSubmissionItem) => void;
  onOpenRegistry: (intakeId: string) => void;
  onOpenDocument: (item: ApiSubmissionItem, patient: SleCrfPatientRecord, fileId: string) => void;
  onRetried: () => void;
}) {
  const dashboard = TRANSLATIONS[isVi ? "vi" : "en"].doctor.dashboard;
  const groups = groupDashboardRows(items.map((item) => {
    const crf = item.pipelineStatus === "completed" && item.pipelineIntakeId ? crfCases[item.pipelineIntakeId] : null;
    const view = crf && "view" in crf ? crf.view : null;
    return {
      item,
      crf,
      failed: item.pipelineStatus === "failed",
      approved: getSubmissionStatus(item.record) === "approved",
      opened: !!item.firstOpenedAt,
      reviewPending: view?.review ? reviewProgress(view).pending : undefined,
    };
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
        {(Object.keys(DOT_TONES) as SectionTone[]).map((tone) => (
          <li key={tone} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-3.5 rounded-full ${DOT_TONES[tone]}`} />
            {dashboard.legend[tone]}
          </li>
        ))}
      </ul>
      <table role="table" className="block w-full table-fixed border-collapse lg:table">
        <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group">
          <tr role="row" className="text-left text-sm text-slate-800">
            {(Object.keys(COLUMN_WIDTHS) as (keyof typeof COLUMN_WIDTHS)[]).map((column) => (
              <th key={column} role="columnheader" scope="col" style={{ width: COLUMN_WIDTHS[column] }} className="px-3 py-3">
                {dashboard.columns[column]}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(({ group, rows }) => (
          <tbody key={group} role="rowgroup" className="block lg:table-row-group">
            <tr role="row" className="block border-t border-slate-200 bg-slate-100 lg:table-row">
              <th role="rowheader" scope="rowgroup" colSpan={7} className="block px-4 py-2 text-left text-sm font-bold text-slate-900 lg:table-cell">
                {dashboard.groups[group]} <span className="ml-1 rounded-full bg-white px-2 py-0.5 tabular-nums">{rows.length}</span>
              </th>
            </tr>
            {rows.map(({ item, crf }) => (
              <SubmissionRow
                key={item.dbSubmissionId}
                item={item}
                crf={crf}
                copy={copy}
                isVi={isVi}
                expanded={expandedId === item.dbSubmissionId}
                redcapExported={exportedIds.has(item.dbSubmissionId)}
                onToggle={() => onToggle(item)}
                onOpenRegistry={onOpenRegistry}
                onOpenDocument={(patient, fileId) => onOpenDocument(item, patient, fileId)}
                onRetried={onRetried}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function DoctorSubmissionsView({
  headerAction,
  uploadPanel,
}: {
  headerAction?: ReactNode;
  uploadPanel?: ReactNode;
} = {}) {
  const router = useRouter();
  const { language, mergeCrfPatientsFromApi } = useLupiva();
  const isVi = language === "vi";
  const copy = getUploadPageCopy(language).doctor;
  const dc = TRANSLATIONS[language].doctor;

  const [filters, setFilters] = useState<SubmissionQueryFilters>(
    DEFAULT_DOCTOR_SUBMISSION_FILTERS
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const silentReloadRef = useRef(false);
  const [viewerTarget, setViewerTarget] = useState<{
    patient: SleCrfPatientRecord;
    fileId: string;
  } | null>(null);
  const [showRedcap, setShowRedcap] = useState(false);
  const [exportedIds, setExportedIds] = useState<Set<string>>(new Set());
  const [moreFilters, setMoreFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // The new-submission notice links here with ?status=new.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("status");
    if (wanted && ["new", "pending_doctor_review", "approved", "all"].includes(wanted)) {
      setFilters((prev) => ({ ...prev, page: 1, status: wanted as SubmissionQueryFilters["status"] }));
    }
  }, []);

  /** First open by any doctor moves a submission out of "Hồ sơ mới". */
  const markOpened = (submissionId: string) => {
    void fetch(`/api/submissions/${encodeURIComponent(submissionId)}/opened`, {
      method: "POST",
      credentials: "same-origin",
    })
      .then((response) => response.json())
      .then((result: { changed?: boolean }) => {
        if (result.changed) {
          silentReloadRef.current = true;
          setReloadTick((n) => n + 1);
        }
      })
      .catch(() => undefined);
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
  const advancedFilterCount =
    (filters.datePreset !== "all" || filters.fromDate || filters.toDate ? 1 : 0) +
    (filters.clinicalRisk !== "all" ? 1 : 0) +
    (filters.gender !== "all" ? 1 : 0) +
    (filters.sort !== "newest" ? 1 : 0);

  const handleResetFilters = () => {
    setFilters(DEFAULT_DOCTOR_SUBMISSION_FILTERS);
    setSearchInput("");
    setDebouncedSearch("");
  };

  const setStatusFilter = (status: SubmissionQueryFilters["status"]) => {
    setShowRedcap(false);
    setFilters((prev) => ({ ...prev, page: 1, status }));
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

  const items = apiState.data?.items ?? [];
  const crfCases = useCrfCases(items.flatMap((item) =>
    item.pipelineStatus === "completed" && item.pipelineIntakeId ? [item.pipelineIntakeId] : [],
  ));

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
  const counterValue = (key: StatusCounter) =>
    key === "new" ? stats.new : key === "pending_doctor_review" ? stats.pending : stats.approved;
  const counterLabel = (key: StatusCounter) =>
    key === "new" ? dc.counterNew : key === "pending_doctor_review" ? dc.counterPending : dc.counterApproved;
  const pagination: PaginationMeta = apiState.data?.pagination ?? {
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };
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
        {/* Header, clickable counters & compact filter toolbar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">
                  {copy.heading}
                </h1>
                {headerAction}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/crf-form"
                id="doctor-dashboard-crf"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
              >
                {dc.crfFormBtn} <span aria-hidden="true">→</span>
              </Link>
              <button
                type="button"
                id="doctor-dashboard-redcap"
                aria-pressed={showRedcap}
                aria-controls="doctor-redcap-panel"
                onClick={() => {
                  setShowRedcap((open) => !open);
                  if (!showRedcap) setFilters((prev) => ({ ...prev, page: 1, status: "approved" }));
                }}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-900 transition hover:bg-indigo-100 ${
                  showRedcap ? "ring-2 ring-indigo-600" : ""
                }`}
              >
                {dc.redcapBtn} <span aria-hidden="true">⇩</span>
              </button>
            </div>
          </div>

          <nav
            aria-label={isVi ? "Bộ đếm hồ sơ" : "Dossier counters"}
            className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {STATUS_COUNTERS.map((key) => {
              const tone =
                key === "new"
                  ? "border-sky-300 bg-sky-50 text-sky-950"
                  : key === "pending_doctor_review"
                    ? "border-amber-200 bg-amber-50/70 text-amber-950"
                    : "border-teal-200 bg-teal-50/70 text-teal-950";
              const isActive = filters.status === key;
              return (
                <button
                  key={key}
                  type="button"
                  id={`doctor-dashboard-${key}`}
                  aria-pressed={isActive}
                  onClick={() => setStatusFilter(isActive ? "all" : key)}
                  className={`cursor-pointer rounded-xl border px-4 py-3 text-left transition hover:shadow-sm ${tone} ${
                    isActive ? "ring-2 ring-teal-600" : ""
                  }`}
                >
                  <span className="block text-xs font-semibold">{counterLabel(key)}</span>
                  <span className="mt-1 block font-mono text-3xl font-bold">{counterValue(key)}</span>
                </button>
              );
            })}
          </nav>

          {showRedcap && (
            <RedcapExportPanel
              items={items}
              isVi={isVi}
              onExported={(id) => setExportedIds((previous) => new Set(previous).add(id))}
            />
          )}

          {/* Default filters: search + three status buttons; the rest under "Lọc thêm" */}
          <search className="mt-5 border-t border-slate-200 pt-4">
            <form
              aria-labelledby="doctor-filter-heading"
              onSubmit={(e) => e.preventDefault()}
              className="space-y-3"
            >
              <h2 id="doctor-filter-heading" className="sr-only">
                {copy.filterHeading}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="doctor-submissions-search"
                  name="q"
                  type="search"
                  aria-label={copy.searchLabel}
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
                  className="min-h-9 min-w-0 basis-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-teal-700 sm:min-w-56 sm:flex-1"
                />
                {STATUS_COUNTERS.map((key) => {
                  const isActive = filters.status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      id={`doctor-filter-status-${key}`}
                      aria-pressed={isActive}
                      onClick={() => setStatusFilter(isActive ? "all" : key)}
                      className={`min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "bg-teal-700 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
                      }`}
                    >
                      {counterLabel(key)} ({counterValue(key)})
                    </button>
                  );
                })}
                <button
                  type="button"
                  id="doctor-filter-more"
                  aria-expanded={moreFilters}
                  onClick={() => setMoreFilters((open) => !open)}
                  className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    moreFilters || advancedFilterCount > 0
                      ? "border-teal-700 bg-teal-50 text-teal-900"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {moreFilters ? dc.hideFilters : dc.moreFilters}
                  {advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
                </button>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    id="doctor-filter-reset"
                    onClick={handleResetFilters}
                    className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                  >
                    {copy.resetFilters} ({copy.activeFiltersBadge(activeFilterCount)})
                  </button>
                )}
              </div>

              {moreFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-6">
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

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="doctor-filter-sort"
                      className="text-[11px] font-semibold text-slate-700"
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
                      className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700"
                    >
                      {SUBMISSION_SORT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {copy.sortOptions[opt]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </form>
          </search>

          {/* Results Summary & Inline Pagination */}
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
                    className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
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
                        className={`min-h-9 min-w-9 cursor-pointer rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
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
                    className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {copy.nextPage} →
                  </button>
                </nav>
              </div>
            )}
          </div>
        </section>

        {uploadPanel}

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
              className="min-h-9 cursor-pointer rounded-lg border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              {copy.retryBtn}
            </button>
          </div>
        )}

        <div
          id="doctor-dossiers-container"
          aria-busy={apiState.loading}
          className={`space-y-2 transition-opacity ${apiState.loading && items.length > 0 ? "opacity-70" : "opacity-100"}`}
        >
          {apiState.loading && items.length === 0 ? (
            <>
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                {copy.emptyTitle}
              </p>
              <p className="mt-1 text-xs text-slate-600">{copy.emptyHint}</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 min-h-9 cursor-pointer rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  {copy.resetFilters}
                </button>
              )}
            </div>
          ) : (
            <SubmissionTable
              items={items}
              crfCases={crfCases}
              copy={copy}
              isVi={isVi}
              expandedId={expandedId}
              exportedIds={exportedIds}
              onToggle={(item) => {
                setExpandedId((current) => current === item.dbSubmissionId ? null : item.dbSubmissionId);
              }}
              onOpenRegistry={openRegistry}
              onOpenDocument={(item, patient, fileId) => {
                if (!item.firstOpenedAt) markOpened(item.dbSubmissionId);
                setViewerTarget({ patient, fileId });
              }}
              onRetried={() => setReloadTick((n) => n + 1)}
            />
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
