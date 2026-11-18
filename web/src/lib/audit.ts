import { getDb, type DatabaseClient } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditAction =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.login_rate_limited"
  | "auth.role_mismatch"
  | "auth.logout"
  | "auth.register_success"
  | "auth.register_denied"
  | "auth.register_rate_limited"
  | "submission.created"
  | "submission.updated"
  | "submission.image_stored"
  | "submission.sent_to_pipeline"
  | "submission.pipeline_retried"
  | "submission.opened";

export interface WriteAuditLogInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  targetType: "user" | "session" | "auth_gate" | "crf_submission" | "uploaded_document";
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Must NEVER include plaintext PII (email, fullName, password, studyId, HIV result) */
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  entry: WriteAuditLogInput,
  db: DatabaseClient = getDb()
): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    metadataJson: entry.metadata ?? {},
  });
}
