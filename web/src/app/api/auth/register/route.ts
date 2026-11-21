import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { phoneOtps, users } from "@/db/schema";
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
import { OTP_MAX_VERIFY_ATTEMPTS, hashOtpCode } from "@/lib/otp";
import { isOtpRequired } from "@/lib/otpConfig";
import { hashPassword } from "@/lib/password";
import { normalizeVietnamPhone } from "@/lib/phone";
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
  phone: z.string().trim().max(32).optional(),
  otpCode: z.string().trim().max(12).optional(),
  email: z.string().trim().max(254, "Email address is too long.").optional(),
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

  const data = parsed.data;
  const rawEmail = data.email?.trim() ?? "";
  let normalizedEmail: string | null = null;
  if (rawEmail.length > 0) {
    const emailCheck = z
      .string()
      .email("Please enter a valid email address.")
      .safeParse(rawEmail);
    if (!emailCheck.success) {
      return NextResponse.json(
        { error: emailCheck.error.issues[0]?.message ?? "Invalid email address." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    normalizedEmail = normalizeEmail(rawEmail);
  }

  const rawPhone = data.phone?.trim() ?? "";
  let normalizedPhone: string | null = null;
  if (rawPhone.length > 0) {
    normalizedPhone = normalizeVietnamPhone(rawPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid Vietnamese mobile phone number." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  if (data.role === "patient") {
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Phone number is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (isOtpRequired() && (!data.otpCode || !/^\d{6}$/.test(data.otpCode))) {
      return NextResponse.json(
        { error: "Please enter the 6-digit OTP verification code." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  } else if (!normalizedEmail && !normalizedPhone) {
    return NextResponse.json(
      { error: "Email or phone number is required." },
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

    const phoneBlindIndex = normalizedPhone
      ? computeBlindIndex(normalizedPhone, "phone")
      : null;
    const emailBlindIndex = normalizedEmail
      ? computeBlindIndex(normalizedEmail, "email")
      : null;

    if (phoneBlindIndex) {
      const [existingPhone] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneBlindIndex, phoneBlindIndex))
        .limit(1);

      if (existingPhone) {
        return NextResponse.json(
          { error: "An account with this phone number already exists." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
    }

    if (emailBlindIndex) {
      const [existingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.emailBlindIndex, emailBlindIndex))
        .limit(1);

      if (existingEmail) {
        return NextResponse.json(
          { error: "An account with this email address already exists." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
    }

    const now = new Date();

    // Verify & atomically consume phone OTP for patient self-registration.
    if (
      isOtpRequired() &&
      data.role === "patient" &&
      phoneBlindIndex &&
      data.otpCode
    ) {
      const [otpRow] = await db
        .select()
        .from(phoneOtps)
        .where(
          and(
            eq(phoneOtps.phoneBlindIndex, phoneBlindIndex),
            isNull(phoneOtps.consumedAt)
          )
        )
        .orderBy(desc(phoneOtps.createdAt))
        .limit(1);

      if (!otpRow || otpRow.expiresAt.getTime() <= now.getTime()) {
        return NextResponse.json(
          {
            error:
              "OTP verification code is invalid or expired. Please request a new code.",
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (otpRow.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return NextResponse.json(
          {
            error:
              "Too many incorrect OTP attempts. Please request a new verification code.",
          },
          { status: 429, headers: NO_STORE_HEADERS }
        );
      }

      const providedHash = hashOtpCode(phoneBlindIndex, data.otpCode);
      if (!timingSafeStringEqual(otpRow.codeHash, providedHash)) {
        const nextAttempts = otpRow.attempts + 1;
        await db
          .update(phoneOtps)
          .set({ attempts: nextAttempts })
          .where(eq(phoneOtps.id, otpRow.id));

        return NextResponse.json(
          {
            error:
              nextAttempts >= OTP_MAX_VERIFY_ATTEMPTS
                ? "Too many incorrect OTP attempts. Please request a new verification code."
                : "Incorrect OTP verification code.",
          },
          {
            status: nextAttempts >= OTP_MAX_VERIFY_ATTEMPTS ? 429 : 400,
            headers: NO_STORE_HEADERS,
          }
        );
      }

      const consumed = await db
        .update(phoneOtps)
        .set({ consumedAt: now })
        .where(
          and(eq(phoneOtps.id, otpRow.id), isNull(phoneOtps.consumedAt))
        )
        .returning({ id: phoneOtps.id });

      if (consumed.length === 0) {
        return NextResponse.json(
          { error: "OTP verification code has already been used." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const userId = crypto.randomUUID();
    const emailEncrypted = normalizedEmail
      ? encryptField(normalizedEmail, `users:${userId}:email`)
      : null;
    const phoneEncrypted = normalizedPhone
      ? encryptField(normalizedPhone, `users:${userId}:phone`)
      : null;
    const fullNameEncrypted = encryptField(
      data.fullName,
      `users:${userId}:full_name`
    );
    const passwordHash = await hashPassword(data.password);

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
        phoneEncrypted,
        phoneBlindIndex,
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
      // Handle race condition on email_blind_index or phone_blind_index unique constraint
      const pgCode =
        typeof insertError === "object" &&
        insertError !== null &&
        "code" in insertError
          ? String((insertError as { code: unknown }).code)
          : "";
      if (pgCode === "23505") {
        const constraint =
          typeof insertError === "object" &&
          insertError !== null &&
          "constraint" in insertError
            ? String((insertError as { constraint: unknown }).constraint)
            : "";
        return NextResponse.json(
          {
            error: constraint.includes("email")
              ? "An account with this email address already exists."
              : "An account with this phone number already exists.",
          },
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
      phone: normalizedPhone,
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
