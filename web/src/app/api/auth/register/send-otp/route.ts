import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { phoneOtps, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import {
  extractClientIp,
  extractUserAgent,
  verifySameOrigin,
} from "@/lib/auth";
import { CryptoConfigurationError, computeBlindIndex } from "@/lib/crypto";
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  generateOtpCode,
  hashOtpCode,
  sendOtpSms,
} from "@/lib/otp";
import { normalizeVietnamPhone } from "@/lib/phone";
import {
  OTP_SEND_LOCKOUT_MS,
  OTP_SEND_MAX_ATTEMPTS,
  OTP_SEND_WINDOW_MS,
  buildOtpSendRateLimitKey,
  checkRateLimit,
  recordRateLimitFailure,
} from "@/lib/rateLimit";

const sendOtpSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required.").max(32),
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

  const parsed = sendOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid phone number." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const normalizedPhone = normalizeVietnamPhone(parsed.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Please enter a valid Vietnamese mobile phone number." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const db = getDb();
  const ipAddress = extractClientIp(request.headers);
  const userAgent = extractUserAgent(request.headers);

  try {
    const phoneBlindIndex = computeBlindIndex(normalizedPhone, "phone");

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneBlindIndex, phoneBlindIndex))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this phone number already exists." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitKey = buildOtpSendRateLimitKey(ipAddress, phoneBlindIndex);
    const rateStatus = await checkRateLimit(
      rateLimitKey,
      { maxAttempts: OTP_SEND_MAX_ATTEMPTS, windowMs: OTP_SEND_WINDOW_MS },
      db
    );

    if (!rateStatus.allowed) {
      await writeAuditLog(
        {
          actorUserId: null,
          actorRole: null,
          action: "auth.otp_rate_limited",
          targetType: "auth_gate",
          ipAddress,
          userAgent,
          metadata: { rateLimitKey },
        },
        db
      );

      return NextResponse.json(
        {
          error: "Too many OTP requests. Please wait before trying again.",
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

    const now = new Date();
    const [latestOtp] = await db
      .select({ createdAt: phoneOtps.createdAt })
      .from(phoneOtps)
      .where(eq(phoneOtps.phoneBlindIndex, phoneBlindIndex))
      .orderBy(desc(phoneOtps.createdAt))
      .limit(1);

    if (latestOtp) {
      const elapsedSeconds = Math.floor(
        (now.getTime() - latestOtp.createdAt.getTime()) / 1000
      );
      if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
        const retryAfterSeconds = OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
        return NextResponse.json(
          {
            error: `Please wait ${retryAfterSeconds}s before requesting another OTP.`,
            retryAfterSeconds,
          },
          {
            status: 429,
            headers: {
              ...NO_STORE_HEADERS,
              "Retry-After": String(retryAfterSeconds),
            },
          }
        );
      }
    }

    await recordRateLimitFailure(
      rateLimitKey,
      {
        maxAttempts: OTP_SEND_MAX_ATTEMPTS,
        windowMs: OTP_SEND_WINDOW_MS,
        lockoutMs: OTP_SEND_LOCKOUT_MS,
      },
      db,
      now
    );

    // Invalidate any prior active OTP for this phone number before issuing a new one.
    await db
      .update(phoneOtps)
      .set({ consumedAt: now })
      .where(
        and(
          eq(phoneOtps.phoneBlindIndex, phoneBlindIndex),
          isNull(phoneOtps.consumedAt)
        )
      );

    const otpCode = generateOtpCode();
    const codeHash = hashOtpCode(phoneBlindIndex, otpCode);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    const [createdOtp] = await db
      .insert(phoneOtps)
      .values({
        phoneBlindIndex,
        codeHash,
        attempts: 0,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: phoneOtps.id });

    const delivery = await sendOtpSms(normalizedPhone, otpCode);
    if (!delivery.delivered) {
      await db
        .update(phoneOtps)
        .set({ consumedAt: new Date() })
        .where(eq(phoneOtps.id, createdOtp.id));

      return NextResponse.json(
        {
          error:
            "SMS OTP delivery is not configured. Please contact the system administrator.",
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    await writeAuditLog(
      {
        actorUserId: null,
        actorRole: null,
        action: "auth.otp_sent",
        targetType: "auth_gate",
        ipAddress,
        userAgent,
        metadata: { otpId: createdOtp.id },
      },
      db
    );

    return NextResponse.json(
      {
        ok: true,
        expiresInSeconds: OTP_TTL_SECONDS,
        cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        ...(delivery.devOtp ? { devOtp: delivery.devOtp } : {}),
      },
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

    console.error("[Lupiva Auth] Unexpected OTP send failure:", error);
    return NextResponse.json(
      { error: "Unable to send OTP right now. Please try again." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
