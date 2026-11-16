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
import { desc, eq } from "drizzle-orm";

interface StoredCookie {
  value: string;
  options: Record<string, unknown>;
}

const mockState = vi.hoisted(() => ({
  cookieJar: new Map<string, StoredCookie>(),
  requestHeaders: new Map<string, string>(),
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
  headers: async () => new Headers(Array.from(mockState.requestHeaders.entries())),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => undefined,
  };
});

import { DEMO_USERS } from "@/data/mockData";
import { auditLogs, sessions, users } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { AuthError, hashSessionToken, requireAuth } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { decryptField } from "@/lib/crypto";
import { GET as healthGet } from "@/app/api/health/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { proxy } from "@/proxy";
import {
  TEST_SPECIALIST_INVITE_CODE,
  createTestDatabase,
  type TestDatabaseHandle,
} from "./helpers/pgliteTestDb";

function buildJsonRequest(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-For": "10.20.30.40",
      "User-Agent": "Vitest-Auth-Suite/1.0",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

describe("Lupiva Auth, Sessions, RBAC, Rate Limit & Proxy Integration", () => {
  let testDb: TestDatabaseHandle;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    mockState.cookieJar.clear();
    mockState.requestHeaders.clear();
    await testDb.resetTables();
    await seedDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("reports healthy PostgreSQL connectivity via GET /api/health", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; database: string };
    expect(data.ok).toBe(true);
    expect(data.database).toBe("connected");
  });

  it("authenticates seeded specialist, hashes session token in DB, and enforces RBAC", async () => {
    const res = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.specialist.email,
        password: DEMO_USERS.specialist.passwordHint,
        selectedRole: "specialist",
        consentChecked: true,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user.email).toBe(DEMO_USERS.specialist.email);
    expect(body.user.name).toBe(DEMO_USERS.specialist.name);
    expect(body.user.role).toBe("specialist");
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.passwordHint).toBeUndefined();

    // HttpOnly cookie issued cleanly
    const cookie = mockState.cookieJar.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie!.options.httpOnly).toBe(true);
    expect(cookie!.options.sameSite).toBe("lax");

    // DB stores SHA-256 hash, never raw cookie value
    const sessionRows = await testDb.db.select().from(sessions);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].tokenHash).toBe(hashSessionToken(cookie!.value));
    expect(sessionRows[0].tokenHash).not.toBe(cookie!.value);

    // /api/auth/me resolves current authenticated user
    const meRes = await meGet();
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { id: string; role: string } | null };
    expect(meBody.user?.id).toBe(body.user.id);
    expect(meBody.user?.role).toBe("specialist");

    // Server-side RBAC guard accepts specialist and rejects patient-only gates
    const authUser = await requireAuth(["specialist"], testDb.db);
    expect(authUser.role).toBe("specialist");
    await expect(requireAuth(["patient"], testDb.db)).rejects.toMatchObject({
      status: 403,
    });

    // Audit log recorded login success without leaking PII
    const logs = await testDb.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt));
    expect(logs[0].action).toBe("auth.login_success");
    expect(JSON.stringify(logs[0].metadataJson)).not.toContain(
      DEMO_USERS.specialist.email
    );
  });

  it("authenticates seeded patient and enforces patient informed consent", async () => {
    const missingConsentRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.patient.email,
        password: DEMO_USERS.patient.passwordHint,
        selectedRole: "patient",
        consentChecked: false,
      })
    );
    expect(missingConsentRes.status).toBe(400);

    const okRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.patient.email,
        password: DEMO_USERS.patient.passwordHint,
        selectedRole: "patient",
        consentChecked: true,
      })
    );
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as { user: { role: string; name: string } };
    expect(body.user.role).toBe("patient");
    expect(body.user.name).toBe(DEMO_USERS.patient.name);

    await expect(requireAuth(["specialist"], testDb.db)).rejects.toThrow(AuthError);
  });

  it("blocks role-tab mismatch with 403 and rejects invalid/unknown credentials with 401", async () => {
    const mismatchRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.patient.email,
        password: DEMO_USERS.patient.passwordHint,
        selectedRole: "specialist",
        consentChecked: true,
      })
    );
    expect(mismatchRes.status).toBe(403);
    expect(mockState.cookieJar.get(SESSION_COOKIE_NAME)).toBeUndefined();

    const wrongPwdRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.specialist.email,
        password: "WrongPassword#999",
        selectedRole: "specialist",
      })
    );
    expect(wrongPwdRes.status).toBe(401);

    const unknownRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: "nobody@vinmec.com",
        password: "AnyPassword#123",
        selectedRole: "specialist",
      })
    );
    expect(unknownRes.status).toBe(401);

    const auditActions = (await testDb.db.select().from(auditLogs)).map(
      (row) => row.action
    );
    expect(auditActions).toContain("auth.role_mismatch");
    expect(auditActions).toContain("auth.login_failed");
  });

  it("enforces PostgreSQL brute-force rate limit lockout (429 + Retry-After) after 5 failures", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failRes = await loginPost(
        buildJsonRequest("/api/auth/login", {
          email: DEMO_USERS.specialist.email,
          password: `BadPass#${attempt}`,
          selectedRole: "specialist",
        })
      );
      expect(failRes.status).toBe(401);
    }

    // 6th attempt must be rate-limited even with the valid password
    const lockedRes = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.specialist.email,
        password: DEMO_USERS.specialist.passwordHint,
        selectedRole: "specialist",
      })
    );
    expect(lockedRes.status).toBe(429);
    const retryAfter = Number(lockedRes.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);

    const logs = await testDb.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.login_rate_limited"));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks cross-origin mutation requests (CSRF protection)", async () => {
    const evilOriginRes = await loginPost(
      buildJsonRequest(
        "/api/auth/login",
        {
          email: DEMO_USERS.specialist.email,
          password: DEMO_USERS.specialist.passwordHint,
        },
        {
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        }
      )
    );
    expect(evilOriginRes.status).toBe(403);

    const evilRegisterRes = await registerPost(
      buildJsonRequest(
        "/api/auth/register",
        {
          fullName: "Test User",
          email: "csrf@lupiva.vn",
          password: "StrongPassword#1",
          role: "patient",
          consentChecked: true,
        },
        { Origin: "https://attacker.example" }
      )
    );
    expect(evilRegisterRes.status).toBe(403);
  });

  it("revokes session in DB and clears cookie on POST /api/auth/logout", async () => {
    await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: DEMO_USERS.specialist.email,
        password: DEMO_USERS.specialist.passwordHint,
        selectedRole: "specialist",
      })
    );

    expect(mockState.cookieJar.has(SESSION_COOKIE_NAME)).toBe(true);
    expect(await testDb.db.select().from(sessions)).toHaveLength(1);

    const logoutRes = await logoutPost(buildJsonRequest("/api/auth/logout", {}));
    expect(logoutRes.status).toBe(200);
    expect(mockState.cookieJar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await testDb.db.select().from(sessions)).toHaveLength(0);

    const meAfter = await meGet();
    const meData = (await meAfter.json()) as { user: unknown };
    expect(meData.user).toBeNull();
    await expect(requireAuth(undefined, testDb.db)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("supports encrypted patient self-registration and invite-gated specialist registration", async () => {
    // Weak password rejected
    const weakRes = await registerPost(
      buildJsonRequest("/api/auth/register", {
        fullName: "Nguyen Thi Lan",
        email: "lan.patient@lupiva.vn",
        password: "weak",
        role: "patient",
        consentChecked: true,
      })
    );
    expect(weakRes.status).toBe(400);

    // Valid patient signup succeeds with encrypted PII in PostgreSQL
    const regPatientRes = await registerPost(
      buildJsonRequest("/api/auth/register", {
        fullName: "Nguyen Thi Lan",
        email: "Lan.Patient@Lupiva.vn",
        password: "PatientSecure#2026",
        role: "patient",
        consentChecked: true,
      })
    );
    expect(regPatientRes.status).toBe(201);
    const regData = (await regPatientRes.json()) as {
      user: { id: string; email: string; name: string; role: string };
    };
    expect(regData.user.email).toBe("lan.patient@lupiva.vn");
    expect(regData.user.name).toBe("Nguyen Thi Lan");
    expect(regData.user.role).toBe("patient");

    const [storedUser] = await testDb.db
      .select()
      .from(users)
      .where(eq(users.id, regData.user.id));
    expect(storedUser.emailEncrypted).not.toContain("lan.patient@lupiva.vn");
    expect(storedUser.fullNameEncrypted).not.toContain("Nguyen Thi Lan");
    expect(
      decryptField(storedUser.fullNameEncrypted, `users:${storedUser.id}:full_name`)
    ).toBe("Nguyen Thi Lan");

    // Duplicate email rejected cleanly
    const dupRes = await registerPost(
      buildJsonRequest("/api/auth/register", {
        fullName: "Duplicate Lan",
        email: "lan.patient@lupiva.vn",
        password: "PatientSecure#2026",
        role: "patient",
        consentChecked: true,
      })
    );
    expect(dupRes.status).toBe(409);

    // Specialist signup without valid invite code rejected with 403
    const deniedSpecRes = await registerPost(
      buildJsonRequest("/api/auth/register", {
        fullName: "Dr. Hoang Anh",
        email: "hoang.anh@vinmec.com",
        password: "DoctorSecure#2026",
        role: "specialist",
        consentChecked: true,
        inviteCode: "WRONG-INVITE",
      })
    );
    expect(deniedSpecRes.status).toBe(403);

    // Specialist signup with valid SPECIALIST_INVITE_CODE succeeds
    const okSpecRes = await registerPost(
      buildJsonRequest("/api/auth/register", {
        fullName: "Dr. Hoang Anh",
        email: "hoang.anh@vinmec.com",
        password: "DoctorSecure#2026",
        role: "specialist",
        consentChecked: true,
        inviteCode: TEST_SPECIALIST_INVITE_CODE,
      })
    );
    expect(okSpecRes.status).toBe(201);
    const specBody = (await okSpecRes.json()) as { user: { role: string } };
    expect(specBody.user.role).toBe("specialist");

    // Can log out and log right back in with the newly registered specialist
    await logoutPost(buildJsonRequest("/api/auth/logout", {}));
    const reLogin = await loginPost(
      buildJsonRequest("/api/auth/login", {
        email: "hoang.anh@vinmec.com",
        password: "DoctorSecure#2026",
        selectedRole: "specialist",
      })
    );
    expect(reLogin.status).toBe(200);
  });

  it("protects /ocr, /crf, and /scores in Next.js 16 proxy when session cookie is missing", () => {
    const unauthReq = new NextRequest("http://localhost:3000/ocr?tab=1");
    const redirectRes = proxy(unauthReq);
    expect(redirectRes.status).toBe(307);
    const location = redirectRes.headers.get("location");
    expect(location).toBe(
      "http://localhost:3000/login?next=%2Focr%3Ftab%3D1"
    );

    const authReq = new NextRequest("http://localhost:3000/crf", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=opaque-session-token` },
    });
    const nextRes = proxy(authReq);
    expect(nextRes.status).toBe(200);
    expect(nextRes.headers.get("location")).toBeNull();
  });
});
