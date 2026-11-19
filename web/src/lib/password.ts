import crypto from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scryptAsync(
  password: string,
  salt: string,
  keyLen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Hashes a user password with Node `crypto.scrypt` (`N=16384, r=8, p=1`)
 * and a unique 16-byte random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 1) {
    throw new Error("Password must not be empty.");
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

/**
 * Constant-time password verification against a stored `scrypt$N$r$p$salt$hash` string.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }

    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4];
    const expectedHex = parts[5];

    if (
      !Number.isSafeInteger(n) ||
      !Number.isSafeInteger(r) ||
      !Number.isSafeInteger(p) ||
      n < 1024 ||
      !salt ||
      !/^[0-9a-fA-F]+$/.test(expectedHex)
    ) {
      return false;
    }

    const expectedBuf = Buffer.from(expectedHex, "hex");
    const derived = await scryptAsync(password, salt, expectedBuf.length, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });

    if (derived.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

// Lazily initialized once per process to equalize login timing on nonexistent emails
let cachedDummyHash: string | null = null;

export function getDummyPasswordHash(): string {
  if (!cachedDummyHash) {
    const salt = "00112233445566778899aabbccddeeff";
    const derived = crypto.scryptSync("lupiva-dummy-timing-guard", salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 32 * 1024 * 1024,
    });
    cachedDummyHash = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
  }
  return cachedDummyHash;
}
