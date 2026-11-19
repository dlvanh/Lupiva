import crypto from "node:crypto";
import { computeBlindIndex } from "@/lib/crypto";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(phoneBlindIndex: string, code: string): string {
  return computeBlindIndex(`${phoneBlindIndex}:${code}`, "otp");
}

export interface OtpDeliveryResult {
  delivered: boolean;
  devOtp?: string;
}

/**
 * Sends a 6-digit registration OTP via configured `OTP_WEBHOOK_URL`, or falls
 * back to server-log + devOtp echo when `NEXT_PUBLIC_DEMO_MODE === "true"`.
 */
export async function sendOtpSms(
  normalizedPhone: string,
  code: string
): Promise<OtpDeliveryResult> {
  const webhookUrl = process.env.OTP_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    const token = process.env.OTP_WEBHOOK_TOKEN?.trim();
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        code,
        expiresMinutes: Math.floor(OTP_TTL_SECONDS / 60),
      }),
    });
    if (!res.ok) {
      throw new Error(`OTP webhook responded with status ${res.status}`);
    }
    return { delivered: true };
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    console.info(
      `[Lupiva OTP] Demo verification code for ${normalizedPhone}: ${code}`
    );
    return { delivered: true, devOtp: code };
  }

  return { delivered: false };
}
