"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import type { UserRole } from "@/data/mockData";
import type { PipelineStatus } from "@/db/schema";
import type {
  AdminAccountsResult,
  AdminAuditResult,
  AdminCreateAccountInput,
  AdminPipelineActionInput,
  AdminPipelineQueueResult,
  AdminTelemetryDTO,
  AdminUpdateAccountInput,
} from "@/lib/adminService";
import { AccountsPanel } from "./AccountsPanel";
import { getAdminCopy } from "./adminTranslations";
import {
  AuditLogPanel,
  type AuditActorRoleFilter,
  type AuditCategoryFilter,
} from "./AuditLogPanel";
import { PipelineQueuePanel } from "./PipelineQueuePanel";
import { TelemetryPanel } from "./TelemetryPanel";

export type AdminSectionTab = "all" | "telemetry" | "accounts" | "pipeline" | "audit";

export interface AdminInitialSnapshot {
  telemetry?: AdminTelemetryDTO | null;
  accounts?: AdminAccountsResult | null;
  pipeline?: AdminPipelineQueueResult | null;
  audit?: AdminAuditResult | null;
}

export function AdminDashboardClient({
  initialSnapshot,
}: {
  initialSnapshot?: AdminInitialSnapshot;
}) {
  const { currentUser, language, showToast } = useLupiva();
  const copy = getAdminCopy(language);

  const [activeTab, setActiveTab] = useState<AdminSectionTab>("all");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<AdminTelemetryDTO | null>(
    initialSnapshot?.telemetry ?? null
  );
  const [telemetryLoading, setTelemetryLoading] = useState(!initialSnapshot?.telemetry);

  // Accounts state
  const [accounts, setAccounts] = useState<AdminAccountsResult | null>(
    initialSnapshot?.accounts ?? null
  );
  const [accountsLoading, setAccountsLoading] = useState(!initialSnapshot?.accounts);
  const [accountsQuery, setAccountsQuery] = useState("");
  const [accountsRole, setAccountsRole] = useState<"all" | UserRole>("all");
  const [accountsStatus, setAccountsStatus] = useState<"all" | "active" | "inactive">("all");
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Pipeline state
  const [pipeline, setPipeline] = useState<AdminPipelineQueueResult | null>(
    initialSnapshot?.pipeline ?? null
  );
  const [pipelineLoading, setPipelineLoading] = useState(!initialSnapshot?.pipeline);
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<"all" | PipelineStatus>("all");
  const [pipelinePage, setPipelinePage] = useState(1);
  const [pipelineBusyId, setPipelineBusyId] = useState<string | null>(null);
  const [syncingPipeline, setSyncingPipeline] = useState(false);

  // Audit logs state
  const [audit, setAudit] = useState<AdminAuditResult | null>(
    initialSnapshot?.audit ?? null
  );
  const [auditLoading, setAuditLoading] = useState(!initialSnapshot?.audit);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCategory, setAuditCategory] = useState<AuditCategoryFilter>("all");
  const [auditRole, setAuditRole] = useState<AuditActorRoleFilter>("all");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);

  const loadTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/telemetry", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTelemetry(data as AdminTelemetryDTO);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const params = new URLSearchParams({
        q: accountsQuery,
        role: accountsRole,
        status: accountsStatus,
        page: String(accountsPage),
        pageSize: "15",
      });
      const res = await fetch(`/api/admin/accounts?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAccounts(data as AdminAccountsResult);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setAccountsLoading(false);
    }
  }, [accountsPage, accountsQuery, accountsRole, accountsStatus]);

  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const params = new URLSearchParams({
        q: pipelineQuery,
        status: pipelineStatus,
        page: String(pipelinePage),
        pageSize: "15",
      });
      const res = await fetch(`/api/admin/pipeline?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPipeline(data as AdminPipelineQueueResult);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setPipelineLoading(false);
    }
  }, [pipelinePage, pipelineQuery, pipelineStatus]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        q: auditQuery,
        category: auditCategory,
        actorRole: auditRole,
        dateFrom: auditDateFrom,
        dateTo: auditDateTo,
        page: String(auditPage),
        pageSize: "20",
      });
      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAudit(data as AdminAuditResult);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setAuditLoading(false);
    }
  }, [auditCategory, auditDateFrom, auditDateTo, auditPage, auditQuery, auditRole]);

  useEffect(() => {
    if (initialSnapshot?.telemetry) return;
    const timer = setTimeout(() => {
      void loadTelemetry();
    }, 0);
    return () => clearTimeout(timer);
  }, [initialSnapshot?.telemetry, loadTelemetry]);

  useEffect(() => {
    if (initialSnapshot?.accounts && !accountsQuery && accountsRole === "all" && accountsStatus === "all" && accountsPage === 1) {
      return;
    }
    const timer = setTimeout(() => {
      void loadAccounts();
    }, 120);
    return () => clearTimeout(timer);
  }, [accountsPage, accountsQuery, accountsRole, accountsStatus, initialSnapshot?.accounts, loadAccounts]);

  useEffect(() => {
    if (initialSnapshot?.pipeline && !pipelineQuery && pipelineStatus === "all" && pipelinePage === 1) {
      return;
    }
    const timer = setTimeout(() => {
      void loadPipeline();
    }, 120);
    return () => clearTimeout(timer);
  }, [initialSnapshot?.pipeline, loadPipeline, pipelinePage, pipelineQuery, pipelineStatus]);

  useEffect(() => {
    if (
      initialSnapshot?.audit &&
      !auditQuery &&
      auditCategory === "all" &&
      auditRole === "all" &&
      !auditDateFrom &&
      !auditDateTo &&
      auditPage === 1
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void loadAudit();
    }, 120);
    return () => clearTimeout(timer);
  }, [
    auditCategory,
    auditDateFrom,
    auditDateTo,
    auditPage,
    auditQuery,
    auditRole,
    initialSnapshot?.audit,
    loadAudit,
  ]);

  const handleRefreshAll = async () => {
    setErrorBanner(null);
    setRefreshingAll(true);
    setTelemetryLoading(true);
    try {
      await Promise.all([
        loadTelemetry(),
        loadAccounts(),
        loadPipeline(),
        loadAudit(),
      ]);
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleUpdateAccount = async (
    userId: string,
    patch: AdminUpdateAccountInput
  ): Promise<boolean> => {
    setErrorBanner(null);
    setAccountBusyId(userId);
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorBanner(msg);
        showToast(copy.accounts.title, msg, "amber");
        return false;
      }
      showToast(copy.accounts.title, (data as { account: { name: string } }).account.name, "teal");
      await Promise.all([loadAccounts(), loadTelemetry(), loadAudit()]);
      return true;
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleCreateAccount = async (
    input: AdminCreateAccountInput
  ): Promise<boolean> => {
    setErrorBanner(null);
    setCreatingAccount(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorBanner(msg);
        showToast(copy.accounts.createTitle, msg, "amber");
        return false;
      }
      showToast(
        copy.accounts.createTitle,
        (data as { account: { name: string } }).account.name,
        "teal"
      );
      await Promise.all([loadAccounts(), loadTelemetry(), loadAudit()]);
      return true;
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSyncQueue = async () => {
    setErrorBanner(null);
    setSyncingPipeline(true);
    try {
      const res = await fetch("/api/admin/pipeline/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorBanner(msg);
        showToast(copy.pipeline.title, msg, "amber");
        return;
      }
      showToast(copy.pipeline.title, copy.pipeline.syncBtn, "teal");
      await Promise.all([loadPipeline(), loadTelemetry(), loadAudit()]);
    } finally {
      setSyncingPipeline(false);
    }
  };

  const handlePipelineAction = async (
    submissionId: string,
    action: AdminPipelineActionInput
  ) => {
    setErrorBanner(null);
    setPipelineBusyId(submissionId);
    try {
      const res = await fetch(
        `/api/admin/pipeline/${encodeURIComponent(submissionId)}/action`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setErrorBanner(msg);
        showToast(copy.pipeline.title, msg, "amber");
        return;
      }
      showToast(copy.pipeline.title, action.action, "teal");
      await Promise.all([loadPipeline(), loadTelemetry(), loadAudit()]);
    } finally {
      setPipelineBusyId(null);
    }
  };

  const queueAttentionCount = pipeline
    ? pipeline.summary.failed + (pipeline.summary.byStatus.privacy_review ?? 0)
    : telemetry
      ? (telemetry.metrics.pipelineBreakdown.failed ?? 0) +
        (telemetry.metrics.pipelineBreakdown.privacy_review ?? 0)
      : 0;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 py-6 font-sans sm:py-8 focus:outline-none"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {copy.pageTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{copy.pageSubtitle}</p>
            {telemetry && (
              <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                {copy.lastUpdated}: {new Date(telemetry.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>

          <button
            type="button"
            id="admin-btn-refresh-all"
            disabled={refreshingAll}
            onClick={() => void handleRefreshAll()}
            className="min-h-9 cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {refreshingAll ? copy.refreshing : copy.refreshAll}
          </button>
        </header>

        {errorBanner && (
          <div
            id="admin-error-banner"
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-900"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="cursor-pointer rounded px-2 py-0.5 text-rose-700 hover:bg-rose-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Top KPI Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">
              {copy.kpis.activeAccounts}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {accounts?.summary.active ?? telemetry?.metrics.users.active ?? "—"}
              <span className="ml-1.5 text-xs font-normal text-slate-500">
                / {accounts?.summary.total ?? telemetry?.metrics.users.total ?? "—"}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">
              {copy.kpis.systemHealth}
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                telemetry?.overallStatus === "healthy"
                  ? "text-emerald-700"
                  : telemetry
                    ? "text-amber-700"
                    : "text-slate-900"
              }`}
            >
              {telemetry
                ? telemetry.overallStatus === "healthy"
                  ? copy.kpis.healthy
                  : copy.kpis.degraded
                : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">
              {copy.kpis.queueAttention}
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                queueAttentionCount > 0 ? "text-amber-700" : "text-teal-700"
              }`}
            >
              {queueAttentionCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">
              {copy.kpis.securityAlerts24h}
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                (telemetry?.securityPosture.securityAlerts24h ?? 0) > 0
                  ? "text-rose-700"
                  : "text-slate-900"
              }`}
            >
              {telemetry?.securityPosture.securityAlerts24h ??
                audit?.summary.securityAlerts ??
                "—"}
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <nav
          aria-label="Admin sections"
          className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs"
        >
          {(
            [
              ["all", copy.tabs.all],
              ["accounts", copy.tabs.accounts],
              ["telemetry", copy.tabs.telemetry],
              ["pipeline", copy.tabs.pipeline],
              ["audit", copy.tabs.audit],
            ] as const
          ).map(([tabKey, label]) => {
            const selected = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                id={`admin-tab-${tabKey}`}
                aria-pressed={selected}
                onClick={() => setActiveTab(tabKey)}
                className={`cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  selected
                    ? "bg-teal-700 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Panels */}
        {(activeTab === "all" || activeTab === "telemetry") && (
          <TelemetryPanel
            telemetry={telemetry}
            copy={copy}
            loading={telemetryLoading}
          />
        )}

        {(activeTab === "all" || activeTab === "accounts") && (
          <AccountsPanel
            data={accounts}
            copy={copy}
            currentUserId={currentUser?.id ?? ""}
            loading={accountsLoading}
            busyId={accountBusyId}
            creating={creatingAccount}
            searchQuery={accountsQuery}
            roleFilter={accountsRole}
            statusFilter={accountsStatus}
            onSearchChange={(q) => {
              setAccountsQuery(q);
              setAccountsPage(1);
            }}
            onRoleFilterChange={(role) => {
              setAccountsRole(role);
              setAccountsPage(1);
            }}
            onStatusFilterChange={(status) => {
              setAccountsStatus(status);
              setAccountsPage(1);
            }}
            onPageChange={setAccountsPage}
            onUpdateAccount={handleUpdateAccount}
            onCreateAccount={handleCreateAccount}
          />
        )}

        {(activeTab === "all" || activeTab === "pipeline") && (
          <PipelineQueuePanel
            data={pipeline}
            copy={copy}
            loading={pipelineLoading}
            busyId={pipelineBusyId}
            syncing={syncingPipeline}
            searchQuery={pipelineQuery}
            statusFilter={pipelineStatus}
            onSearchChange={(q) => {
              setPipelineQuery(q);
              setPipelinePage(1);
            }}
            onStatusFilterChange={(status) => {
              setPipelineStatus(status);
              setPipelinePage(1);
            }}
            onPageChange={setPipelinePage}
            onSyncQueue={handleSyncQueue}
            onJobAction={handlePipelineAction}
          />
        )}

        {(activeTab === "all" || activeTab === "audit") && (
          <AuditLogPanel
            data={audit}
            copy={copy}
            loading={auditLoading}
            searchQuery={auditQuery}
            category={auditCategory}
            actorRole={auditRole}
            dateFrom={auditDateFrom}
            dateTo={auditDateTo}
            onSearchChange={(q) => {
              setAuditQuery(q);
              setAuditPage(1);
            }}
            onCategoryChange={(cat) => {
              setAuditCategory(cat);
              setAuditPage(1);
            }}
            onActorRoleChange={(r) => {
              setAuditRole(r);
              setAuditPage(1);
            }}
            onDateFromChange={(d) => {
              setAuditDateFrom(d);
              setAuditPage(1);
            }}
            onDateToChange={(d) => {
              setAuditDateTo(d);
              setAuditPage(1);
            }}
            onPageChange={setAuditPage}
          />
        )}
      </div>
    </main>
  );
}
