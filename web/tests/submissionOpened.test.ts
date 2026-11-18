import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mockState = vi.hoisted(() => ({ cookies: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mockState.cookies.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => mockState.cookies.set(name, value),
  }),
}));

import { POST } from "@/app/api/submissions/[id]/opened/route";
import { seedDatabase } from "@/db/seed";
import { auditLogs, crfSubmissions, users } from "@/db/schema";
import { createSession, requireAuth, setSessionCookie, type AuthenticatedUserDTO } from "@/lib/auth";
import { markSubmissionOpened } from "@/lib/submissionOpened";
import { createPatientSubmission } from "@/lib/submissionsService";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

describe("doctor first-open marker", () => {
  let testDb: TestDatabaseHandle;
  let specialist: AuthenticatedUserDTO;
  let submissionId: string;

  async function signIn(role: "specialist" | "patient") {
    mockState.cookies.clear();
    const [user] = await testDb.db.select().from(users).where(eq(users.role, role));
    const session = await createSession(user.id);
    await setSessionCookie(session.rawToken, session.expiresAt);
    return requireAuth();
  }

  function opened(id = submissionId) {
    return POST(
      new Request(`http://localhost:3000/api/submissions/${id}/opened`, {
        method: "POST",
        headers: { Host: "localhost:3000", Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin" },
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    await testDb.resetTables();
    await seedDatabase(testDb.db);
    const patient = await signIn("patient");
    const created = await createPatientSubmission({
      user: patient,
      db: testDb.db,
      input: { utcOffsetMinutes: 420, files: [{ name: "lab.png", mimeType: "image/png", sizeBytes: 100, isImage: true }] },
    });
    submissionId = created.dbSubmissionId;
    specialist = await signIn("specialist");
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("marks a submission once; a second open keeps the first time and records who opened it", async () => {
    const first = await markSubmissionOpened({ user: specialist, submissionId, db: testDb.db });
    const second = await markSubmissionOpened({ user: specialist, submissionId, db: testDb.db });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.firstOpenedAt).toBe(first.firstOpenedAt);
    const [row] = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.id, submissionId));
    expect(row.firstOpenedByUserId).toBe(specialist.id);
  });

  it("audits only the first open through the route", async () => {
    const response = await opened();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ changed: true });
    expect(await opened().then((r) => r.json())).toMatchObject({ changed: false });
    const audits = await testDb.db.select().from(auditLogs).where(eq(auditLogs.action, "submission.opened"));
    expect(audits).toHaveLength(1);
  });

  it("refuses a patient with 403 and leaves the submission new", async () => {
    await signIn("patient");
    expect((await opened()).status).toBe(403);
    const [row] = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.id, submissionId));
    expect(row.firstOpenedAt).toBeNull();
  });

  it("returns 404 for an unknown submission", async () => {
    expect((await opened("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
