import crypto from "node:crypto";

const ENVELOPE_VERSION = "v1";
const CURRENT_KEY_ID = "k1";
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const AES_256_BYTES = 32;

export class CryptoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoConfigurationError";
  }
}

export class CryptoDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoDecryptionError";
  }
}

function parseKey32(rawValue: string | undefined, envName: string): Buffer {
  if (!rawValue || !rawValue.trim()) {
    throw new CryptoConfigurationError(
      `Missing required environment variable "${envName}". Generate one with: openssl rand -hex 32`
    );
  }

  const trimmed = rawValue.trim();
  if (trimmed.includes("<replace-with-")) {
    throw new CryptoConfigurationError(
      `Environment variable "${envName}" still contains the placeholder value from .env.example.`
    );
  }

  let keyBuffer: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    keyBuffer = Buffer.from(trimmed, "hex");
  } else {
    // Support standard or base64url 32-byte keys
    keyBuffer = Buffer.from(trimmed, "base64");
  }

  if (keyBuffer.length !== AES_256_BYTES) {
    throw new CryptoConfigurationError(
      `Environment variable "${envName}" must decode to exactly 32 bytes (64 hex chars or 44-char base64).`
    );
  }

  return keyBuffer;
}

export function getMasterKey(): Buffer {
  const kek = parseKey32(process.env.ENCRYPTION_MASTER_KEY, "ENCRYPTION_MASTER_KEY");
  const blindKey = parseKey32(process.env.BLIND_INDEX_KEY, "BLIND_INDEX_KEY");

  if (crypto.timingSafeEqual(kek, blindKey)) {
    throw new CryptoConfigurationError(
      "Key separation violation: ENCRYPTION_MASTER_KEY and BLIND_INDEX_KEY must be cryptographically distinct."
    );
  }

  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length > 0) {
    const authKey = parseKey32(process.env.AUTH_SECRET, "AUTH_SECRET");
    if (
      crypto.timingSafeEqual(kek, authKey) ||
      crypto.timingSafeEqual(blindKey, authKey)
    ) {
      throw new CryptoConfigurationError(
        "Key separation violation: AUTH_SECRET must differ from ENCRYPTION_MASTER_KEY and BLIND_INDEX_KEY."
      );
    }
  }

  return kek;
}

export function getBlindIndexKey(): Buffer {
  // Ensure full key-separation checks run
  getMasterKey();
  return parseKey32(process.env.BLIND_INDEX_KEY, "BLIND_INDEX_KEY");
}

export function assertCryptoConfig(): void {
  getMasterKey();
  getBlindIndexKey();
}

/**
 * Encrypts a UTF-8 plaintext string using AES-256-GCM with mandatory
 * Additional Authenticated Data (AAD) binding (e.g., `users:<id>:email`)
 * so ciphertext cannot be swapped across database rows or columns.
 */
