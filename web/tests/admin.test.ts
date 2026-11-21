import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

interface StoredCookie {
  value: string;
  options: Record<string, unknown>;
}

const mockState = vi.hoisted(() => ({
  cookieJar: new Map<string, StoredCookie>(),
  afterCallbacks: [] as Array<() => Promise<void>>,
  startPipeline: vi.fn(async () => "processing" as const),
  refreshPipeline: vi.fn(async () => 2),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = mockState.cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      mockState.cookieJar.set(name, { value, options });
    },
    delete: (name: string) => {
      mockState.cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => undefined,
    after: (cb: () => Promise<void>) => {
      mockState.afterCallbacks.push(cb);
    },
  };
});

vi.mock("@/lib/intakeOrchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intakeOrchestrator")>();
  return {
    ...actual,
    startSubmissionPipeline: mockState.startPipeline,
    refreshPipelineStatuses: mockState.refreshPipeline,
  };
});

import { DEMO_USERS, type UserRole } from "@/data/mockData";
import {
  auditLogs,
  authRateLimits,
  crfSubmissions,
  sessions,
  uploadedDocuments,
  users,
} from "@/db/schema";
import { seedDatabase, SEEDED_ADMIN_UUID, SEEDED_PATIENT_UUID, SEEDED_SPECIALIST_UUID } from "@/db/seed";
import { createSession, requireAuth, setSessionCookie } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import {
  auditLogsToCsv,
  getAdminTelemetry,
  listAdminPipelineQueue,
  sanitizeCsvCell,
  syncAdminPipelineQueue,
  updateAdminAccount,
  type AdminAccountsResult,
  type AdminAuditResult,
  type AdminPipelineQueueResult,
  type AdminTelemetryDTO,
} from "@/lib/adminService";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as adminAccountsGet, POST as adminAccountsPost } from "@/app/api/admin/accounts/route";
import { PATCH as adminAccountPatch } from "@/app/api/admin/accounts/[id]/route";
import { GET as adminTelemetryGet } from "@/app/api/admin/telemetry/route";
import { GET as adminPipelineGet } from "@/app/api/admin/pipeline/route";
import { POST as adminPipelineActionPost } from "@/app/api/admin/pipeline/[id]/action/route";
import { POST as adminPipelineSyncPost } from "@/app/api/admin/pipeline/sync/route";
import { GET as adminAuditGet } from "@/app/api/admin/audit-logs/route";
import { proxy } from "@/proxy";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

