"use client";

import React, { useEffect, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import {
  SleCrfPatientRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";
import { getUploadPageCopy } from "@/data/uploadTranslations";
import {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  type SubmissionReviewFilter,
} from "@/lib/submissionFilters";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { TruncatedFilename } from "./TruncatedFilename";

interface ApiSubmissionItem {
  record: SleCrfPatientRecord;
  dbSubmissionId: string;
  submittedAtIso: string;
}

interface ApiSubmissionsResponse {
  items: ApiSubmissionItem[];
  stats: {
    total: number;
    pending: number;
    approved: number;
  };
  pagination: PaginationMeta;
}

export function DoctorSubmissionsView({
  fixedStatus,
}: {
  fixedStatus?: SubmissionReviewFilter;
}) {
  const { language, mergeCrfPatientsFromApi, openDoctorPatientCrf } =
    useLupiva();
  const isVi = language === "vi";
  const copy = getUploadPageCopy(language).doctor;

  const statusFilter: SubmissionReviewFilter = fixedStatus ?? "all";
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [viewerTarget, setViewerTarget] = useState<{
    patient: SleCrfPatientRecord;
    fileId: string;
  } | null>(null);

  const [apiState, setApiState] = useState<{
    loading: boolean;
    error: string | null;
    data: ApiSubmissionsResponse | null;
  }>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const utcOffsetMinutes = -new Date().getTimezoneOffset();
    const params = new URLSearchParams({
      status: statusFilter,
      q: debouncedSearch,
      page: String(page),
      pageSize: String(DEFAULT_PAGE_SIZE),
      sort: "newest",
      utcOffsetMinutes: String(utcOffsetMinutes),
    });

    async function loadSubmissions() {
      setApiState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`/api/submissions?${params.toString()}`, {
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
    statusFilter,
    debouncedSearch,
    page,
    reloadTick,
    copy.errorTitle,
    mergeCrfPatientsFromApi,
  ]);

  const items = apiState.data?.items ?? [];
  const pagination: PaginationMeta = apiState.data?.pagination ?? {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };

  const heading =
    statusFilter === "pending_doctor_review"
      ? isVi
        ? "Hồ sơ chưa duyệt"
        : "Pending Review"
      : statusFilter === "approved"
      ? isVi
        ? "Hồ sơ đã phê duyệt"
        : "Approved Dossiers"
      : copy.heading;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 py-6 focus:outline-none"
    >
      <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
        {/* Minimal Header + Single Search Box */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {heading}{" "}
              <span className="font-mono text-sm font-semibold text-slate-500">
                ({pagination.totalItems})
              </span>
            </h1>
          </div>

          <div className="w-full sm:w-72">
            <label htmlFor="doctor-submissions-search" className="sr-only">
              {copy.searchLabel}
            </label>
            <input
              id="doctor-submissions-search"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={
                isVi
                  ? "Tìm theo tên, Study ID hoặc tên tệp..."
                  : "Search name, Study ID, or filename..."
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700"
            />
          </div>
        </section>

        {apiState.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs text-rose-950"
          >
            <span>{apiState.error}</span>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer"
            >
              {copy.retryBtn}
            </button>
          </div>
        )}

        {/* Simple Dossier List */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          {apiState.loading && items.length === 0 ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="h-14 animate-pulse rounded-lg bg-slate-100"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              {statusFilter === "pending_doctor_review"
                ? isVi
                  ? "Không có hồ sơ nào đang chờ duyệt."
                  : "No pending dossiers."
                : statusFilter === "approved"
                ? isVi
                  ? "Chưa có hồ sơ nào được phê duyệt."
                  : "No approved dossiers."
                : copy.emptyTitle}
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {items.map((item) => {
                const p = item.record;
                const approved = getSubmissionStatus(p) === "approved";
                const eular = calculateEularAcrSummary(
                  p.eularAcrCriteria,
                  p.anaEntryCriterionMet
                );
                const sledai = calculateSledai2kSummary(p.sledai2kCriteria);

                return (
                  <li
                    key={item.dbSubmissionId}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                          {p.studyId}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {p.patientName}
                        </span>
                        {p.submittedAt && (
                          <span className="font-mono text-[11px] tabular-nums text-slate-500">
                            {p.submittedAt}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.uploadedFiles && p.uploadedFiles.length > 0 ? (
                          p.uploadedFiles.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() =>
                                setViewerTarget({ patient: p, fileId: f.id })
                              }
                              className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:border-teal-600 hover:text-teal-900 cursor-pointer"
                            >
                              <TruncatedFilename name={f.name} />
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">
                            {copy.noAttachedDocs}
                          </span>
                        )}

                        {approved && (
                          <span className="ml-1 font-mono text-[11px] font-semibold text-teal-900">
                            EULAR: {eular.totalScore} • SLEDAI: {sledai.totalScore}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDoctorPatientCrf(p.id)}
                      className="shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 cursor-pointer"
                    >
                      {approved
                        ? isVi
                          ? "Xem CRF"
                          : "View CRF"
                        : isVi
                        ? "Duyệt CRF"
                        : "Review CRF"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs">
              <span className="text-slate-600">
                {copy.pageOfTotal(pagination.page, pagination.totalPages)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage || apiState.loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-45 cursor-pointer"
                >
                  ← {copy.prevPage}
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNextPage || apiState.loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-45 cursor-pointer"
                >
                  {copy.nextPage} →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

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
