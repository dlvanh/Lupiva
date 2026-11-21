// Shared by the register API and the sign-up form so both enforce the same rule.
export const REGISTER_PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,128}$/;

export function isValidRegisterPassword(password: string): boolean {
  return REGISTER_PASSWORD_REGEX.test(password);
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*-_=+?";
const ALL_CHARSETS = `${UPPER}${LOWER}${DIGITS}${SPECIAL}`;

function secureRandomIndex(max: number): number {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("Cryptographically secure random number generator is unavailable.");
  }
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    cryptoObj.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % max;
    }
  }
}

function pickChar(charset: string): string {
  return charset[secureRandomIndex(charset.length)];
}

/**
 * Generates a strong password guaranteed to satisfy REGISTER_PASSWORD_REGEX
 * using unbiased rejection sampling over crypto.getRandomValues().
 */
export function generateSecurePassword(length = 16): string {
  const safeLength = Math.min(128, Math.max(8, Math.floor(length)));
  const chars = [
    pickChar(UPPER),
    pickChar(LOWER),
    pickChar(DIGITS),
    pickChar(SPECIAL),
  ];
  while (chars.length < safeLength) {
    chars.push(pickChar(ALL_CHARSETS));
  }
  // Fisher-Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureRandomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}
