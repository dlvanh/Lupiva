import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CryptoConfigurationError,
  CryptoDecryptionError,
  assertCryptoConfig,
  computeBlindIndex,
  decryptBufferWithDek,
  decryptField,
  encryptBufferWithDek,
  encryptField,
  generateDocumentDek,
  isEncryptedEnvelope,
  normalizeEmail,
  normalizeStudyId,
  timingSafeStringEqual,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto";

const TEST_MASTER_KEY = "a1".repeat(32);
const TEST_BLIND_KEY = "b2".repeat(32);
const TEST_AUTH_SECRET = "c3".repeat(32);

describe("Lupiva AES-256-GCM & Blind Index Cryptography", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    process.env.BLIND_INDEX_KEY = TEST_BLIND_KEY;
    process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("enforces presence, format, placeholder rejection, and strict key separation", () => {
    expect(() => assertCryptoConfig()).not.toThrow();

    process.env.ENCRYPTION_MASTER_KEY = "";
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigurationError);

    process.env.ENCRYPTION_MASTER_KEY = "<replace-with-64-hex-chars-from-openssl-rand>";
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigurationError);

    process.env.ENCRYPTION_MASTER_KEY = "short-key";
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigurationError);

    // Key reuse between KEK and Blind Index key must fail closed
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    process.env.BLIND_INDEX_KEY = TEST_MASTER_KEY;
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigurationError);

    // Key reuse with AUTH_SECRET must fail closed
    process.env.BLIND_INDEX_KEY = TEST_BLIND_KEY;
    process.env.AUTH_SECRET = TEST_MASTER_KEY;
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigurationError);
  });

  it("encrypts and decrypts UTF-8 Vietnamese strings with random IVs and AAD binding", () => {
    const aad = "users:user-001:full_name";
    const plaintext = "Trần Thị Mai — Mã ĐK #VN-0084-26";

    const env1 = encryptField(plaintext, aad);
    const env2 = encryptField(plaintext, aad);

    expect(isEncryptedEnvelope(env1)).toBe(true);
    expect(isEncryptedEnvelope(env2)).toBe(true);
    expect(env1).not.toBe(env2);
    expect(env1.startsWith("v1:k1:")).toBe(true);

    expect(decryptField(env1, aad)).toBe(plaintext);
    expect(decryptField(env2, aad)).toBe(plaintext);
  });

  it("rejects row/column ciphertext swapping via AAD mismatch and detects tampering", () => {
    const aadRow1 = "users:user-1:email";
    const aadRow2 = "users:user-2:email";
    const aadOtherCol = "users:user-1:full_name";

    const envelope = encryptField("patient@vinmec.com", aadRow1);

    expect(() => decryptField(envelope, aadRow2)).toThrow(CryptoDecryptionError);
    expect(() => decryptField(envelope, aadOtherCol)).toThrow(
      CryptoDecryptionError
    );

    const parts = envelope.split(":");
    const tamperedCipher = Buffer.from(parts[4], "base64");
    tamperedCipher[0] ^= 0xff;
    parts[4] = tamperedCipher.toString("base64");
    expect(() => decryptField(parts.join(":"), aadRow1)).toThrow(
      CryptoDecryptionError
    );

    expect(() => decryptField("not-an-envelope", aadRow1)).toThrow(
      CryptoDecryptionError
    );
  });

  it("computes deterministic, domain-separated HMAC-SHA256 blind indexes", () => {
    const emailNorm = normalizeEmail("  Dr.Minh.Immunology@Vinmec.COM ");
    expect(emailNorm).toBe("dr.minh.immunology@vinmec.com");

    const studyNorm = normalizeStudyId("  vn-0084-26 ");
    expect(studyNorm).toBe("VN-0084-26");

    const idxEmail1 = computeBlindIndex(emailNorm, "email");
    const idxEmail2 = computeBlindIndex(
      normalizeEmail("dr.minh.immunology@vinmec.com"),
      "email"
    );
    const idxDefaultNamespace = computeBlindIndex(emailNorm, "default");

    expect(idxEmail1).toMatch(/^[0-9a-f]{64}$/);
    expect(idxEmail1).toBe(idxEmail2);
    expect(idxEmail1).not.toBe(idxDefaultNamespace);
    expect(computeBlindIndex("VN-0084-26", "study_id")).not.toBe(
      computeBlindIndex("VN-0084-26", "email")
    );
  });

  it("wraps/unwraps per-document DEKs and encrypts/decrypts binary file buffers cleanly", () => {
    const documentId = "doc-uuid-9001";
    const wrongDocId = "doc-uuid-9002";
    const dek = generateDocumentDek();
    const wrappedDek = wrapDek(dek, documentId);

    const unwrapped = unwrapDek(wrappedDek, documentId);
    expect(crypto.timingSafeEqual(unwrapped, dek)).toBe(true);
    expect(() => unwrapDek(wrappedDek, wrongDocId)).toThrow(
      CryptoDecryptionError
    );

    const samplePdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Title (Lab) >>", "utf8");
    const encryptedBlob = encryptBufferWithDek(samplePdfBytes, dek, documentId);

    expect(encryptedBlob.ciphertext.equals(samplePdfBytes)).toBe(false);
    const decryptedBlob = decryptBufferWithDek(
      encryptedBlob.ciphertext,
      unwrapped,
      encryptedBlob.ivBase64,
      encryptedBlob.authTagBase64,
      documentId
    );
    expect(decryptedBlob.equals(samplePdfBytes)).toBe(true);

    expect(() =>
      decryptBufferWithDek(
        encryptedBlob.ciphertext,
        unwrapped,
        encryptedBlob.ivBase64,
        encryptedBlob.authTagBase64,
        wrongDocId
      )
    ).toThrow(CryptoDecryptionError);
  });

  it("performs length-safe constant-time string comparisons", () => {
    expect(timingSafeStringEqual("VINMEC-IMMUNO-2026", "VINMEC-IMMUNO-2026")).toBe(true);
    expect(timingSafeStringEqual("VINMEC-IMMUNO-2026", "VINMEC-IMMUNO-2027")).toBe(false);
    expect(timingSafeStringEqual("SHORT", "MUCH-LONGER-STRING")).toBe(false);
  });
});
