import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { UserRole } from "@/data/mockData";
import { getDb, type DatabaseClient } from "@/db";
import { sessions, users } from "@/db/schema";
import { decryptField } from "@/lib/crypto";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/constants";

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };

export interface AuthenticatedUserDTO {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  role: UserRole;
  title: string;
  departmentOrRegistryId: string;
  badgeText: string;
  consentSigned: boolean;
  consentSignedAt: string | null;
}

export function decryptUserContacts(user: {
  id: string;
  emailEncrypted: string | null;
  phoneEncrypted: string | null;
  fullNameEncrypted: string;
}): { name: string; email: string | null; phone: string | null } {
  return {
    name: decryptField(user.fullNameEncrypted, `users:${user.id}:full_name`),
    email: user.emailEncrypted
      ? decryptField(user.emailEncrypted, `users:${user.id}:email`)
      : null,
    phone: user.phoneEncrypted
      ? decryptField(user.phoneEncrypted, `users:${user.id}:phone`)
      : null,
  };
}

export class AuthError extends Error {
  readonly status: 400 | 401 | 403;

  constructor(status: 400 | 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

export function extractUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  if (!ua) return null;
  return ua.slice(0, 512);
}

export function shouldUseSecureCookie(requestHeaders?: Headers): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.NODE_ENV !== "production") return false;

  const proto = requestHeaders?.get("x-forwarded-proto");
  const host = requestHeaders?.get("host") ?? "";
  if (
    proto === "http" ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1")
  ) {
    return false;
  }

  return true;
}

export interface OriginCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates CSRF protection via Sec-Fetch-Site and Origin/Host comparison
 * on state-mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`).
 */
export function verifySameOrigin(request: Request): OriginCheckResult {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return { ok: false, reason: "Cross-site mutation requests are forbidden." };
  }

  const targetHost = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    new URL(request.url).host
  )
    .trim()
    .toLowerCase();

  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin === "null") {
      return { ok: false, reason: "Null Origin header is rejected." };
    }
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost !== targetHost) {
        return { ok: false, reason: "Origin header mismatch." };
      }
    } catch {
      return { ok: false, reason: "Malformed Origin header." };
    }
    return { ok: true };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (refererHost !== targetHost) {
        return { ok: false, reason: "Referer header mismatch." };
      }
    } catch {
      return { ok: false, reason: "Malformed Referer header." };
    }
  }

  return { ok: true };
}

export async function createSession(
  userId: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
  db: DatabaseClient = getDb()
): Promise<{ sessionId: string; rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const [created] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      expiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    })
    .returning({ id: sessions.id });

  return { sessionId: created.id, rawToken, expiresAt };
}

export async function setSessionCookie(
  rawToken: string,
  expiresAt: Date,
  requestHeaders?: Headers
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(requestHeaders),
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionFromToken(
  rawToken: string,
  db: DatabaseClient = getDb()
): Promise<{ sessionId: string; user: AuthenticatedUserDTO } | null> {
  if (!rawToken || !rawToken.trim()) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken.trim());
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      emailEncrypted: users.emailEncrypted,
      phoneEncrypted: users.phoneEncrypted,
      fullNameEncrypted: users.fullNameEncrypted,
      role: users.role,
      title: users.title,
      departmentOrRegistryId: users.departmentOrRegistryId,
      badgeText: users.badgeText,
      consentSigned: users.consentSigned,
      consentSignedAt: users.consentSignedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, now),
        eq(users.isActive, true)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const { name, email, phone } = decryptUserContacts({
    id: row.userId,
    emailEncrypted: row.emailEncrypted,
    phoneEncrypted: row.phoneEncrypted,
    fullNameEncrypted: row.fullNameEncrypted,
  });

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      name,
      email,
      phone,
      role: row.role,
      title: row.title,
      departmentOrRegistryId: row.departmentOrRegistryId,
      badgeText: row.badgeText,
      consentSigned: row.consentSigned,
      consentSignedAt: row.consentSignedAt
        ? row.consentSignedAt.toISOString()
        : null,
    },
  };
}

export async function getSessionUser(
  db?: DatabaseClient
): Promise<{ sessionId: string; user: AuthenticatedUserDTO } | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }
  return getSessionFromToken(rawToken, db ?? getDb());
}

export async function revokeSessionByToken(
  rawToken: string,
  db: DatabaseClient = getDb()
): Promise<boolean> {
  if (!rawToken) return false;
  const tokenHash = hashSessionToken(rawToken);
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id });
  return deleted.length > 0;
}

export async function requireAuth(
  allowedRoles?: UserRole[],
  db?: DatabaseClient
): Promise<AuthenticatedUserDTO> {
  const session = await getSessionUser(db);
  if (!session) {
    throw new AuthError(401, "Authentication required.");
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    throw new AuthError(403, "Insufficient role privileges.");
  }
  return session.user;
}
