/**
 * Local envelope-encrypted storage for uploaded source images.
 *
 * Each document gets its own data key, wrapped by the master key and bound to
 * the document id. Only ciphertext is written to UPLOAD_DIR; filenames are
 * document ids, never the patient's original filename.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  decryptBufferWithDek,
  encryptBufferWithDek,
  generateDocumentDek,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const IMAGE_SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/tiff", test: (b) => ["II*\0", "MM\0*"].includes(b.subarray(0, 4).toString("latin1")) },
  { mime: "image/bmp", test: (b) => b.subarray(0, 2).toString("latin1") === "BM" },
];

/** The image type the bytes really are, or null for anything the backend cannot read. */
export function sniffImage(bytes: Buffer): string | null {
  return IMAGE_SIGNATURES.find((signature) => signature.test(bytes))?.mime ?? null;
}

function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads");
}

function blobPath(documentId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(documentId)) throw new Error("Invalid document id.");
  return path.join(uploadDir(), `${documentId}.bin`);
}

export interface StoredBlob {
  storageKey: string;
  wrappedDek: string;
  fileIv: string;
  fileAuthTag: string;
  sha256: string;
  sizeBytes: number;
}

export async function storeDocumentBytes(documentId: string, bytes: Buffer): Promise<StoredBlob> {
  const dek = generateDocumentDek();
  const encrypted = encryptBufferWithDek(bytes, dek, documentId);
  const target = blobPath(documentId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, encrypted.ciphertext, { flag: "w", mode: 0o600 });
  return {
    storageKey: path.basename(target),
    wrappedDek: wrapDek(dek, documentId),
    fileIv: encrypted.ivBase64,
    fileAuthTag: encrypted.authTagBase64,
    sha256: encrypted.sha256,
    sizeBytes: bytes.length,
  };
}

export async function readDocumentBytes(row: {
  id: string;
  wrappedDek: string | null;
  fileIv: string | null;
  fileAuthTag: string | null;
}): Promise<Buffer> {
  if (!row.wrappedDek || !row.fileIv || !row.fileAuthTag) throw new Error("Document has no stored bytes.");
  const ciphertext = await readFile(blobPath(row.id));
  return decryptBufferWithDek(ciphertext, unwrapDek(row.wrappedDek, row.id), row.fileIv, row.fileAuthTag, row.id);
}
