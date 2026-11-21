"use client";

import React from "react";
import type { PipelineStatus } from "@/db/schema";
import type { AdminTelemetryDTO } from "@/lib/adminService";
import {
  formatAdminBytes,
  formatAdminDuration,
  type AdminCopy,
} from "./adminTranslations";

const PIPELINE_ORDER: PipelineStatus[] = [
  "none",
  "privacy_check",
  "privacy_review",
  "processing",
  "completed",
  "failed",
];

const PIPELINE_BAR_TONES: Record<PipelineStatus, string> = {
  none: "bg-slate-400",
  privacy_check: "bg-sky-500",
  privacy_review: "bg-amber-500",
  processing: "bg-indigo-600",
  completed: "bg-teal-600",
  failed: "bg-rose-600",
};

export function TelemetryPanel({
  telemetry,
  copy,
  loading,
}: {
  telemetry: AdminTelemetryDTO | null;
  copy: AdminCopy;
  loading: boolean;
}) {
  if (loading && !telemetry) {
    return (
      <section
        id="admin-panel-telemetry"
        aria-busy="true"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs"
      >
        <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  if (!telemetry) return null;

  const { services, securityPosture, metrics, runtime } = telemetry;
  const totalPipeline = Math.max(
    1,
    Object.values(metrics.pipelineBreakdown).reduce((sum, n) => sum + n, 0)
  );

  return (
    <section
      id="admin-panel-telemetry"
      aria-labelledby="admin-telemetry-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="admin-telemetry-heading"
            className="text-lg font-bold text-slate-900"
          >
            {copy.telemetry.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{copy.telemetry.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            telemetry.overallStatus === "healthy"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-amber-50 text-amber-900 border border-amber-200"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              telemetry.overallStatus === "healthy" ? "bg-emerald-600" : "bg-amber-500"
            }`}
          />
          {telemetry.overallStatus === "healthy"
            ? copy.kpis.healthy
            : copy.kpis.degraded}
        </span>
      </div>

      {/* Service Health Cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {copy.telemetry.dbService}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                services.database.status === "connected"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {services.database.status === "connected"
                ? copy.telemetry.connected
                : copy.telemetry.unavailable}
            </span>
          </div>
          <p className="mt-2 tabular-nums text-xl font-bold text-slate-900">
            {services.database.latencyMs} ms
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{copy.telemetry.latency}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {copy.telemetry.pipelineService}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                services.pipelineBackend.status === "online"
                  ? "bg-emerald-100 text-emerald-800"
                  : services.pipelineBackend.status === "degraded"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-200 text-slate-700"
              }`}
            >
              {services.pipelineBackend.status === "online"
                ? copy.telemetry.online
                : services.pipelineBackend.status === "degraded"
                  ? copy.telemetry.degraded
                  : copy.telemetry.offline}
            </span>
          </div>
          <p className="mt-2 tabular-nums text-xl font-bold text-slate-900">
            {services.pipelineBackend.latencyMs !== null
              ? `${services.pipelineBackend.latencyMs} ms`
              : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {copy.telemetry.casesIndexed}:{" "}
            <span className="tabular-nums font-semibold text-slate-700">
              {services.pipelineBackend.caseCount ?? "—"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {copy.telemetry.vaultService}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                services.encryptionVault.configured
                  ? "bg-teal-100 text-teal-900"
                  : "bg-rose-100 text-rose-900"
              }`}
            >
              {services.encryptionVault.configured
                ? copy.telemetry.configured
                : copy.telemetry.incomplete}
            </span>
          </div>
          <p className="mt-2 tabular-nums text-xl font-bold text-slate-900">
            AES-256-GCM
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {copy.telemetry.pipelineEngine}:{" "}
            <span className="tabular-nums font-semibold text-slate-700">
              {securityPosture.pipelineEngine}
            </span>
          </p>
        </div>
      </div>

      {/* Clinical Metrics + Security Posture */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {copy.telemetry.clinicalMetrics}
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.patientProfiles}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {metrics.clinical.patientProfiles}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.submissionsTotal}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {metrics.clinical.submissionsTotal}
              </dd>
            </div>
            <div className="rounded-lg bg-teal-50/70 p-2.5">
              <dt className="text-teal-800">{copy.telemetry.approved}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-teal-900">
                {metrics.clinical.submissionsApproved}
              </dd>
            </div>
            <div className="rounded-lg bg-amber-50/70 p-2.5">
              <dt className="text-amber-900">{copy.telemetry.pendingReview}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-amber-950">
                {metrics.clinical.submissionsPendingReview}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.documentsTotal}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {metrics.documents.total}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.vaultSize}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {formatAdminBytes(metrics.documents.totalBytes)}
              </dd>
            </div>
          </dl>

          {/* Pipeline distribution */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-700">
              {copy.telemetry.pipelineBreakdown}
            </p>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {PIPELINE_ORDER.map((status) => {
                const count = metrics.pipelineBreakdown[status] ?? 0;
                if (count <= 0) return null;
                const widthPct = `${(count / totalPipeline) * 100}%`;
                return (
                  <div
                    key={status}
                    style={{ width: widthPct }}
                    className={PIPELINE_BAR_TONES[status]}
                    title={`${copy.pipelineStatuses[status]}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {PIPELINE_ORDER.map((status) => (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${PIPELINE_BAR_TONES[status]}`}
                  />
                  {copy.pipelineStatuses[status]}:{" "}
                  <strong className="tabular-nums">
                    {metrics.pipelineBreakdown[status] ?? 0}
                  </strong>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {copy.telemetry.securityPosture}
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.activeSessions}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {securityPosture.activeSessions}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.rateLimitLockouts}</dt>
              <dd
                className={`mt-0.5 tabular-nums text-base font-bold ${
                  securityPosture.activeRateLimitLockouts > 0
                    ? "text-rose-700"
                    : "text-slate-900"
                }`}
              >
                {securityPosture.activeRateLimitLockouts}
              </dd>
            </div>
            <div className="rounded-lg bg-rose-50/60 p-2.5">
              <dt className="text-rose-800">{copy.telemetry.alerts24h}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-rose-900">
                {securityPosture.securityAlerts24h}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">{copy.telemetry.failures24h}</dt>
              <dd className="mt-0.5 tabular-nums text-base font-bold text-slate-900">
                {securityPosture.loginFailures24h}
              </dd>
            </div>
          </dl>

          <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{copy.telemetry.inviteGate}</span>
              <span className="font-semibold text-slate-900">
                {securityPosture.specialistInviteConfigured
                  ? copy.telemetry.configured
                  : copy.telemetry.disabled}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{copy.telemetry.demoMode}</span>
              <span
                className={`font-semibold ${
                  securityPosture.demoModeEnabled ? "text-amber-800" : "text-teal-800"
                }`}
              >
                {securityPosture.demoModeEnabled
                  ? copy.telemetry.enabled
                  : copy.telemetry.disabled}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{copy.telemetry.cookieSecure}</span>
              <span className="tabular-nums text-slate-800">
                {securityPosture.cookieSecureMode}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{copy.telemetry.runtimeHeading}</span>
              <span className="tabular-nums text-slate-800">
                {runtime.nodeVersion} · {formatAdminDuration(runtime.uptimeSeconds)} ·{" "}
                {runtime.memoryMb.heapUsed}/{runtime.memoryMb.heapTotal} MB
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{copy.telemetry.auditTotal}</span>
              <span className="tabular-nums font-semibold text-slate-900">
                {metrics.auditLogsTotal}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
