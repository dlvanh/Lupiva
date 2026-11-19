/** Records the first time a specialist opens a submission ("Hồ sơ mới" until then). */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { crfSubmissions } from "@/db/schema";
import { AuthError, type AuthenticatedUserDTO } from "@/lib/auth";
import { UploadError } from "@/lib/submissionUploads";

export async function markSubmissionOpened(params: {
  user: AuthenticatedUserDTO;
  submissionId: string;
  db?: DatabaseClient;
}): Promise<{ firstOpenedAt: string; changed: boolean }> {
  if (params.user.role !== "specialist") throw new AuthError(403, "Insufficient role privileges.");
  if (!/^[0-9a-f-]{36}$/i.test(params.submissionId)) throw new UploadError("Hồ sơ không tồn tại.", 404);
  const db = params.db ?? getDb();
  // The IS NULL guard in the write keeps the first opener when two doctors open it at once.
  const [marked] = await db
    .update(crfSubmissions)
    .set({ firstOpenedAt: new Date(), firstOpenedByUserId: params.user.id })
    .where(and(eq(crfSubmissions.id, params.submissionId), isNull(crfSubmissions.firstOpenedAt)))
    .returning({ firstOpenedAt: crfSubmissions.firstOpenedAt });
  if (marked?.firstOpenedAt) return { firstOpenedAt: marked.firstOpenedAt.toISOString(), changed: true };
  const [row] = await db
    .select({ firstOpenedAt: crfSubmissions.firstOpenedAt })
    .from(crfSubmissions)
    .where(eq(crfSubmissions.id, params.submissionId));
  if (!row?.firstOpenedAt) throw new UploadError("Hồ sơ không tồn tại.", 404);
  return { firstOpenedAt: row.firstOpenedAt.toISOString(), changed: false };
}
