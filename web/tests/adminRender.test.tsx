import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TRANSLATIONS, type Language } from "@/data/translations";
import type {
  AdminAccountsResult,
  AdminAuditResult,
  AdminPipelineQueueResult,
  AdminTelemetryDTO,
} from "@/lib/adminService";

const state = vi.hoisted(() => ({
  language: "en" as Language,
  role: "admin" as "admin" | "specialist" | "patient",
  pathname: "/admin",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/newSubmissionStore", () => ({
  useNewSubmissions: () => ({ count: 0, latest: [] }),
}));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({
    language: state.language,
    toggleLanguage: vi.fn(),
    setLanguage: vi.fn(),
    t: TRANSLATIONS[state.language],
    currentUser: {
      id: "00000000-0000-4000-8000-000000000003",
      name: "System Administrator",
      role: state.role,
      title: "Platform & Security Administrator",
      email: "admin.lupiva@example.test",
      departmentOrRegistryId: "Lupiva Operations",
      badgeText: "System Admin",
      consentSigned: true,
    },
    logout: vi.fn(),
    crfPatients: [],
    isActionGuideOpen: false,
    setIsActionGuideOpen: vi.fn(),
    toast: null,
    dismissToast: vi.fn(),
    showToast: vi.fn(),
  }),
}));

import { AccountsPanel } from "@/components/admin/AccountsPanel";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getAdminCopy } from "@/components/admin/adminTranslations";
import { Navbar } from "@/components/Navbar";
import { generateSecurePassword, isValidRegisterPassword } from "@/lib/registerPassword";

const SAMPLE_TELEMETRY: AdminTelemetryDTO = {
  timestamp: "2026-11-21T12:00:00.000Z",
  overallStatus: "healthy",
  services: {
    database: { status: "connected", latencyMs: 4 },
    pipelineBackend: { status: "online", latencyMs: 18, httpStatus: 200, caseCount: 5 },
    encryptionVault: { configured: true },
  },
  securityPosture: {
    demoModeEnabled: false,
    specialistInviteConfigured: true,
    pipelineEngine: "gemini",
    cookieSecureMode: "auto",
    activeSessions: 3,
    activeRateLimitLockouts: 0,
    securityAlerts24h: 1,
    loginFailures24h: 1,
  },
  metrics: {
    users: { total: 4, active: 3, patient: 2, specialist: 1, admin: 1 },
    clinical: {
      patientProfiles: 6,
      submissionsTotal: 6,
      submissionsApproved: 3,
      submissionsPendingReview: 3,
      submissionsUnopened: 1,
    },
    pipelineBreakdown: {
      none: 1,
      privacy_check: 0,
      privacy_review: 1,
      processing: 1,
      completed: 2,
      failed: 1,
    },
    documents: { total: 8, totalBytes: 512000, pendingOcr: 2, completedOcr: 5, failedOcr: 1 },
    auditLogsTotal: 14,
  },
  runtime: {
    nodeVersion: "v20.18.0",
    uptimeSeconds: 3725,
    memoryMb: { rss: 120, heapUsed: 64, heapTotal: 96 },
  },
};

const SAMPLE_ACCOUNTS: AdminAccountsResult = {
  items: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "System Administrator",
      email: "admin.lupiva@example.test",
      phone: null,
      role: "admin",
      title: "Platform & Security Administrator",
      departmentOrRegistryId: "Lupiva Operations",
      badgeText: "System Admin",
      isActive: true,
      consentSigned: true,
      consentSignedAt: "2026-11-21T10:00:00.000Z",
      activeSessionCount: 1,
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Tran Thi Mai",
      email: "mai.tran.patient@example.test",
      phone: "+84912345678",
      role: "patient",
      title: "Registered Patient",
      departmentOrRegistryId: "SLE Registry Cohort",
      badgeText: "Patient",
      isActive: true,
      consentSigned: true,
      consentSignedAt: "2026-11-21T10:00:00.000Z",
      activeSessionCount: 2,
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
    },
  ],
  summary: { total: 2, active: 2, inactive: 0, byRole: { patient: 1, specialist: 0, admin: 1 } },
  pagination: {
    page: 1,
    pageSize: 15,
    totalItems: 2,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
};

const SAMPLE_PIPELINE: AdminPipelineQueueResult = {
  items: [
    {
      submissionId: "00000000-0000-4000-8000-000000000201",
      legacyRecordKey: "crf-pat-084",
      studyId: "VN-SLE-084",
      reviewStatus: "pending_doctor_review",
      pipelineStatus: "failed",
      pipelineIntakeId: "intake-42",
      pipelineError: "Upstream OCR worker timeout",
      backendJobStatus: "failed",
      submittedAt: "2026-11-21T09:00:00.000Z",
      lastUpdatedAt: "2026-11-21T09:30:00.000Z",
      documents: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          fileName: "serology_scan.png",
          mimeType: "image/png",
          sizeBytes: 4096,
          isImage: true,
          storageProvider: "local",
          ocrJobStatus: "failed",
          createdAt: "2026-11-21T09:00:00.000Z",
        },
      ],
      localStoredImageCount: 1,
    },
  ],
  summary: {
    total: 1,
    active: 0,
    pending: 0,
    completed: 0,
    failed: 1,
    byStatus: { none: 0, privacy_check: 0, privacy_review: 0, processing: 0, completed: 0, failed: 1 },
  },
  pagination: {
    page: 1,
    pageSize: 15,
    totalItems: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
  backendOnline: true,
};