export function encryptField(plaintext: string, aad: string): string {
  if (!aad || !aad.trim()) {
    throw new Error("encryptField requires a non-empty AAD context string.");
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    CURRENT_KEY_ID,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a versioned field envelope (`v1:k1:<iv>:<tag>:<cipher>`) and verifies
 * both the GCM authentication tag and exact AAD binding.
 */
export function decryptField(envelope: string, aad: string): string {
  if (!aad || !aad.trim()) {
    throw new CryptoDecryptionError("decryptField requires a non-empty AAD context string.");
  }

  const parts = envelope.split(":");
  if (parts.length !== 5) {
    throw new CryptoDecryptionError("Malformed ciphertext envelope format.");
  }

  const [version, keyId, ivB64, tagB64, cipherB64] = parts;
  if (version !== ENVELOPE_VERSION || keyId !== CURRENT_KEY_ID) {
    throw new CryptoDecryptionError(`Unsupported envelope version or key id: ${version}:${keyId}`);
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  if (iv.length !== GCM_IV_BYTES || authTag.length !== GCM_TAG_BYTES) {
    throw new CryptoDecryptionError("Invalid AES-256-GCM IV or authentication tag length.");
  }

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new CryptoDecryptionError("Decryption failed: ciphertext or AAD authentication check failed.");
  }
}

export function isEncryptedEnvelope(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 5) return false;
  const [version, keyId, ivB64, tagB64] = parts;
  if (version !== ENVELOPE_VERSION || !/^k[a-zA-Z0-9_-]+$/.test(keyId)) {
    return false;
  }
  return (
    Buffer.from(ivB64, "base64").length === GCM_IV_BYTES &&
    Buffer.from(tagB64, "base64").length === GCM_TAG_BYTES
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeStudyId(studyId: string): string {
  return studyId.trim().toUpperCase();
}

export type BlindIndexNamespace = "email" | "study_id" | "default";

/**
 * Computes a deterministic, domain-separated HMAC-SHA256 blind index for exact-match
 * database lookups on encrypted columns (`email`, `Study ID`) without plaintext storage.
 */
export function computeBlindIndex(
  normalizedValue: string,
  namespace: BlindIndexNamespace = "default"
): string {
  const blindKey = getBlindIndexKey();
  return crypto
    .createHmac("sha256", blindKey)
    .update(`${namespace}:${normalizedValue}`, "utf8")
    .digest("hex");
}

// =============================================================================
// Phase 2 Envelope Encryption Helpers (Per-File DEK wrapped by KEK)
// =============================================================================

export function generateDocumentDek(): Buffer {
  return crypto.randomBytes(AES_256_BYTES);
}

export function wrapDek(dek: Buffer, documentId: string): string {
  if (dek.length !== AES_256_BYTES) {
    throw new Error("Document DEK must be exactly 32 bytes.");
  }
  return encryptField(dek.toString("base64"), `uploaded_documents:${documentId}:dek`);
}

export function unwrapDek(wrappedDek: string, documentId: string): Buffer {
  const b64 = decryptField(wrappedDek, `uploaded_documents:${documentId}:dek`);
  const dek = Buffer.from(b64, "base64");
  if (dek.length !== AES_256_BYTES) {
    throw new CryptoDecryptionError("Unwrapped DEK has invalid byte length.");
  }
  return dek;
}

export interface EncryptedBlobResult {
  ciphertext: Buffer;
  ivBase64: string;
  authTagBase64: string;
  sha256: string;
}

export function encryptBufferWithDek(
  plaintext: Buffer,
  dek: Buffer,
  documentId: string
): EncryptedBlobResult {
  if (dek.length !== AES_256_BYTES) {
    throw new Error("DEK must be 32 bytes for AES-256-GCM encryption.");
  }
  if (!documentId || !documentId.trim()) {
    throw new Error("documentId is required for blob AAD binding.");
  }

  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(Buffer.from(`uploaded_documents:${documentId}:blob`, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const sha256 = crypto.createHash("sha256").update(plaintext).digest("hex");

  return {
    ciphertext,
    ivBase64: iv.toString("base64"),
    authTagBase64: authTag.toString("base64"),
    sha256,
  };
}

export function decryptBufferWithDek(
  ciphertext: Buffer,
  dek: Buffer,
  ivBase64: string,
  authTagBase64: string,
  documentId: string
): Buffer {
  if (dek.length !== AES_256_BYTES) {
    throw new CryptoDecryptionError("DEK must be 32 bytes.");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  if (iv.length !== GCM_IV_BYTES || authTag.length !== GCM_TAG_BYTES) {
    throw new CryptoDecryptionError("Invalid blob IV or authentication tag length.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAAD(Buffer.from(`uploaded_documents:${documentId}:blob`, "utf8"));
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new CryptoDecryptionError("Blob decryption failed authentication verification.");
  }
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare equal-length dummy buffer to avoid timing leak on unequal length
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
