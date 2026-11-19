import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import {
  createSession,
  extractClientIp,
  extractUserAgent,
  setSessionCookie,
  verifySameOrigin,
  type AuthenticatedUserDTO,
} from "@/lib/auth";
import {
  CryptoConfigurationError,
  computeBlindIndex,
  decryptField,
  normalizeEmail,
} from "@/lib/crypto";
import { getDummyPasswordHash, verifyPassword } from "@/lib/password";
import {
  buildLoginRateLimitKey,
  checkRateLimit,
  clearRateLimit,
  recordRateLimitFailure,
} from "@/lib/rateLimit";

const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(254, "Email address is too long.")
    .email("Please enter a valid email address."),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(256, "Password exceeds maximum length."),
  selectedRole: z.enum(["specialist", "patient"]).optional(),
  consentChecked: z.boolean().optional(),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  const originCheck = verifySameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { error: originCheck.reason || "Forbidden cross-origin request." },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid login payload." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const db = getDb();
  const ipAddress = extractClientIp(request.headers);
  const userAgent = extractUserAgent(request.headers);

  try {
    const normalizedEmail = normalizeEmail(parsed.data.email);
    const emailBlindIndex = computeBlindIndex(normalizedEmail, "email");
    const rateLimitKey = buildLoginRateLimitKey(ipAddress, emailBlindIndex);

    const rateStatus = await checkRateLimit(rateLimitKey, {}, db);
    if (!rateStatus.allowed) {
      await writeAuditLog(
        {
          actorUserId: null,
          actorRole: null,
          action: "auth.login_rate_limited",
          targetType: "auth_gate",
          ipAddress,
          userAgent,
          metadata: { rateLimitKey },
        },
        db
      );

      return NextResponse.json(
        {
          error:
            "Too many failed login attempts. Please wait before trying again.",
          retryAfterSeconds: rateStatus.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(rateStatus.retryAfterSeconds),
          },
        }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailBlindIndex, emailBlindIndex))
      .limit(1);

    if (!user || !user.isActive) {
      // Equalize response timing when user account does not exist
      await verifyPassword(parsed.data.password, getDummyPasswordHash());
      await recordRateLimitFailure(rateLimitKey, {}, db);
      await writeAuditLog(
        {
          actorUserId: null,
          actorRole: null,
          action: "auth.login_failed",
          targetType: "auth_gate",
          ipAddress,
          userAgent,
          metadata: {
            reason: !user ? "account_not_found" : "account_inactive",
          },
        },
        db
      );

      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const validPassword = await verifyPassword(
      parsed.data.password,
      user.passwordHash
    );
    if (!validPassword) {
      await recordRateLimitFailure(rateLimitKey, {}, db);
      await writeAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: "auth.login_failed",
          targetType: "user",
          targetId: user.id,
          ipAddress,
          userAgent,
          metadata: { reason: "invalid_password" },
        },
        db
      );

      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // The account's own role decides; a role tab chosen on the login page is ignored.
    if (
      user.role === "patient" &&
      (parsed.data.consentChecked === false ||
        (!user.consentSigned && parsed.data.consentChecked !== true))
    ) {
      return NextResponse.json(
        {
          error:
            "Informed consent acknowledgment is required for SLE Patient Portal access.",
          consentRequired: true,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let consentSigned = user.consentSigned;
    let consentSignedAt = user.consentSignedAt;
    if (!consentSigned && parsed.data.consentChecked === true) {
      const now = new Date();
      await db
        .update(users)
        .set({
          consentSigned: true,
          consentSignedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));
      consentSigned = true;
      consentSignedAt = now;
    }

    await clearRateLimit(rateLimitKey, db);

    const { sessionId, rawToken, expiresAt } = await createSession(
      user.id,
      { ipAddress, userAgent },
      db
    );
    await setSessionCookie(rawToken, expiresAt, request.headers);

    const email = decryptField(user.emailEncrypted, `users:${user.id}:email`);
    const name = decryptField(
      user.fullNameEncrypted,
      `users:${user.id}:full_name`
    );

    await writeAuditLog(
      {
        actorUserId: user.id,
        actorRole: user.role,
        action: "auth.login_success",
        targetType: "session",
        targetId: sessionId,
        ipAddress,
        userAgent,
        metadata: {
          selectedRole: parsed.data.selectedRole ?? user.role,
        },
      },
      db
    );

    const userDto: AuthenticatedUserDTO = {
      id: user.id,
      name,
      email,
      role: user.role,
      title: user.title,
      departmentOrRegistryId: user.departmentOrRegistryId,
      badgeText: user.badgeText,
      consentSigned,
      consentSignedAt: consentSignedAt ? consentSignedAt.toISOString() : null,
    };

    return NextResponse.json(
      { user: userDto },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof CryptoConfigurationError) {
      console.error("[Lupiva Auth] Security configuration error:", error.message);
      return NextResponse.json(
        {
          error:
            "Server encryption configuration is incomplete. Please contact the system administrator.",
        },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    console.error("[Lupiva Auth] Unexpected login failure:", error);
    return NextResponse.json(
      { error: "Unable to complete sign-in right now. Please try again." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
