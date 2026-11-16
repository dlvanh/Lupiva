import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mockState = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  start: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mockState.cookies.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => mockState.cookies.set(name, value),
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mockState.after,
}));
vi.mock("@/lib/intakeOrchestrator", () => ({ startSubmissionPipeline: mockState.start }));

import { POST } from "@/app/api/submissions/[id]/retry/route";
import { seedDatabase } from "@/db/seed";
import { auditLogs, crfSubmissions, users, type PipelineStatus } from "@/db/schema";
import { createSession, requireAuth, setSessionCookie, type AuthenticatedUserDTO } from "@/lib/auth";
import { resetFailedSubmission } from "@/lib/submissionUploads";
import { createPatientSubmission } from "@/lib/submissionsService";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

describe("specialist pipeline retry", () => {
  let testDb: TestDatabaseHandle;
  let patient: AuthenticatedUserDTO;
  let specialist: AuthenticatedUserDTO;
  let submissionId: string;

  async function signIn(role: "specialist" | "patient") {
    const [user] = await testDb.db.select().from(users).where(eq(users.role, role));
    const session = await createSession(user.id);
    await setSessionCookie(session.rawToken, session.expiresAt);
    return requireAuth();
  }

  function request(origin = "http://localhost:3000") {
    return new Request(`http://localhost:3000/api/submissions/${submissionId}/retry`, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: origin, "Sec-Fetch-Site": "same-origin" },
    });
  }

  function retry(origin?: string) {
    return POST(request(origin), { params: Promise.resolve({ id: submissionId }) });
  }

  async function row() {
    const [submission] = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.id, submissionId));
    return submission;
  }

  async function setStatus(pipelineStatus: PipelineStatus) {
    await testDb.db.update(crfSubmissions)
      .set({ pipelineStatus, pipelineError: "backend unavailable", pipelineIntakeId: "original-intake" })
      .where(eq(crfSubmissions.id, submissionId));
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    mockState.cookies.clear();
    mockState.after.mockReset();
    mockState.start.mockReset();
    await testDb.resetTables();
    await seedDatabase(testDb.db);
    patient = await signIn("patient");
    const created = await createPatientSubmission({
      user: patient,
      db: testDb.db,
      input: {
        utcOffsetMinutes: 420,
        files: [{ name: "lab.png", mimeType: "image/png", sizeBytes: 100, isImage: true }],
      },
    });
    submissionId = created.dbSubmissionId;
    await setStatus("failed");
    specialist = await signIn("specialist");
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("resets failed status and clears its diagnostic without changing the submission or intake", async () => {
    const original = await row();
    await resetFailedSubmission({ user: specialist, submissionId, db: testDb.db });
    expect(await row()).toEqual({ ...original, pipelineStatus: "none", pipelineError: null });
  });

  it("refuses a patient even when they own the failed submission", async () => {
    await expect(resetFailedSubmission({ user: patient, submissionId, db: testDb.db }))
      .rejects.toMatchObject({ status: 403 });
    expect(await row()).toMatchObject({ pipelineStatus: "failed", pipelineError: "backend unavailable" });
  });

  it("accepts only one of two concurrent resets", async () => {
    const results = await Promise.allSettled([
      resetFailedSubmission({ user: specialist, submissionId, db: testDb.db }),
      resetFailedSubmission({ user: specialist, submissionId, db: testDb.db }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await row()).toMatchObject({ pipelineStatus: "none", pipelineError: null });
  });

  it.each(["none", "privacy_check", "privacy_review", "processing", "completed"] as const)(
    "rejects retry from %s without changing state, scheduling work or auditing a retry",
    async (status) => {
      await setStatus(status);
      const original = await row();
      expect((await retry()).status).toBe(409);
      expect(await row()).toEqual(original);
      expect(mockState.after).not.toHaveBeenCalled();
      expect(await testDb.db.select().from(auditLogs).where(eq(auditLogs.action, "submission.pipeline_retried"))).toEqual([]);
    },
  );

  it("returns 403 for a signed-in patient without resetting or scheduling work", async () => {
    await signIn("patient");
    const response = await retry();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await row()).toMatchObject({ pipelineStatus: "failed", pipelineError: "backend unavailable" });
    expect(mockState.after).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and cross-origin requests without resetting", async () => {
    expect((await retry("https://external.example")).status).toBe(403);
    mockState.cookies.clear();
    expect((await retry()).status).toBe(401);
    expect(await row()).toMatchObject({ pipelineStatus: "failed" });
    expect(mockState.after).not.toHaveBeenCalled();
  });

  it.each(["missing", "00000000-0000-4000-8000-000000000000"])("returns 404 for unknown submission %s", async (id) => {
    submissionId = id;
    expect((await retry()).status).toBe(404);
    expect(mockState.after).not.toHaveBeenCalled();
  });

  it("audits the retry and schedules the usual pipeline after the response", async () => {
    const response = await retry();
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "processing" });
    expect(await row()).toMatchObject({ pipelineStatus: "none", pipelineError: null });
    expect(mockState.start).not.toHaveBeenCalled();
    expect(mockState.after).toHaveBeenCalledTimes(1);
    const [audit] = await testDb.db.select().from(auditLogs).where(eq(auditLogs.action, "submission.pipeline_retried"));
    expect(audit).toMatchObject({
      actorUserId: specialist.id,
      actorRole: "specialist",
      targetId: submissionId,
      targetType: "crf_submission",
      metadataJson: {},
    });
    await mockState.after.mock.calls[0][0]();
    expect(mockState.start).toHaveBeenCalledExactlyOnceWith(submissionId);
  });
});