function buildRequest(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const method = options.method ?? "GET";
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-For": "10.10.20.30",
      "User-Agent": "Vitest-Admin-Suite/1.0",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

describe("Admin Console API, RBAC, Security & Features", () => {
  let testDb: TestDatabaseHandle;

  async function signInAs(role: UserRole): Promise<string> {
    const [row] = await testDb.db.select().from(users).where(eq(users.role, role)).limit(1);
    const created = await createSession(
      row.id,
      { ipAddress: "127.0.0.1", userAgent: "Vitest" },
      testDb.db
    );
    await setSessionCookie(created.rawToken, created.expiresAt);
    return row.id;
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    mockState.cookieJar.clear();
    mockState.afterCallbacks = [];
    mockState.startPipeline.mockClear();
    mockState.refreshPipeline.mockClear();
    await testDb.resetTables();
    await seedDatabase(testDb.db, { includeAdmin: true });
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("seeds admin idempotently when includeAdmin is true and supports admin login", async () => {
    const secondSeed = await seedDatabase(testDb.db, { includeAdmin: true });
    expect(secondSeed.usersSeeded).toBe(3);
    expect(secondSeed.adminId).toBe(SEEDED_ADMIN_UUID);

    const loginRes = await loginPost(
      buildRequest("/api/auth/login", {
        method: "POST",
        body: {
          email: DEMO_USERS.admin.email,
          password: DEMO_USERS.admin.passwordHint,
        },
      })
    );
    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as { user: { role: string; email: string } };
    expect(body.user.role).toBe("admin");
    expect(body.user.email).toBe(DEMO_USERS.admin.email);
  });

  it("protects /admin in proxy.ts and prevents self-registration as admin", async () => {
    const unauthProxy = proxy(new NextRequest("http://localhost:3000/admin?tab=audit"));
    expect(unauthProxy.status).toBe(307);
    expect(unauthProxy.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fadmin%3Ftab%3Daudit"
    );

    const authProxy = proxy(
      new NextRequest("http://localhost:3000/admin", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=opaque-token` },
      })
    );
    expect(authProxy.status).toBe(200);

    const registerAdminRes = await registerPost(
      buildRequest("/api/auth/register", {
        method: "POST",
        body: {
          fullName: "Attempted Escalation",
          email: "escalate@example.test",
          password: "StrongPassword#1",
          role: "admin",
          consentChecked: true,
        },
      })
    );
    expect(registerAdminRes.status).toBe(400);
  });

  it("enforces strict 401/403 RBAC and CSRF origin checks across all /api/admin/* endpoints", async () => {
    const sampleSub = (await testDb.db.select().from(crfSubmissions).limit(1))[0];

    // 1. Unauthenticated -> 401
    expect((await adminAccountsGet(buildRequest("/api/admin/accounts"))).status).toBe(401);
    expect((await adminTelemetryGet()).status).toBe(401);
    expect((await adminPipelineGet(buildRequest("/api/admin/pipeline"))).status).toBe(401);
    expect((await adminAuditGet(buildRequest("/api/admin/audit-logs"))).status).toBe(401);
    expect(
      (
        await adminAccountPatch(
          buildRequest(`/api/admin/accounts/${SEEDED_PATIENT_UUID}`, {
            method: "PATCH",
            body: { isActive: false },
          }),
          { params: Promise.resolve({ id: SEEDED_PATIENT_UUID }) }
        )
      ).status
    ).toBe(401);
    expect(
      (
        await adminPipelineActionPost(
          buildRequest(`/api/admin/pipeline/${sampleSub.id}/action`, {
            method: "POST",
            body: { action: "sync" },
          }),
          { params: Promise.resolve({ id: sampleSub.id }) }
        )
      ).status
    ).toBe(401);

    // 2. Patient -> 403 on GETs and all mutation routes
    await signInAs("patient");
    expect((await adminAccountsGet(buildRequest("/api/admin/accounts"))).status).toBe(403);
    expect((await adminTelemetryGet()).status).toBe(403);
    expect((await adminPipelineGet(buildRequest("/api/admin/pipeline"))).status).toBe(403);
    expect((await adminAuditGet(buildRequest("/api/admin/audit-logs"))).status).toBe(403);
    expect(
      (
        await adminAccountsPost(
          buildRequest("/api/admin/accounts", {
            method: "POST",
            body: { fullName: "Test", email: "t@example.test", password: "Password#1", role: "patient" },
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminAccountPatch(
          buildRequest(`/api/admin/accounts/${SEEDED_PATIENT_UUID}`, {
            method: "PATCH",
            body: { isActive: false },
          }),
          { params: Promise.resolve({ id: SEEDED_PATIENT_UUID }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineActionPost(
          buildRequest(`/api/admin/pipeline/${sampleSub.id}/action`, {
            method: "POST",
            body: { action: "retry" },
          }),
          { params: Promise.resolve({ id: sampleSub.id }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineSyncPost(
          buildRequest("/api/admin/pipeline/sync", { method: "POST" })
        )
      ).status
    ).toBe(403);

    // 3. Specialist -> 403 on GETs and all mutation routes (doctors are not system admins)
    mockState.cookieJar.clear();
    await signInAs("specialist");
    expect((await adminAccountsGet(buildRequest("/api/admin/accounts"))).status).toBe(403);
    expect((await adminTelemetryGet()).status).toBe(403);
    expect((await adminPipelineGet(buildRequest("/api/admin/pipeline"))).status).toBe(403);
    expect((await adminAuditGet(buildRequest("/api/admin/audit-logs"))).status).toBe(403);
    expect(
      (
        await adminAccountsPost(
          buildRequest("/api/admin/accounts", {
            method: "POST",
            body: { fullName: "Test", email: "t@example.test", password: "Password#1", role: "patient" },
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminAccountPatch(
          buildRequest(`/api/admin/accounts/${SEEDED_PATIENT_UUID}`, {
            method: "PATCH",
            body: { isActive: false },
          }),
          { params: Promise.resolve({ id: SEEDED_PATIENT_UUID }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineActionPost(
          buildRequest(`/api/admin/pipeline/${sampleSub.id}/action`, {
            method: "POST",
            body: { action: "mark_failed" },
          }),
          { params: Promise.resolve({ id: sampleSub.id }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineSyncPost(
          buildRequest("/api/admin/pipeline/sync", { method: "POST" })
        )
      ).status
    ).toBe(403);

    // 4. Cross-origin CSRF -> 403 on all admin mutation routes even with admin session
    mockState.cookieJar.clear();
    await signInAs("admin");
    expect(
      (
        await adminAccountsPost(
          buildRequest("/api/admin/accounts", {
            method: "POST",
            body: { fullName: "CSRF", email: "c@example.test", password: "Password#1", role: "patient" },
            headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminAccountPatch(
          buildRequest(`/api/admin/accounts/${SEEDED_PATIENT_UUID}`, {
            method: "PATCH",
            body: { isActive: false },
            headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
          }),
          { params: Promise.resolve({ id: SEEDED_PATIENT_UUID }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineActionPost(
          buildRequest(`/api/admin/pipeline/${sampleSub.id}/action`, {
            method: "POST",
            body: { action: "retry" },
            headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
          }),
          { params: Promise.resolve({ id: sampleSub.id }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await adminPipelineSyncPost(
          buildRequest("/api/admin/pipeline/sync", {
            method: "POST",
            headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
          })
        )
      ).status
    ).toBe(403);
  });

  it("manages accounts: lists/filters without leaking secrets, provisions, updates role/status, revokes sessions, and guards self/last-admin", async () => {
    const adminId = await signInAs("admin");

    // Also create a session for the seeded patient to test automatic revocation
    const patientSession = await createSession(
      SEEDED_PATIENT_UUID,
      { ipAddress: "127.0.0.1", userAgent: "PatientDevice" },
      testDb.db
    );

    const listRes = await adminAccountsGet(buildRequest("/api/admin/accounts?role=all&status=active"));
    expect(listRes.status).toBe(200);
    expect(listRes.headers.get("Cache-Control")).toBe("no-store");

    const listBody = (await listRes.json()) as AdminAccountsResult;
    expect(listBody.summary.total).toBe(3);
    expect(listBody.summary.byRole).toEqual({ patient: 1, specialist: 1, admin: 1 });
    const rawJson = JSON.stringify(listBody);
    expect(rawJson).not.toContain("passwordHash");
    expect(rawJson).not.toContain("emailBlindIndex");
    expect(rawJson).not.toContain("emailEncrypted");

    // Search by decrypted email/name
    const searchRes = await adminAccountsGet(buildRequest("/api/admin/accounts?q=Nguyen%20Minh"));
    const searchBody = (await searchRes.json()) as AdminAccountsResult;
    expect(searchBody.items).toHaveLength(1);
    expect(searchBody.items[0].id).toBe(SEEDED_SPECIALIST_UUID);

    // Provision a new specialist account
    const createRes = await adminAccountsPost(
      buildRequest("/api/admin/accounts", {
        method: "POST",
        body: {
          fullName: "Dr. Le Thu Ha",
          email: "thuha.le@example.test",
          phone: "0912345678",
          password: "StaffUser#2026",
          role: "specialist",
          title: "Attending Rheumatologist",
          departmentOrRegistryId: "Vinmec Times City",
        },
      })
    );
    expect(createRes.status).toBe(201);
    const createdAccount = (await createRes.json()) as { account: { id: string; role: string } };
    expect(createdAccount.account.role).toBe("specialist");

    // Duplicate email rejected with 409
    const dupRes = await adminAccountsPost(
      buildRequest("/api/admin/accounts", {
        method: "POST",
        body: {
          fullName: "Duplicate User",
          email: "thuha.le@example.test",
          password: "StaffUser#2026",
          role: "patient",
        },
      })
    );
    expect(dupRes.status).toBe(409);

    // Suspending patient immediately revokes their active session
    const suspendRes = await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${SEEDED_PATIENT_UUID}`, {
        method: "PATCH",
        body: { isActive: false },
      }),
      { params: Promise.resolve({ id: SEEDED_PATIENT_UUID }) }
    );
    expect(suspendRes.status).toBe(200);
    const suspendBody = (await suspendRes.json()) as {
      account: { isActive: boolean; activeSessionCount: number };
      sessionsRevoked: number;
    };
    expect(suspendBody.account.isActive).toBe(false);
    expect(suspendBody.sessionsRevoked).toBe(1);
    const remainingPatientSessions = await testDb.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, patientSession.sessionId));
    expect(remainingPatientSessions).toHaveLength(0);

    // Admin cannot deactivate or demote themselves (409)
    const selfSuspendRes = await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${adminId}`, {
        method: "PATCH",
        body: { isActive: false },
      }),
      { params: Promise.resolve({ id: adminId }) }
    );
    expect(selfSuspendRes.status).toBe(409);

    const selfDemoteRes = await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${adminId}`, {
        method: "PATCH",
        body: { role: "specialist" },
      }),
      { params: Promise.resolve({ id: adminId }) }
    );
    expect(selfDemoteRes.status).toBe(409);

    // Invalid UUID -> 400
    const badUuidRes = await adminAccountPatch(
      buildRequest("/api/admin/accounts/not-a-uuid", {
        method: "PATCH",
        body: { isActive: false },
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(badUuidRes.status).toBe(400);

    // Promote new specialist to admin, verify last-admin guard when another admin exists vs when only one remains
    await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${createdAccount.account.id}`, {
        method: "PATCH",
        body: { role: "admin" },
      }),
      { params: Promise.resolve({ id: createdAccount.account.id }) }
    );
    const demoteOtherAdminRes = await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${createdAccount.account.id}`, {
        method: "PATCH",
        body: { role: "specialist" },
      }),
      { params: Promise.resolve({ id: createdAccount.account.id }) }
    );
    expect(demoteOtherAdminRes.status).toBe(200);

    // Last active admin cannot be deactivated or demoted even by another actor
    await expect(
      updateAdminAccount(
        adminId,
        { isActive: false },
        { id: createdAccount.account.id, role: "admin", name: "Actor" },
        {},
        testDb.db
      )
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateAdminAccount(
        adminId,
        { role: "specialist" },
        { id: createdAccount.account.id, role: "admin", name: "Actor" },
        {},
        testDb.db
      )
    ).rejects.toMatchObject({ status: 409 });

    // Self session revocation revokes OTHER sessions while keeping the current session alive
    await createSession(
      adminId,
      { ipAddress: "10.0.0.5", userAgent: "SecondDevice" },
      testDb.db
    );
    const revokeSelfRes = await adminAccountPatch(
      buildRequest(`/api/admin/accounts/${adminId}`, {
        method: "PATCH",
        body: { revokeSessions: true },
      }),
      { params: Promise.resolve({ id: adminId }) }
    );
    expect(revokeSelfRes.status).toBe(200);
    expect((await revokeSelfRes.json()) as { sessionsRevoked: number }).toMatchObject({
      sessionsRevoked: 1,
    });
    // Current admin session still authenticates cleanly
    const stillAuthed = await requireAuth(["admin"], testDb.db);
    expect(stillAuthed.id).toBe(adminId);

    // Direct self-revocation without a sessionId to preserve is rejected with 409
    await expect(
      updateAdminAccount(
        adminId,
        { revokeSessions: true },
        { id: adminId, role: "admin", name: "Admin" },
        {},
        testDb.db
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("collects system health & telemetry metrics accurately and handles offline pipeline gracefully", async () => {
    await signInAs("admin");

    // Seed a rate limit lockout and a security alert audit log
    await testDb.db.insert(authRateLimits).values({
      key: "login:10.0.0.1:abc",
      attemptCount: 5,
      windowStart: new Date(),
      lockedUntil: new Date(Date.now() + 60_000),
    });
    await testDb.db.insert(auditLogs).values({
      actorUserId: null,
      actorRole: null,
      action: "auth.login_failed",
      targetType: "auth_gate",
      ipAddress: "10.0.0.1",
      metadataJson: { reason: "invalid_password" },
    });

    // Route test (with offline pipeline in test sandbox)
    const telemetryRes = await adminTelemetryGet();
    expect(telemetryRes.status).toBe(200);
    expect(telemetryRes.headers.get("Cache-Control")).toBe("no-store");
    const telemetryBody = (await telemetryRes.json()) as AdminTelemetryDTO;
    expect(telemetryBody.services.database.status).toBe("connected");
    expect(telemetryBody.services.encryptionVault.configured).toBe(true);
    expect(telemetryBody.securityPosture.activeRateLimitLockouts).toBe(1);
    expect(telemetryBody.securityPosture.securityAlerts24h).toBeGreaterThanOrEqual(1);
    expect(telemetryBody.metrics.users.total).toBe(3);

    // Never leaks key material
    expect(JSON.stringify(telemetryBody)).not.toContain(process.env.ENCRYPTION_MASTER_KEY!);
    expect(JSON.stringify(telemetryBody)).not.toContain(process.env.AUTH_SECRET!);

    // Service test with online mocked pipeline probe -> healthy overallStatus
    const healthyTelemetry = await getAdminTelemetry({
      db: testDb.db,
      probePipeline: async () => ({
        status: "online",
        latencyMs: 12,
        httpStatus: 200,
        caseCount: 4,
      }),
    });
    expect(healthyTelemetry.overallStatus).toBe("healthy");
    expect(healthyTelemetry.services.pipelineBackend.caseCount).toBe(4);
  });

  it("inspects and manages the OCR pipeline queue (filter, retry, mark_failed, reset_pending, sync)", async () => {
    const adminId = await signInAs("admin");
    const [sub] = await testDb.db.select().from(crfSubmissions).limit(1);

    // Mark submission as failed and add a local stored document so retry is valid
    await testDb.db
      .update(crfSubmissions)
      .set({
        pipelineStatus: "failed",
        pipelineError: "Timeout waiting for Gemini extraction",
        pipelineIntakeId: "intake-991",
      })
      .where(eq(crfSubmissions.id, sub.id));

    await testDb.db.insert(uploadedDocuments).values({
      submissionId: sub.id,
      fileName: "lab_scan_local.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      isImage: true,
      storageProvider: "local",
      storageKey: "local-test.bin",
      ocrJobStatus: "failed",
    });

    // GET /api/admin/pipeline?status=failed
    const queueRes = await adminPipelineGet(
      buildRequest("/api/admin/pipeline?status=failed&q=intake-991")
    );
    expect(queueRes.status).toBe(200);
    const queueBody = (await queueRes.json()) as AdminPipelineQueueResult;
    expect(queueBody.items).toHaveLength(1);
    expect(queueBody.items[0].submissionId).toBe(sub.id);
    expect(queueBody.items[0].localStoredImageCount).toBe(1);
    expect(queueBody.summary.failed).toBe(1);

    // Retry failed job -> 202 and schedules pipeline
    const retryRes = await adminPipelineActionPost(
      buildRequest(`/api/admin/pipeline/${sub.id}/action`, {
        method: "POST",
        body: { action: "retry" },
      }),
      { params: Promise.resolve({ id: sub.id }) }
    );
    expect(retryRes.status).toBe(202);
    expect(mockState.afterCallbacks).toHaveLength(1);
    await mockState.afterCallbacks[0]();
    expect(mockState.startPipeline).toHaveBeenCalledWith(sub.id);

    // Retrying a non-failed job returns 409
    const retryAgainRes = await adminPipelineActionPost(
      buildRequest(`/api/admin/pipeline/${sub.id}/action`, {
        method: "POST",
        body: { action: "retry" },
      }),
      { params: Promise.resolve({ id: sub.id }) }
    );
    expect(retryAgainRes.status).toBe(409);

    // Mark a processing job as failed with reason
    await testDb.db
      .update(crfSubmissions)
      .set({ pipelineStatus: "processing" })
      .where(eq(crfSubmissions.id, sub.id));

    const markFailedRes = await adminPipelineActionPost(
      buildRequest(`/api/admin/pipeline/${sub.id}/action`, {
        method: "POST",
        body: { action: "mark_failed", reason: "Stuck worker aborted by admin" },
      }),
      { params: Promise.resolve({ id: sub.id }) }
    );
    expect(markFailedRes.status).toBe(200);

    // Reset failed job back to pending ("none")
    const resetRes = await adminPipelineActionPost(
      buildRequest(`/api/admin/pipeline/${sub.id}/action`, {
        method: "POST",
        body: { action: "reset_pending" },
      }),
      { params: Promise.resolve({ id: sub.id }) }
    );
    expect(resetRes.status).toBe(200);
    const [afterReset] = await testDb.db
      .select()
      .from(crfSubmissions)
      .where(eq(crfSubmissions.id, sub.id));
    expect(afterReset.pipelineStatus).toBe("none");
    expect(afterReset.pipelineError).toBeNull();

    // Sync action on dedicated /api/admin/pipeline/sync returns synced count
    const syncRes = await adminPipelineSyncPost(
      buildRequest("/api/admin/pipeline/sync", { method: "POST" })
    );
    expect(syncRes.status).toBe(200);
    expect((await syncRes.json()) as { syncedCount: number }).toMatchObject({
      syncedCount: 2,
    });

    // Unconditional UUID check on /api/admin/pipeline/[id]/action
    const badSubUuidRes = await adminPipelineActionPost(
      buildRequest("/api/admin/pipeline/not-a-uuid/action", {
        method: "POST",
        body: { action: "retry" },
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(badSubUuidRes.status).toBe(400);

    // Non-image local doc cannot satisfy retry check
    await testDb.db
      .update(uploadedDocuments)
      .set({ isImage: false })
      .where(eq(uploadedDocuments.submissionId, sub.id));
    await testDb.db
      .update(crfSubmissions)
      .set({ pipelineStatus: "failed" })
      .where(eq(crfSubmissions.id, sub.id));
    const retryNonImageRes = await adminPipelineActionPost(
      buildRequest(`/api/admin/pipeline/${sub.id}/action`, {
        method: "POST",
        body: { action: "retry" },
      }),
      { params: Promise.resolve({ id: sub.id }) }
    );
    expect(retryNonImageRes.status).toBe(400);

    // Offline backend sync throws 502
    await expect(
      syncAdminPipelineQueue(
        { id: adminId, role: "admin", name: "Admin" },
        {},
        {
          db: testDb.db,
          syncPipeline: async () => {
            throw new Error("ECONNREFUSED");
          },
        }
      )
    ).rejects.toMatchObject({ status: 502 });

    // Online backend job status enrichment check
    const enriched = await listAdminPipelineQueue(
      { status: "all" },
      {
        db: testDb.db,
        fetchBackendIntakes: async () => ({
          online: true,
          jobs: [{ job_id: "intake-991", status: "running" }],
        }),
      }
    );
    expect(enriched.backendOnline).toBe(true);
    expect(
      enriched.items.find((i) => i.submissionId === sub.id)?.backendJobStatus
    ).toBe("running");
  });

  it("queries, filters, and safely exports security audit logs", async () => {
    const adminId = await signInAs("admin");

    await testDb.db.insert(auditLogs).values([
      {
        actorUserId: null,
        actorRole: null,
        action: "auth.login_failed",
        targetType: "auth_gate",
        ipAddress: "203.0.113.42",
        metadataJson: { reason: "invalid_password" },
      },
      {
        actorUserId: adminId,
        actorRole: "admin",
        action: "admin.account_updated",
        targetType: "user",
        targetId: SEEDED_PATIENT_UUID,
        ipAddress: "127.0.0.1",
        metadataJson: { changedFields: ["isActive"] },
      },
      {
        actorUserId: SEEDED_SPECIALIST_UUID,
        actorRole: "specialist",
        action: "submission.opened",
        targetType: "crf_submission",
        targetId: "00000000-0000-4000-8000-000000000201",
        ipAddress: "10.0.0.9",
        metadataJson: {},
      },
    ]);

    // Filter security_alerts
    const alertsRes = await adminAuditGet(
      buildRequest("/api/admin/audit-logs?category=security_alerts&q=203.0.113.42")
    );
    expect(alertsRes.status).toBe(200);
    const alertsBody = (await alertsRes.json()) as AdminAuditResult;
    expect(alertsBody.items).toHaveLength(1);
    expect(alertsBody.items[0].action).toBe("auth.login_failed");
    expect(alertsBody.items[0].isSecurityAlert).toBe(true);

    // Filter by actorRole=admin
    const adminLogsRes = await adminAuditGet(
      buildRequest("/api/admin/audit-logs?category=admin&actorRole=admin")
    );
    const adminLogsBody = (await adminLogsRes.json()) as AdminAuditResult;
    expect(adminLogsBody.items.length).toBeGreaterThanOrEqual(1);
    expect(adminLogsBody.items[0].actorName).toBe(DEMO_USERS.admin.name);

    // Invalid date filter -> 400
    const badDateRes = await adminAuditGet(
      buildRequest("/api/admin/audit-logs?dateFrom=not-a-date")
    );
    expect(badDateRes.status).toBe(400);

    // CSV formula injection protection (including leading whitespace/control chars)
    expect(sanitizeCsvCell("=CMD|'/C calc'!A0")).toBe(`"'=CMD|'/C calc'!A0"`);
    expect(sanitizeCsvCell(" =CMD|'/C calc'!A0")).toBe(`"' =CMD|'/C calc'!A0"`);
    expect(sanitizeCsvCell("\n=1+1")).toBe(`"'\n=1+1"`);
    expect(sanitizeCsvCell("\tfoo")).toBe(`"'\tfoo"`);
    expect(sanitizeCsvCell("\r=1")).toBe(`"'\r=1"`);
    expect(sanitizeCsvCell("+SUM(A1:A2)")).toBe(`"'+SUM(A1:A2)"`);
    expect(sanitizeCsvCell("-1+1")).toBe(`"'-1+1"`);
    expect(sanitizeCsvCell("@HYPERLINK()")).toBe(`"'@HYPERLINK()"`);

    const csv = auditLogsToCsv([
      {
        actorUserId: null,
        actorName: "=EVIL()",
        actorRole: null,
        action: "auth.login_failed",
        targetType: "auth_gate",
        targetId: null,
        ipAddress: "1.2.3.4",
        metadata: { note: '+quote"test' },
        isSecurityAlert: true,
        createdAt: "2026-11-21T10:00:00.000Z",
      },
    ]);
    expect(csv).toContain(`"'=EVIL()"`);
    expect(csv).toContain(`"{""note"":""+quote\\""test""}"`);
  });
});
