"use client";

import React, { useState } from "react";
import { auditLogsToCsv } from "@/lib/adminCsv";
import type {
  AdminAuditLogDTO,
  AdminAuditResult,
} from "@/lib/adminService";
import type { AdminCopy } from "./adminTranslations";

export type AuditCategoryFilter =
  | "all"
  | "auth"
  | "submission"
  | "admin"
  | "security_alerts";

export type AuditActorRoleFilter =
  | "all"
  | "patient"
  | "specialist"
  | "admin"
  | "system";

export function AuditLogPanel({
  data,
  copy,
  loading,
  searchQuery,
  category,
  actorRole,
  dateFrom,
  dateTo,
  onSearchChange,
  onCategoryChange,
  onActorRoleChange,
  onDateFromChange,
  onDateToChange,
  onPageChange,
}: {
  data: AdminAuditResult | null;
  copy: AdminCopy;
  loading: boolean;
  searchQuery: string;
  category: AuditCategoryFilter;
  actorRole: AuditActorRoleFilter;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (q: string) => void;
  onCategoryChange: (c: AuditCategoryFilter) => void;
  onActorRoleChange: (r: AuditActorRoleFilter) => void;
  onDateFromChange: (d: string) => void;
  onDateToChange: (d: string) => void;
  onPageChange: (page: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleExportCsv = () => {
    if (!data || data.items.length === 0) return;
    const csv = auditLogsToCsv(data.items);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lupiva-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      id="admin-panel-audit"
      aria-labelledby="admin-audit-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="admin-audit-heading"
            className="text-lg font-bold text-slate-900"
          >
            {copy.audit.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{copy.audit.subtitle}</p>
        </div>

        <button
          type="button"
          id="admin-btn-export-audit-csv"
          disabled={!data || data.items.length === 0}
          onClick={handleExportCsv}
          className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.audit.exportCsv}
        </button>
      </div>

      {/* Summary pills */}
      {data && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
            {copy.audit.totalEvents}:{" "}
            <strong className="tabular-nums">{data.summary.total}</strong>
          </span>
          <span className="rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1 font-medium text-rose-900">
            {copy.audit.securityAlerts}:{" "}
            <strong className="tabular-nums">{data.summary.securityAlerts}</strong>
          </span>
          <span className="rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1 font-medium text-sky-900">
            {copy.audit.authEvents}:{" "}
            <strong className="tabular-nums">{data.summary.authEvents}</strong>
          </span>
          <span className="rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-1 font-medium text-teal-900">
            {copy.audit.submissionEvents}:{" "}
            <strong className="tabular-nums">{data.summary.submissionEvents}</strong>
          </span>
          <span className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 font-medium text-indigo-900">
            {copy.audit.adminEvents}:{" "}
            <strong className="tabular-nums">{data.summary.adminEvents}</strong>
          </span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          id="admin-audit-search"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={copy.audit.searchPlaceholder}
          aria-label={copy.audit.searchPlaceholder}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 sm:col-span-2"
        />
        <select
          id="admin-audit-category-filter"
          aria-label={copy.audit.categoryAll}
          value={category}
          onChange={(e) => onCategoryChange(e.target.value as AuditCategoryFilter)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
        >
          <option value="all">{copy.audit.categoryAll}</option>
          <option value="security_alerts">{copy.audit.categoryAlerts}</option>
          <option value="auth">{copy.audit.categoryAuth}</option>
          <option value="submission">{copy.audit.categorySubmission}</option>
          <option value="admin">{copy.audit.categoryAdmin}</option>
        </select>
        <select
          id="admin-audit-role-filter"
          aria-label={copy.audit.roleAll}
          value={actorRole}
          onChange={(e) =>
            onActorRoleChange(e.target.value as AuditActorRoleFilter)
          }
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
        >
          <option value="all">{copy.audit.roleAll}</option>
          <option value="admin">{copy.roles.admin}</option>
          <option value="specialist">{copy.roles.specialist}</option>
          <option value="patient">{copy.roles.patient}</option>
          <option value="system">{copy.audit.roleSystem}</option>
        </select>
        <div className="flex gap-1.5">
          <input
            id="admin-audit-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            aria-label={copy.audit.dateFrom}
            title={copy.audit.dateFrom}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
          <input
            id="admin-audit-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            aria-label={copy.audit.dateTo}
            title={copy.audit.dateTo}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thTime}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thAction}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thActor}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thTarget}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thIp}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.audit.thDetails}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  ...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  {copy.audit.empty}
                </td>
              </tr>
            ) : (
              data.items.map((log: AdminAuditLogDTO) => {
                const isExpanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={
                        log.isSecurityAlert
                          ? "bg-rose-50/30 hover:bg-rose-50/60"
                          : "hover:bg-slate-50/80"
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums text-[11px] text-slate-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 tabular-nums text-[11px] font-semibold text-slate-900">
                            {log.action}
                          </span>
                          {log.isSecurityAlert && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                              {copy.audit.alertBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-medium text-slate-900">
                          {log.actorName ?? copy.audit.roleSystem}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {log.actorRole ?? "system"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top tabular-nums text-[11px] text-slate-700">
                        <div>{log.targetType}</div>
                        {log.targetId && (
                          <div className="text-[10px] text-slate-500">
                            {log.targetId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top tabular-nums text-[11px] text-slate-700">
                        {log.ipAddress ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="min-h-7 cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {isExpanded ? copy.audit.hide : copy.audit.inspect}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="space-y-2 text-xs">
                            <p className="text-[11px] text-slate-600">
                              <strong className="text-slate-800">
                                {copy.audit.userAgentLabel}:
                              </strong>{" "}
                              <span className="tabular-nums">
                                {log.userAgent ?? "—"}
                              </span>
                            </p>
                            <div>
                              <p className="text-[11px] font-semibold text-slate-700">
                                {copy.audit.metadataLabel}
                              </p>
                              <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 tabular-nums text-[11px] text-slate-800">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
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