const SAMPLE_AUDIT: AdminAuditResult = {
  items: [
    {
      id: "audit-1",
      actorUserId: null,
      actorName: null,
      actorRole: null,
      action: "auth.login_failed",
      targetType: "auth_gate",
      targetId: null,
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      metadata: { reason: "invalid_password" },
      isSecurityAlert: true,
      createdAt: "2026-11-21T11:45:00.000Z",
    },
  ],
  summary: { total: 1, authEvents: 1, securityAlerts: 1, submissionEvents: 0, adminEvents: 0 },
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
  availableActions: ["auth.login_failed"],
};

describe("Admin UI SSR rendering & localization", () => {
  it("renders all four admin features cleanly in English without System Admin pill and with home-page font-sans", () => {
    state.language = "en";
    state.role = "admin";
    state.pathname = "/admin";
    const html = renderToStaticMarkup(
      <AdminDashboardClient
        initialSnapshot={{
          telemetry: SAMPLE_TELEMETRY,
          accounts: SAMPLE_ACCOUNTS,
          pipeline: SAMPLE_PIPELINE,
          audit: SAMPLE_AUDIT,
        }}
      />
    );

    const headerHtml = html.split("</header>")[0];
    expect(headerHtml).toContain("System Administration &amp; Security Console");
    expect(headerHtml).not.toContain(">System Admin<");
    expect(html).toContain("font-sans");
    expect(html).not.toContain("font-mono");
    expect(html).toContain("System Health &amp; Telemetry Overview");
    expect(html).toContain("Account Management");
    expect(html).toContain("OCR Pipeline Queue");
    expect(html).toContain("Security Audit Log Explorer");
    expect(html).toContain("VN-SLE-084");
    expect(html).toContain("Upstream OCR worker timeout");
    expect(html).toContain("auth.login_failed");
    expect(html).toContain("203.0.113.10");
    expect(html).toContain("Retry");
  });

  it("renders all four admin features cleanly in Vietnamese without admin header pill", () => {
    state.language = "vi";
    state.role = "admin";
    state.pathname = "/admin";
    const html = renderToStaticMarkup(
      <AdminDashboardClient
        initialSnapshot={{
          telemetry: SAMPLE_TELEMETRY,
          accounts: SAMPLE_ACCOUNTS,
          pipeline: SAMPLE_PIPELINE,
          audit: SAMPLE_AUDIT,
        }}
      />
    );

    const headerHtml = html.split("</header>")[0];
    expect(headerHtml).toContain("Bảng điều khiển Quản trị &amp; An toàn Hệ thống");
    expect(headerHtml).not.toContain("Quản trị viên");
    expect(html).toContain("Tổng quan Sức khỏe Hệ thống &amp; Telemetry");
    expect(html).toContain("Quản lý Tài khoản");
    expect(html).toContain("Hàng đợi Xử lý OCR Pipeline");
    expect(html).toContain("Tra cứu Nhật ký Bảo mật (Audit Logs)");
    expect(html).toContain("Chạy lại");
  });

  it("omits Admin, Home, and For patients nav links on /admin while keeping sign-out and language switcher", () => {
    state.language = "en";
    state.role = "admin";
    state.pathname = "/admin";
    const adminRouteNav = renderToStaticMarkup(<Navbar />);
    expect(adminRouteNav).not.toContain('id="nav-link-admin"');
    expect(adminRouteNav).not.toContain('id="nav-link-home"');
    expect(adminRouteNav).not.toContain('id="nav-link-patients"');
    expect(adminRouteNav).not.toContain('href="/benh-nhan"');
    expect(adminRouteNav).toContain('id="nav-btn-signout"');
    expect(adminRouteNav).toContain('id="nav-btn-language-toggle"');

    // On non-admin pages, /admin link appears only for admins
    state.pathname = "/";
    const homeAdminNav = renderToStaticMarkup(<Navbar />);
    expect(homeAdminNav).toContain('href="/admin"');

    state.role = "specialist";
    const specialistNav = renderToStaticMarkup(<Navbar />);
    expect(specialistNav).not.toContain('href="/admin"');

    state.role = "patient";
    const patientNav = renderToStaticMarkup(<Navbar />);
    expect(patientNav).not.toContain('href="/admin"');
  });

  it("renders accessible password generator controls in AccountsPanel create form", () => {
    const html = renderToStaticMarkup(
      <AccountsPanel
        data={SAMPLE_ACCOUNTS}
        copy={getAdminCopy("en")}
        currentUserId="00000000-0000-4000-8000-000000000003"
        loading={false}
        busyId={null}
        creating={false}
        searchQuery=""
        roleFilter="all"
        statusFilter="all"
        onSearchChange={() => {}}
        onRoleFilterChange={() => {}}
        onStatusFilterChange={() => {}}
        onPageChange={() => {}}
        onUpdateAccount={async () => true}
        onCreateAccount={async () => true}
        initialCreateOpen
      />
    );

    expect(html).toContain('id="admin-create-password"');
    expect(html).toMatch(/autocomplete="new-password"/i);
    expect(html).toContain('aria-describedby="admin-create-password-hint"');
    expect(html).toContain('id="admin-btn-generate-password"');
    expect(html).toContain("Generate password");
    expect(html).toContain('id="admin-btn-toggle-password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('id="admin-btn-copy-password"');
  });

  it("generates cryptographically strong passwords meeting backend complexity rules", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    const generated = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const pwd = generateSecurePassword(16);
      expect(pwd).toHaveLength(16);
      expect(isValidRegisterPassword(pwd)).toBe(true);
      generated.add(pwd);
    }
    expect(spy).toHaveBeenCalled();
    expect(generated.size).toBe(50);
    spy.mockRestore();
  });
});
