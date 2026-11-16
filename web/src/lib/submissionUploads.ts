/**
 * Image uploads for a submission and the hand-off to the Python backend.
 * A patient may only touch their own submission; a specialist any.
 */
import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { crfSubmissions, patientProfiles, uploadedDocuments } from "@/db/schema";
import { AuthError, type AuthenticatedUserDTO } from "@/lib/auth";
import { MAX_IMAGE_BYTES, sniffImage, storeDocumentBytes } from "@/lib/documentVault";

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function accessibleSubmission(db: DatabaseClient, user: AuthenticatedUserDTO, submissionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new UploadError("Hồ sơ không tồn tại.", 404);
  const [row] = await db
    .select({ id: crfSubmissions.id, pipelineStatus: crfSubmissions.pipelineStatus, ownerId: patientProfiles.userId })
    .from(crfSubmissions)
    .innerJoin(patientProfiles, eq(crfSubmissions.patientProfileId, patientProfiles.id))
    .where(eq(crfSubmissions.id, submissionId));
  if (!row) throw new UploadError("Hồ sơ không tồn tại.", 404);
  if (user.role !== "specialist" && row.ownerId !== user.id) throw new AuthError(403, "Insufficient role privileges.");
  return row;
}

/** Store the bytes of one listed document, once, while the submission is unsent. */
export async function storeSubmissionImage(params: {
  user: AuthenticatedUserDTO;
  submissionId: string;
  documentId: string;
  bytes: Buffer;
  db?: DatabaseClient;
}): Promise<{ documentId: string; sha256: string }> {
  const db = params.db ?? getDb();
  const submission = await accessibleSubmission(db, params.user, params.submissionId);
  if (submission.pipelineStatus !== "none") throw new UploadError("Hồ sơ đã được gửi đi xử lý.", 409);
  if (!params.bytes.length || params.bytes.length > MAX_IMAGE_BYTES) throw new UploadError("Mỗi ảnh tối đa 20 MB.", 413);
  const mime = sniffImage(params.bytes);
  if (!mime) throw new UploadError("Chỉ nhận ảnh JPEG, PNG, WebP, TIFF hoặc BMP.", 415);
  if (!/^[0-9a-f-]{36}$/i.test(params.documentId)) throw new UploadError("Tệp không thuộc hồ sơ này.", 404);
  const [document] = await db
    .select()
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.id, params.documentId), eq(uploadedDocuments.submissionId, params.submissionId)));
  if (!document) throw new UploadError("Tệp không thuộc hồ sơ này.", 404);
  if (document.storageProvider === "local") throw new UploadError("Tệp này đã được tải lên.", 409);
  const stored = await storeDocumentBytes(document.id, params.bytes);
  await db
    .update(uploadedDocuments)
    .set({ ...stored, storageProvider: "local", mimeType: mime, isImage: true, ocrJobStatus: "pending" })
    .where(eq(uploadedDocuments.id, document.id));
  return { documentId: document.id, sha256: stored.sha256 };
}

/** Check a submission may be sent: accessible, unsent, with at least one stored image. */
export async function assertSendable(params: { user: AuthenticatedUserDTO; submissionId: string; db?: DatabaseClient }) {
  const db = params.db ?? getDb();
  const submission = await accessibleSubmission(db, params.user, params.submissionId);
  if (submission.pipelineStatus !== "none") throw new UploadError("Hồ sơ đã được gửi đi xử lý.", 409);
  const stored = await db
    .select({ id: uploadedDocuments.id })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.submissionId, params.submissionId), eq(uploadedDocuments.storageProvider, "local")));
  if (!stored.length) throw new UploadError("Chưa có ảnh nào để gửi.", 400);
}

/** Only a specialist may reset a failed hand-off; held submissions stay held. */
export async function resetFailedSubmission(params: { user: AuthenticatedUserDTO; submissionId: string; db?: DatabaseClient }) {
  if (params.user.role !== "specialist") throw new AuthError(403, "Insufficient role privileges.");
  const db = params.db ?? getDb();
  await accessibleSubmission(db, params.user, params.submissionId);
  // Check the state in the write too, so concurrent retries cannot both reset it.
  const reset = await db
    .update(crfSubmissions)
    .set({ pipelineStatus: "none", pipelineError: null })
    .where(and(eq(crfSubmissions.id, params.submissionId), eq(crfSubmissions.pipelineStatus, "failed")))
    .returning({ id: crfSubmissions.id });
  if (!reset.length) throw new UploadError("Chỉ có thể gửi lại hồ sơ bị lỗi.", 409);
}
