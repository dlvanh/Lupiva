/**
 * Patient registration requires a phone OTP unless the build sets
 * `NEXT_PUBLIC_OTP_REQUIRED=false` (test-only pilot without an SMS provider).
 */
export function isOtpRequired(): boolean {
  return process.env.NEXT_PUBLIC_OTP_REQUIRED !== "false";
}
