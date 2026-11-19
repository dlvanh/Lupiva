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

import { GET } from "@/app/api/submissions/new-count/route";
import { seedDatabase } from "@/db/seed";
import { crfSubmissions, users } from "@/db/schema";
import { createSession, requireAuth, setSessionCookie } from "@/lib/auth";
import { markSubmissionOpened } from "@/lib/submissionOpened";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

describe("GET /api/submissions/new-count", () => {
  let testDb: TestDatabaseHandle;

  async function signIn(role: "specialist" | "patient") {
    mockState.cookies.clear();
    const [user] = await testDb.db.select().from(users).where(eq(users.role, role));
    const session = await createSession(user.id);
    await setSessionCookie(session.rawToken, session.expiresAt);
    return requireAuth();
  }

  async function newCount() {
    const response = await GET(new Request("http://localhost:3000/api/submissions/new-count"));
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    await testDb.resetTables();
    await seedDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("refuses patients", async () => {
    await signIn("patient");
    expect((await newCount()).status).toBe(403);
  });

  it("counts never-opened unapproved submissions, newest first, and drops one once opened", async () => {
    const specialist = await signIn("specialist");
    const first = await newCount();
    expect(first.status).toBe(200);
    expect(first.body.count).toBe(7);
    expect(first.body.latest).toHaveLength(5);
    const times = first.body.latest.map((entry: { submittedAt: string }) => Date.parse(entry.submittedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const entry of first.body.latest as Array<{ studyId: string; patientName: string }>) {
      expect(entry.studyId).toMatch(/\S/);
      expect(typeof entry.patientName).toBe("string");
    }

    await markSubmissionOpened({ user: specialist, submissionId: first.body.latest[0].id, db: testDb.db });
    const after = await newCount();
    expect(after.body.count).toBe(6);
    expect(after.body.latest.map((entry: { id: string }) => entry.id)).not.toContain(first.body.latest[0].id);

    const approved = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.status, "approved"));
    expect(after.body.latest.map((entry: { id: string }) => entry.id)).not.toContain(approved[0].id);
  });
});
