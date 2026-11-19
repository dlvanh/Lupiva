import crypto from "node:crypto";
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
  encryptField,
  normalizeEmail,
  timingSafeStringEqual,
} from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import {
  REGISTER_LOCKOUT_MS,
  REGISTER_MAX_ATTEMPTS,
  REGISTER_WINDOW_MS,
  buildRegisterRateLimitKey,
  checkRateLimit,
  recordRateLimitFailure,
} from "@/lib/rateLimit";

import { REGISTER_PASSWORD_REGEX as PASSWORD_COMPLEXITY_REGEX } from "@/lib/registerPassword";

const registerRequestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(120, "Full name must not exceed 120 characters."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(254, "Email address is too long.")
    .email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must not exceed 128 characters.")
    .regex(
      PASSWORD_COMPLEXITY_REGEX,
      "Password must contain at least 1 letter, 1 number, and 1 special character."
    ),
  role: z.enum(["patient", "specialist"]).default("patient"),
  consentChecked: z
    .boolean()
    .refine((checked) => checked === true, {
      message:
        "Informed consent / HITL clinical governance acknowledgment is required.",
    }),
  inviteCode: z.string().trim().optional(),
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

  const parsed = registerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid registration details.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const db = getDb();
  const ipAddress = extractClientIp(request.headers);
  const userAgent = extractUserAgent(request.headers);

  try {
    const rateLimitKey = buildRegisterRateLimitKey(ipAddress);
    const rateStatus = await checkRateLimit(
      rateLimitKey,
      { maxAttempts: REGISTER_MAX_ATTEMPTS, windowMs: REGISTER_WINDOW_MS },
      db
    );

    if (!rateStatus.allowed) {
      await writeAuditLog(
        {
          actorUserId: null,
          actorRole: null,
          action: "auth.register_rate_limited",
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
            "Too many account registration attempts from this network. Please try again later.",
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

    await recordRateLimitFailure(
      rateLimitKey,
      {
        maxAttempts: REGISTER_MAX_ATTEMPTS,
        windowMs: REGISTER_WINDOW_MS,
        lockoutMs: REGISTER_LOCKOUT_MS,
      },
      db
    );

    const data = parsed.data;

    // Gate specialist account creation behind server-side SPECIALIST_INVITE_CODE
    if (data.role === "specialist") {
      const expectedInviteCode = process.env.SPECIALIST_INVITE_CODE?.trim();
      const suppliedInviteCode = data.inviteCode?.trim() ?? "";

      if (
        !expectedInviteCode ||
        !suppliedInviteCode ||
        !timingSafeStringEqual(suppliedInviteCode, expectedInviteCode)
      ) {
        await writeAuditLog(
          {
            actorUserId: null,
            actorRole: null,
            action: "auth.register_denied",
            targetType: "auth_gate",
            ipAddress,
            userAgent,
            metadata: {
              requestedRole: "specialist",
              reason: expectedInviteCode
                ? "invalid_invite_code"
                : "specialist_invite_disabled",
            },
          },
          db
        );

        return NextResponse.json(
          {
            error:
              "A valid institutional specialist invite code is required to register as a Clinical Specialist.",
          },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    const normalizedEmail = normalizeEmail(data.email);
    const emailBlindIndex = computeBlindIndex(normalizedEmail, "email");

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailBlindIndex, emailBlindIndex))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email address already exists." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const userId = crypto.randomUUID();
    const emailEncrypted = encryptField(
      normalizedEmail,
      `users:${userId}:email`
    );
    const fullNameEncrypted = encryptField(
      data.fullName,
      `users:${userId}:full_name`
    );
    const passwordHash = await hashPassword(data.password);
    const now = new Date();

    const title =
      data.role === "specialist"
        ? "Clinical Specialist"
        : "Registered Patient";
    const departmentOrRegistryId = "";
    const badgeText = data.role === "specialist" ? "Specialist" : "Patient";

    try {
      await db.insert(users).values({
        id: userId,
        emailEncrypted,
        emailBlindIndex,
        fullNameEncrypted,
        passwordHash,
        role: data.role,
        title,
        departmentOrRegistryId,
        badgeText,
        consentSigned: true,
        consentSignedAt: now,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch (insertError) {
      // Handle race condition on email_blind_index unique constraint
      const pgCode =
        typeof insertError === "object" &&
        insertError !== null &&
        "code" in insertError
          ? String((insertError as { code: unknown }).code)
          : "";
      if (pgCode === "23505") {
        return NextResponse.json(
          { error: "An account with this email address already exists." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      throw insertError;
    }

    const { sessionId, rawToken, expiresAt } = await createSession(
      userId,
      { ipAddress, userAgent },
      db
    );
    await setSessionCookie(rawToken, expiresAt, request.headers);

    await writeAuditLog(
      {
        actorUserId: userId,
        actorRole: data.role,
        action: "auth.register_success",
        targetType: "user",
        targetId: userId,
        ipAddress,
        userAgent,
        metadata: { sessionId, role: data.role },
      },
      db
    );

    const userDto: AuthenticatedUserDTO = {
      id: userId,
      name: data.fullName,
      email: normalizedEmail,
      role: data.role,
      title,
      departmentOrRegistryId,
      badgeText,
      consentSigned: true,
      consentSignedAt: now.toISOString(),
    };

    return NextResponse.json(
      { user: userDto },
      { status: 201, headers: NO_STORE_HEADERS }
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

    console.error("[Lupiva Auth] Unexpected registration failure:", error);
    return NextResponse.json(
      { error: "Unable to create account right now. Please try again." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
