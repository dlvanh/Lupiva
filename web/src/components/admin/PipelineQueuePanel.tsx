"use client";

import React, { useState } from "react";
import type { PipelineStatus } from "@/db/schema";
import type {
  AdminPipelineActionInput,
  AdminPipelineJobDTO,
  AdminPipelineQueueResult,
} from "@/lib/adminService";
import { formatAdminBytes, type AdminCopy } from "./adminTranslations";

const PIPELINE_TONES: Record<PipelineStatus, string> = {
  none: "bg-slate-100 text-slate-700",
  privacy_check: "bg-sky-100 text-sky-900",
  privacy_review: "bg-amber-100 text-amber-900",
  processing: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-100 text-emerald-900",
  failed: "bg-rose-100 text-rose-900",
};

export function PipelineQueuePanel({
  data,
  copy,
  loading,
  busyId,
  syncing,
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onPageChange,
  onSyncQueue,
  onJobAction,
}: {
  data: AdminPipelineQueueResult | null;
  copy: AdminCopy;
  loading: boolean;
  busyId: string | null;
  syncing: boolean;
  searchQuery: string;
  statusFilter: "all" | PipelineStatus;
  onSearchChange: (q: string) => void;
  onStatusFilterChange: (status: "all" | PipelineStatus) => void;
  onPageChange: (page: number) => void;
  onSyncQueue: () => Promise<void>;
  onJobAction: (
    submissionId: string,
    action: AdminPipelineActionInput
  ) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingFailId, setMarkingFailId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");

  return (
    <section
      id="admin-panel-pipeline"
      aria-labelledby="admin-pipeline-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="admin-pipeline-heading"
            className="text-lg font-bold text-slate-900"
          >
            {copy.pipeline.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{copy.pipeline.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                data.backendOnline
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  data.backendOnline ? "bg-emerald-600" : "bg-slate-400"
                }`}
              />
              {data.backendOnline
                ? copy.pipeline.backendOnline
                : copy.pipeline.backendOffline}
            </span>
          )}
          <button
            type="button"
            id="admin-btn-sync-pipeline"
            disabled={syncing}
            onClick={() => void onSyncQueue()}
            className="min-h-9 cursor-pointer rounded-lg border border-teal-700 bg-teal-50 px-3.5 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 disabled:opacity-60"
          >
            {copy.pipeline.syncBtn}
          </button>
        </div>
      </div>

      {/* Summary pills */}
      {data && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
            {copy.pipeline.totalJobs}:{" "}
            <strong className="tabular-nums">{data.summary.total}</strong>
          </span>
          <span className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 font-medium text-indigo-900">
            {copy.pipeline.activeJobs}:{" "}
            <strong className="tabular-nums">{data.summary.active}</strong>
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 font-medium text-amber-900">
            {copy.pipeline.pendingJobs}:{" "}
            <strong className="tabular-nums">{data.summary.pending}</strong>
          </span>
          <span className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 font-medium text-emerald-900">
            {copy.pipeline.completedJobs}:{" "}
            <strong className="tabular-nums">{data.summary.completed}</strong>
          </span>
          <span className="rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1 font-medium text-rose-900">
            {copy.pipeline.failedJobs}:{" "}
            <strong className="tabular-nums">{data.summary.failed}</strong>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          id="admin-pipeline-search"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={copy.pipeline.searchPlaceholder}
          aria-label={copy.pipeline.searchPlaceholder}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
        />
        <select
          id="admin-pipeline-status-filter"
          aria-label={copy.pipeline.thPipelineStatus}
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as "all" | PipelineStatus)
          }
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
        >
          <option value="all">{copy.pipeline.statusAll}</option>
          {(
            [
              "failed",
              "processing",
              "privacy_check",
              "privacy_review",
              "none",
              "completed",
            ] as const
          ).map((s) => (
            <option key={s} value={s}>
              {copy.pipelineStatuses[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Queue Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.pipeline.thStudy}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.pipeline.thPipelineStatus}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.pipeline.thDocuments}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.pipeline.thUpdated}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.pipeline.thControls}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  ...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  {copy.pipeline.empty}
                </td>
              </tr>
            ) : (
              data.items.map((job: AdminPipelineJobDTO) => {
                const isExpanded = expandedId === job.submissionId;
                const isBusy = busyId === job.submissionId;
                const canRetry =
                  job.pipelineStatus === "failed" && job.localStoredImageCount > 0;
                const canReset =
                  job.pipelineStatus === "failed" ||
                  job.pipelineStatus === "privacy_review";
                const canMarkFailed =
                  job.pipelineStatus !== "completed" &&
                  job.pipelineStatus !== "failed";

                return (
                  <React.Fragment key={job.submissionId}>
                    <tr className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 align-top">
                        <div className="tabular-nums font-semibold text-slate-900">
                          {job.studyId}
                        </div>
                        <div className="mt-0.5 tabular-nums text-[10px] text-slate-500">
                          {job.submissionId}
                        </div>
                        {job.pipelineIntakeId && (
                          <div className="mt-0.5 tabular-nums text-[10px] text-indigo-700">
                            intake: {job.pipelineIntakeId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            PIPELINE_TONES[job.pipelineStatus]
                          }`}
                        >
                          {copy.pipelineStatuses[job.pipelineStatus]}
                        </span>
                        {job.pipelineError && (
                          <p className="mt-1 max-w-xs truncate text-[11px] text-rose-700">
                            {job.pipelineError}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="tabular-nums font-semibold text-slate-800">
                          {job.documents.length}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {copy.pipeline.localImagesLabel(job.localStoredImageCount)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top tabular-nums text-[11px] text-slate-600">
                        {new Date(job.lastUpdatedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : job.submissionId)
                            }
                            className="min-h-7 cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            {isExpanded
                              ? copy.pipeline.hideDetails
                              : copy.pipeline.inspect}
                          </button>
                          {canRetry && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void onJobAction(job.submissionId, {
                                  action: "retry",
                                })
                              }
                              className="min-h-7 cursor-pointer rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                            >
                              {copy.pipeline.retry}
                            </button>
                          )}
                          {canReset && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void onJobAction(job.submissionId, {
                                  action: "reset_pending",
                                })
                              }
                              className="min-h-7 cursor-pointer rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {copy.pipeline.resetPending}
                            </button>
                          )}
                          {canMarkFailed && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setMarkingFailId(job.submissionId);
                                setFailReason("");
                              }}
                              className="min-h-7 cursor-pointer rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {copy.pipeline.markFailed}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {markingFailId === job.submissionId && (
                      <tr className="bg-rose-50/40">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={failReason}
                              onChange={(e) => setFailReason(e.target.value)}
                              placeholder={copy.pipeline.reasonPrompt}
                              aria-label={copy.pipeline.reasonPrompt}
                              className="min-w-[240px] flex-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-slate-900"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                await onJobAction(job.submissionId, {
                                  action: "mark_failed",
                                  reason: failReason.trim() || undefined,
                                });
                                setMarkingFailId(null);
                              }}
                              className="cursor-pointer rounded-md bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800"
                            >
                              {copy.pipeline.confirmMarkFailed}
                            </button>
                            <button
                              type="button"
                              onClick={() => setMarkingFailId(null)}
                              className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                            >
                              {copy.pipeline.cancel}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-1.5 text-xs">
                              <p>
                                <span className="font-semibold text-slate-700">
                                  {copy.pipeline.intakeIdLabel}:
                                </span>{" "}
                                <span className="tabular-nums text-slate-900">
                                  {job.pipelineIntakeId ?? "—"}
                                </span>
                              </p>
                              <p>
                                <span className="font-semibold text-slate-700">
                                  {copy.pipeline.backendStatusLabel}:
                                </span>{" "}
                                <span className="tabular-nums text-slate-900">
                                  {job.backendJobStatus ?? "—"}
                                </span>
                              </p>
                              <p>
                                <span className="font-semibold text-slate-700">
                                  {copy.pipeline.errorLabel}:
                                </span>{" "}
                                <span
                                  className={
                                    job.pipelineError
                                      ? "tabular-nums text-rose-800"
                                      : "text-slate-500"
                                  }
                                >
                                  {job.pipelineError ?? copy.pipeline.noError}
                                </span>
                              </p>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-slate-700">
                                {copy.pipeline.docsHeading}
                              </h4>
                              <ul className="mt-1.5 space-y-1">
                                {job.documents.map((doc) => (
                                  <li
                                    key={doc.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 tabular-nums text-[11px]"
                                  >
                                    <span className="truncate font-medium text-slate-800">
                                      {doc.fileName}
                                    </span>
                                    <span className="text-slate-500">
                                      {doc.storageProvider} · {doc.ocrJobStatus} ·{" "}
                                      {formatAdminBytes(doc.sizeBytes)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <span>
            {copy.pagination.pageOf(
              data.pagination.page,
              data.pagination.totalPages,
              data.pagination.totalItems
            )}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!data.pagination.hasPreviousPage}
              onClick={() => onPageChange(data.pagination.page - 1)}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.pagination.prev}
            </button>
            <button
              type="button"
              disabled={!data.pagination.hasNextPage}
              onClick={() => onPageChange(data.pagination.page + 1)}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.pagination.next}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
