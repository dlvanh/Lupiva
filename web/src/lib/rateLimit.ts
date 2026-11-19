import { eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { authRateLimits } from "@/db/schema";

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export const REGISTER_MAX_ATTEMPTS = 10;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;
export const REGISTER_LOCKOUT_MS = 30 * 60 * 1000;

export const OTP_SEND_MAX_ATTEMPTS = 5;
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
export const OTP_SEND_LOCKOUT_MS = 15 * 60 * 1000;

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export function buildLoginRateLimitKey(
  ipAddress: string,
  identifierBlindIndex: string
): string {
  return `login:${ipAddress}:${identifierBlindIndex.slice(0, 24)}`;
}

export function buildRegisterRateLimitKey(ipAddress: string): string {
  return `register:${ipAddress}`;
}

export function buildOtpSendRateLimitKey(
  ipAddress: string,
  phoneBlindIndex: string
): string {
  return `otp:${ipAddress}:${phoneBlindIndex.slice(0, 24)}`;
}

export async function checkRateLimit(
  key: string,
  options: { maxAttempts?: number; windowMs?: number } = {},
  db: DatabaseClient = getDb(),
  now: Date = new Date()
): Promise<RateLimitStatus> {
  const maxAttempts = options.maxAttempts ?? LOGIN_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;

  const [existing] = await db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, key))
    .limit(1);

  if (!existing) {
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }

  if (existing.lockedUntil && existing.lockedUntil.getTime() > now.getTime()) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 1000)
    );
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  const windowExpired =
    existing.windowStart.getTime() + windowMs <= now.getTime();
  if (windowExpired) {
    await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }

  const remainingAttempts = Math.max(0, maxAttempts - existing.attemptCount);
  return {
    allowed: remainingAttempts > 0,
    remainingAttempts,
    retryAfterSeconds: 0,
  };
}

export async function recordRateLimitFailure(
  key: string,
  options: {
    maxAttempts?: number;
    windowMs?: number;
    lockoutMs?: number;
  } = {},
  db: DatabaseClient = getDb(),
  now: Date = new Date()
): Promise<RateLimitStatus> {
  const maxAttempts = options.maxAttempts ?? LOGIN_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;
  const lockoutMs = options.lockoutMs ?? LOGIN_LOCKOUT_MS;

  const [existing] = await db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, key))
    .limit(1);

  const windowExpired =
    !existing || existing.windowStart.getTime() + windowMs <= now.getTime();

  const nextCount = windowExpired ? 1 : existing.attemptCount + 1;
  const nextWindowStart = windowExpired ? now : existing.windowStart;
  const shouldLock = nextCount >= maxAttempts;
  const nextLockedUntil = shouldLock
    ? new Date(now.getTime() + lockoutMs)
    : null;

  await db
    .insert(authRateLimits)
    .values({
      key,
      attemptCount: nextCount,
      windowStart: nextWindowStart,
      lockedUntil: nextLockedUntil,
    })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        attemptCount: nextCount,
        windowStart: nextWindowStart,
        lockedUntil: nextLockedUntil,
      },
    });

  const retryAfterSeconds = nextLockedUntil
    ? Math.max(1, Math.ceil((nextLockedUntil.getTime() - now.getTime()) / 1000))
    : 0;

  return {
    allowed: !shouldLock,
    remainingAttempts: Math.max(0, maxAttempts - nextCount),
    retryAfterSeconds,
  };
}

export async function clearRateLimit(
  key: string,
  db: DatabaseClient = getDb()
): Promise<void> {
  await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
}
