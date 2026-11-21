import crypto from "node:crypto";
import { and, count, desc, eq, gte, gt, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { UserRole } from "@/data/mockData";
import { getDb, type DatabaseClient } from "@/db";
import {
  auditLogs,
  authRateLimits,
  crfSubmissions,
  patientProfiles,
  sessions,
  uploadedDocuments,
  users,
  type PipelineStatus,
} from "@/db/schema";
import { writeAuditLog, type AuditAction } from "@/lib/audit";
import { decryptUserContacts } from "@/lib/auth";
import {
  assertCryptoConfig,
  computeBlindIndex,
  decryptField,
  encryptField,
  normalizeEmail,
} from "@/lib/crypto";
import { refreshPipelineStatuses, startSubmissionPipeline } from "@/lib/intakeOrchestrator";
import { hashPassword } from "@/lib/password";
import { normalizeVietnamPhone } from "@/lib/phone";
import { PIPELINE_URL } from "@/lib/pipeline";
import { REGISTER_PASSWORD_REGEX } from "@/lib/registerPassword";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 500 | 502;

  constructor(status: 400 | 403 | 404 | 409 | 500 | 502, message: string) {
    super(message);
    this.name = "AdminError";
    this.status = status;
  }
}

export interface AdminRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AdminActor {
  id: string;
  role: UserRole;
  name: string;
  sessionId?: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

function buildPagination(page: number, pageSize: number, totalItems: number): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}

function assertValidUuid(id: string, label = "Record"): void {
  if (!UUID_RE.test(id)) {
    throw new AdminError(400, `Invalid ${label.toLowerCase()} identifier.`);
  }
}

// -----------------------------------------------------------------------------
// 1. Account Management
// -----------------------------------------------------------------------------

export const adminAccountsQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  role: z.enum(["all", "patient", "specialist", "admin"]).optional().default("all"),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type AdminAccountsQuery = z.infer<typeof adminAccountsQuerySchema>;

export const adminCreateAccountSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters.").max(120),
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(32).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must not exceed 128 characters.")
      .regex(
        REGISTER_PASSWORD_REGEX,
        "Password must contain at least 1 letter, 1 number, and 1 special character."
      ),
    role: z.enum(["patient", "specialist", "admin"]),
    title: z.string().trim().max(160).optional(),
    departmentOrRegistryId: z.string().trim().max(160).optional(),
  })
  .refine((d) => Boolean((d.email && d.email.length > 0) || (d.phone && d.phone.length > 0)), {
    message: "Email or phone number is required.",
  });

export type AdminCreateAccountInput = z.infer<typeof adminCreateAccountSchema>;

export const adminUpdateAccountSchema = z
  .object({
    role: z.enum(["patient", "specialist", "admin"]).optional(),
    isActive: z.boolean().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    departmentOrRegistryId: z.string().trim().max(160).optional(),
    revokeSessions: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.role !== undefined ||
      d.isActive !== undefined ||
      d.title !== undefined ||
      d.departmentOrRegistryId !== undefined ||
      d.revokeSessions === true,
    { message: "At least one account change is required." }
  );

export type AdminUpdateAccountInput = z.infer<typeof adminUpdateAccountSchema>;

export interface AdminAccountDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  title: string;
  departmentOrRegistryId: string;
  badgeText: string;
  isActive: boolean;
  consentSigned: boolean;
  consentSignedAt: string | null;
  activeSessionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccountsSummary {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<UserRole, number>;
}

export interface AdminAccountsResult {
  items: AdminAccountDTO[];
  summary: AdminAccountsSummary;
  pagination: PaginationInfo;
}

function defaultAccountLabels(role: UserRole): { title: string; badgeText: string } {
  if (role === "admin") {
    return { title: "Platform & Security Administrator", badgeText: "System Admin" };
  }
  if (role === "specialist") {
    return { title: "Clinical Specialist", badgeText: "Specialist" };
  }
  return { title: "Registered Patient", badgeText: "Patient" };
}

export async function listAdminAccounts(
  rawQuery: Partial<AdminAccountsQuery> = {},
  db: DatabaseClient = getDb()
): Promise<AdminAccountsResult> {
  const query = adminAccountsQuerySchema.parse(rawQuery);
  const now = new Date();

  const allRows = await db
    .select({
      id: users.id,
      emailEncrypted: users.emailEncrypted,
      phoneEncrypted: users.phoneEncrypted,
      fullNameEncrypted: users.fullNameEncrypted,
      role: users.role,
      title: users.title,
      departmentOrRegistryId: users.departmentOrRegistryId,
      badgeText: users.badgeText,
      isActive: users.isActive,
      consentSigned: users.consentSigned,
      consentSignedAt: users.consentSignedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const sessionCountsRaw = await db
    .select({
      userId: sessions.userId,
      activeCount: count(),
    })
    .from(sessions)
    .where(gt(sessions.expiresAt, now))
    .groupBy(sessions.userId);

  const sessionMap = new Map<string, number>(
    sessionCountsRaw.map((row) => [row.userId, Number(row.activeCount)])
  );

  const summary: AdminAccountsSummary = {
    total: allRows.length,
    active: 0,
    inactive: 0,
    byRole: { patient: 0, specialist: 0, admin: 0 },
  };

  const hydrated: AdminAccountDTO[] = allRows.map((row) => {
    if (row.isActive) summary.active += 1;
    else summary.inactive += 1;
    summary.byRole[row.role] = (summary.byRole[row.role] ?? 0) + 1;

    const contacts = decryptUserContacts({
      id: row.id,
      emailEncrypted: row.emailEncrypted,
      phoneEncrypted: row.phoneEncrypted,
      fullNameEncrypted: row.fullNameEncrypted,
    });

    return {
      id: row.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: row.role,
      title: row.title,
      departmentOrRegistryId: row.departmentOrRegistryId,
      badgeText: row.badgeText,
      isActive: row.isActive,
      consentSigned: row.consentSigned,
      consentSignedAt: row.consentSignedAt ? row.consentSignedAt.toISOString() : null,
      activeSessionCount: sessionMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const searchLower = query.q.toLowerCase();
  const filtered = hydrated.filter((item) => {
    if (query.role !== "all" && item.role !== query.role) return false;
    if (query.status === "active" && !item.isActive) return false;
    if (query.status === "inactive" && item.isActive) return false;
    if (!searchLower) return true;
    const haystack = [
      item.id,
      item.name,
      item.email ?? "",
      item.phone ?? "",
      item.title,
      item.departmentOrRegistryId,
      item.role,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });

  const pagination = buildPagination(query.page, query.pageSize, filtered.length);
  const start = (pagination.page - 1) * pagination.pageSize;
  const items = filtered.slice(start, start + pagination.pageSize);

  return { items, summary, pagination };
}

export async function createAdminAccount(
  rawInput: AdminCreateAccountInput,
  actor: AdminActor,
  context: AdminRequestContext = {},
  db: DatabaseClient = getDb()
): Promise<AdminAccountDTO> {
  const input = adminCreateAccountSchema.parse(rawInput);

  let normalizedEmail: string | null = null;
  if (input.email && input.email.trim().length > 0) {
    const emailParsed = z.string().email("Invalid email address.").safeParse(input.email.trim());
    if (!emailParsed.success) {
      throw new AdminError(400, emailParsed.error.issues[0]?.message ?? "Invalid email address.");
    }
    normalizedEmail = normalizeEmail(emailParsed.data);
  }

  let normalizedPhone: string | null = null;
  if (input.phone && input.phone.trim().length > 0) {
    normalizedPhone = normalizeVietnamPhone(input.phone.trim());
    if (!normalizedPhone) {
      throw new AdminError(400, "Please enter a valid Vietnamese mobile phone number.");
    }
  }

  const emailBlindIndex = normalizedEmail ? computeBlindIndex(normalizedEmail, "email") : null;
  const phoneBlindIndex = normalizedPhone ? computeBlindIndex(normalizedPhone, "phone") : null;

  if (emailBlindIndex) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailBlindIndex, emailBlindIndex))
      .limit(1);
    if (existing) {
      throw new AdminError(409, "An account with this email address already exists.");
    }
  }

  if (phoneBlindIndex) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneBlindIndex, phoneBlindIndex))
      .limit(1);
    if (existing) {
      throw new AdminError(409, "An account with this phone number already exists.");
    }
  }

  const userId = crypto.randomUUID();
  const now = new Date();
  const defaults = defaultAccountLabels(input.role);
  const title = input.title?.trim() || defaults.title;
  const departmentOrRegistryId = input.departmentOrRegistryId?.trim() ?? "";
  const badgeText = defaults.badgeText;

  const emailEncrypted = normalizedEmail ? encryptField(normalizedEmail, `users:${userId}:email`) : null;
  const phoneEncrypted = normalizedPhone ? encryptField(normalizedPhone, `users:${userId}:phone`) : null;
  const fullNameEncrypted = encryptField(input.fullName, `users:${userId}:full_name`);
  const passwordHash = await hashPassword(input.password);

  try {
    await db.insert(users).values({
      id: userId,
      emailEncrypted,
      emailBlindIndex,
      phoneEncrypted,
      phoneBlindIndex,
      fullNameEncrypted,
      passwordHash,
      role: input.role,
      title,
      departmentOrRegistryId,
      badgeText,
      consentSigned: true,
      consentSignedAt: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (insertError) {
    const errObj = insertError as { code?: unknown; cause?: { code?: unknown; constraint?: unknown }; constraint?: unknown } | null;
    const pgCode = String(errObj?.code ?? errObj?.cause?.code ?? "");
    if (pgCode === "23505") {
      const constraint = String(errObj?.constraint ?? errObj?.cause?.constraint ?? "");
      throw new AdminError(
        409,
        constraint.includes("phone")
          ? "An account with this phone number already exists."
          : "An account with this email address already exists."
      );
    }
    throw insertError;
  }

  await writeAuditLog(
    {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "admin.account_created",
      targetType: "user",
      targetId: userId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: {
        createdRole: input.role,
        hasEmail: Boolean(normalizedEmail),
        hasPhone: Boolean(normalizedPhone),
      },
    },
    db
  );

  return {
    id: userId,
    name: input.fullName,
    email: normalizedEmail,
    phone: normalizedPhone,
    role: input.role,
    title,
    departmentOrRegistryId,
    badgeText,
    isActive: true,
    consentSigned: true,
    consentSignedAt: now.toISOString(),
    activeSessionCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function updateAdminAccount(
  targetUserId: string,
  rawPatch: AdminUpdateAccountInput,
  actor: AdminActor,
  context: AdminRequestContext = {},
  db: DatabaseClient = getDb()
): Promise<{ account: AdminAccountDTO; sessionsRevoked: number }> {
  assertValidUuid(targetUserId, "User");
  const patch = adminUpdateAccountSchema.parse(rawPatch);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!existing) {
      throw new AdminError(404, "User account not found.");
    }

    if (targetUserId === actor.id) {
      if (patch.isActive === false) {
        throw new AdminError(409, "Administrators cannot deactivate their own active account.");
      }
      if (patch.role && patch.role !== "admin") {
        throw new AdminError(409, "Administrators cannot demote their own role.");
      }
      if (patch.revokeSessions === true && !actor.sessionId) {
        throw new AdminError(409, "Administrators cannot revoke their own active session.");
      }
    }

    const nextRole = patch.role ?? existing.role;
    const nextIsActive = patch.isActive ?? existing.isActive;
    const leavingActiveAdminPool =
      existing.role === "admin" && existing.isActive && (nextRole !== "admin" || !nextIsActive);

    if (leavingActiveAdminPool) {
      const [{ activeAdmins }] = await tx
        .select({ activeAdmins: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
      if (Number(activeAdmins) <= 1) {
        throw new AdminError(409, "At least one active administrator account must remain.");
      }
    }

    const now = new Date();
    const nextBadgeText =
      patch.role && patch.role !== existing.role
        ? defaultAccountLabels(patch.role).badgeText
        : existing.badgeText;

    const [updated] = await tx
      .update(users)
      .set({
        role: nextRole,
        isActive: nextIsActive,
        title: patch.title ?? existing.title,
        departmentOrRegistryId: patch.departmentOrRegistryId ?? existing.departmentOrRegistryId,
        badgeText: nextBadgeText,
        updatedAt: now,
      })
      .where(eq(users.id, targetUserId))
      .returning();

    const shouldRevokeSessions =
      patch.revokeSessions === true ||
      nextIsActive === false ||
      (patch.role !== undefined && patch.role !== existing.role);

    let sessionsRevoked = 0;
    if (shouldRevokeSessions) {
      const revokeCondition =
        targetUserId === actor.id && actor.sessionId
          ? and(eq(sessions.userId, targetUserId), ne(sessions.id, actor.sessionId))
          : eq(sessions.userId, targetUserId);
      const deleted = await tx
        .delete(sessions)
        .where(revokeCondition)
        .returning({ id: sessions.id });
      sessionsRevoked = deleted.length;
    }

    const changedFields: string[] = [];
    if (patch.role !== undefined && patch.role !== existing.role) changedFields.push("role");
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) changedFields.push("isActive");
    if (patch.title !== undefined && patch.title !== existing.title) changedFields.push("title");
    if (
      patch.departmentOrRegistryId !== undefined &&
      patch.departmentOrRegistryId !== existing.departmentOrRegistryId
    ) {
      changedFields.push("departmentOrRegistryId");
    }

    const action: AuditAction =
      changedFields.length === 0 && patch.revokeSessions ? "admin.sessions_revoked" : "admin.account_updated";

    await writeAuditLog(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        action,
        targetType: "user",
        targetId: targetUserId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: {
          changedFields,
          previousRole: existing.role,
          nextRole: updated.role,
          previousIsActive: existing.isActive,
          nextIsActive: updated.isActive,
          sessionsRevoked,
        },
      },
      tx as unknown as DatabaseClient
    );

    const [{ activeCount }] = await tx
      .select({ activeCount: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, targetUserId), gt(sessions.expiresAt, now)));

    const contacts = decryptUserContacts({
      id: updated.id,
      emailEncrypted: updated.emailEncrypted,
      phoneEncrypted: updated.phoneEncrypted,
      fullNameEncrypted: updated.fullNameEncrypted,
    });

    return {
      account: {
        id: updated.id,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        role: updated.role,
        title: updated.title,
        departmentOrRegistryId: updated.departmentOrRegistryId,
        badgeText: updated.badgeText,
        isActive: updated.isActive,
        consentSigned: updated.consentSigned,
        consentSignedAt: updated.consentSignedAt ? updated.consentSignedAt.toISOString() : null,
        activeSessionCount: Number(activeCount),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      sessionsRevoked,
    };
  });
}

// -----------------------------------------------------------------------------
// 2. System Health & Telemetry Overview
// -----------------------------------------------------------------------------

export interface PipelineProbeResult {
  status: "online" | "degraded" | "offline";
  latencyMs: number | null;
  httpStatus: number | null;
  caseCount: number | null;
}

export type PipelineProber = () => Promise<PipelineProbeResult>;

export async function defaultPipelineProbe(): Promise<PipelineProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${PIPELINE_URL}/api/summary`, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        status: "degraded",
        latencyMs,
        httpStatus: res.status,
        caseCount: null,
      };
    }
    const data = (await res.json().catch(() => null)) as { cases?: unknown[] } | null;
    return {
      status: "online",
      latencyMs,
      httpStatus: res.status,
      caseCount: Array.isArray(data?.cases) ? data.cases.length : null,
    };
  } catch {
    return {
      status: "offline",
      latencyMs: null,
      httpStatus: null,
      caseCount: null,
    };
  }
}

export interface AdminTelemetryDTO {
  timestamp: string;
  overallStatus: "healthy" | "degraded";
  services: {
    database: {
      status: "connected" | "unavailable";
      latencyMs: number;
    };
    pipelineBackend: PipelineProbeResult;
    encryptionVault: {
      configured: boolean;
    };
  };
  securityPosture: {
    demoModeEnabled: boolean;
    specialistInviteConfigured: boolean;
    pipelineEngine: string;
    cookieSecureMode: string;
    activeSessions: number;
    activeRateLimitLockouts: number;
    securityAlerts24h: number;
    loginFailures24h: number;
  };
  metrics: {
    users: {
      total: number;
      active: number;
      patient: number;
      specialist: number;
      admin: number;
    };
    clinical: {
      patientProfiles: number;
      submissionsTotal: number;
      submissionsApproved: number;
      submissionsPendingReview: number;
      submissionsUnopened: number;
    };
    pipelineBreakdown: Record<PipelineStatus, number>;
    documents: {
      total: number;
      totalBytes: number;
      pendingOcr: number;
      completedOcr: number;
      failedOcr: number;
    };
    auditLogsTotal: number;
  };
  runtime: {
    nodeVersion: string;
    uptimeSeconds: number;
    memoryMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
}

const SECURITY_ALERT_ACTIONS: AuditAction[] = [
  "auth.login_failed",
  "auth.login_rate_limited",
  "auth.role_mismatch",
  "auth.register_denied",
  "auth.register_rate_limited",
  "auth.otp_rate_limited",
];

export async function getAdminTelemetry({
  db = getDb(),
  probePipeline = defaultPipelineProbe,
}: {
  db?: DatabaseClient;
  probePipeline?: PipelineProber;
} = {}): Promise<AdminTelemetryDTO> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const dbStart = Date.now();
  await db.execute(sql`SELECT 1`);
  const dbLatencyMs = Date.now() - dbStart;

  let encryptionConfigured = false;
  try {
    assertCryptoConfig();
    encryptionConfigured = true;
  } catch {
    encryptionConfigured = false;
  }

  const [
    pipelineProbe,
    userRoleCounts,
    [{ activeSessions }],
    [{ activeLockouts }],
    [{ profilesCount }],
    submissionRows,
    docRows,
    [{ auditTotal }],
    [{ alerts24h }],
    [{ failures24h }],
  ] = await Promise.all([
    probePipeline(),
    db
      .select({
        role: users.role,
        isActive: users.isActive,
        total: count(),
      })
      .from(users)
      .groupBy(users.role, users.isActive),
    db
      .select({ activeSessions: count() })
      .from(sessions)
      .where(gt(sessions.expiresAt, now)),
    db
      .select({ activeLockouts: count() })
      .from(authRateLimits)
      .where(gt(authRateLimits.lockedUntil, now)),
    db.select({ profilesCount: count() }).from(patientProfiles),
    db
      .select({
        status: crfSubmissions.status,
        pipelineStatus: crfSubmissions.pipelineStatus,
        firstOpenedAt: crfSubmissions.firstOpenedAt,
      })
      .from(crfSubmissions),
    db
      .select({
        sizeBytes: uploadedDocuments.sizeBytes,
        ocrJobStatus: uploadedDocuments.ocrJobStatus,
      })
      .from(uploadedDocuments),
    db.select({ auditTotal: count() }).from(auditLogs),
    db
      .select({ alerts24h: count() })
      .from(auditLogs)
      .where(
        and(
          inArray(auditLogs.action, SECURITY_ALERT_ACTIONS),
          gte(auditLogs.createdAt, since24h)
        )
      ),
    db
      .select({ failures24h: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "auth.login_failed"),
          gte(auditLogs.createdAt, since24h)
        )
      ),
  ]);

  const userMetrics = { total: 0, active: 0, patient: 0, specialist: 0, admin: 0 };
  for (const row of userRoleCounts) {
    const n = Number(row.total);
    userMetrics.total += n;
    if (row.isActive) userMetrics.active += n;
    if (row.role === "patient") userMetrics.patient += n;
    else if (row.role === "specialist") userMetrics.specialist += n;
    else if (row.role === "admin") userMetrics.admin += n;
  }

  const pipelineBreakdown: Record<PipelineStatus, number> = {
    none: 0,
    privacy_check: 0,
    privacy_review: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  let submissionsApproved = 0;
  let submissionsPendingReview = 0;
  let submissionsUnopened = 0;

  for (const row of submissionRows) {
    pipelineBreakdown[row.pipelineStatus] = (pipelineBreakdown[row.pipelineStatus] ?? 0) + 1;
    if (row.status === "approved") submissionsApproved += 1;
    else {
      submissionsPendingReview += 1;
      if (!row.firstOpenedAt) submissionsUnopened += 1;
    }
  }

  const documents = {
    total: docRows.length,
    totalBytes: 0,
    pendingOcr: 0,
    completedOcr: 0,
    failedOcr: 0,
  };
  for (const doc of docRows) {
    documents.totalBytes += Number(doc.sizeBytes || 0);
    if (doc.ocrJobStatus === "pending") documents.pendingOcr += 1;
    else if (doc.ocrJobStatus === "failed") documents.failedOcr += 1;
    else documents.completedOcr += 1;
  }

  const mem = process.memoryUsage();
  const overallStatus =
    encryptionConfigured && pipelineProbe.status === "online" ? "healthy" : "degraded";

  return {
    timestamp: now.toISOString(),
    overallStatus,
    services: {
      database: {
        status: "connected",
        latencyMs: dbLatencyMs,
      },
      pipelineBackend: pipelineProbe,
      encryptionVault: {
        configured: encryptionConfigured,
      },
    },
    securityPosture: {
      demoModeEnabled: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
      specialistInviteConfigured: Boolean(process.env.SPECIALIST_INVITE_CODE?.trim()),
      pipelineEngine: process.env.PIPELINE_ENGINE?.trim() || "gemini",
      cookieSecureMode: process.env.COOKIE_SECURE?.trim() || "auto",
      activeSessions: Number(activeSessions),
      activeRateLimitLockouts: Number(activeLockouts),
      securityAlerts24h: Number(alerts24h),
      loginFailures24h: Number(failures24h),
    },
    metrics: {
      users: userMetrics,
      clinical: {
        patientProfiles: Number(profilesCount),
        submissionsTotal: submissionRows.length,
        submissionsApproved,
        submissionsPendingReview,
        submissionsUnopened,
      },
      pipelineBreakdown,
      documents,
      auditLogsTotal: Number(auditTotal),
    },
    runtime: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(mem.rss / (1024 * 1024)),
        heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
      },
    },
  };
}

// -----------------------------------------------------------------------------
// 3. OCR Pipeline Queue Explorer & Controls
// -----------------------------------------------------------------------------

export const adminPipelineQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z
    .enum(["all", "none", "privacy_check", "privacy_review", "processing", "completed", "failed"])
    .optional()
    .default("all"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type AdminPipelineQuery = z.infer<typeof adminPipelineQuerySchema>;

export const adminPipelineActionSchema = z.object({
  action: z.enum(["retry", "mark_failed", "reset_pending"]),
  reason: z.string().trim().max(300).optional(),
});

export type AdminPipelineActionInput = z.infer<typeof adminPipelineActionSchema>;

export interface AdminPipelineDocumentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  storageProvider: "minio" | "s3" | "sample" | "local";
  ocrJobStatus: "pending" | "completed" | "failed";
  createdAt: string;
}

export interface AdminPipelineJobDTO {
  submissionId: string;
  legacyRecordKey: string | null;
  studyId: string;
  reviewStatus: "pending_doctor_review" | "approved";
  pipelineStatus: PipelineStatus;
  pipelineIntakeId: string | null;
  pipelineError: string | null;
  backendJobStatus: string | null;
  submittedAt: string;
  lastUpdatedAt: string;
  documents: AdminPipelineDocumentDTO[];
  localStoredImageCount: number;
}

export interface AdminPipelineSummary {
  total: number;
  active: number;
  pending: number;
  completed: number;
  failed: number;
  byStatus: Record<PipelineStatus, number>;
}

export interface AdminPipelineQueueResult {
  items: AdminPipelineJobDTO[];
  summary: AdminPipelineSummary;
  pagination: PaginationInfo;
  backendOnline: boolean;
}

export type BackendIntakesFetcher = () => Promise<{
  online: boolean;
  jobs: { job_id: string; status: string }[];
}>;

export async function defaultBackendIntakesFetcher(): Promise<{
  online: boolean;
  jobs: { job_id: string; status: string }[];
}> {
  try {
    const res = await fetch(`${PIPELINE_URL}/api/intakes`, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { online: false, jobs: [] };
    const data = (await res.json().catch(() => null)) as {
      jobs?: { job_id: string; status: string }[];
    } | null;
    return { online: true, jobs: Array.isArray(data?.jobs) ? data.jobs : [] };
  } catch {
    return { online: false, jobs: [] };
  }
}

export async function listAdminPipelineQueue(
  rawQuery: Partial<AdminPipelineQuery> = {},
  {
    db = getDb(),
    fetchBackendIntakes = defaultBackendIntakesFetcher,
  }: {
    db?: DatabaseClient;
    fetchBackendIntakes?: BackendIntakesFetcher;
  } = {}
): Promise<AdminPipelineQueueResult> {
  const query = adminPipelineQuerySchema.parse(rawQuery);

  const [submissionRows, backendState] = await Promise.all([
    db
      .select({
        submissionId: crfSubmissions.id,
        legacyRecordKey: crfSubmissions.legacyRecordKey,
        profileId: patientProfiles.id,
        studyIdEncrypted: patientProfiles.studyIdEncrypted,
        reviewStatus: crfSubmissions.status,
        pipelineStatus: crfSubmissions.pipelineStatus,
        pipelineIntakeId: crfSubmissions.pipelineIntakeId,
        pipelineError: crfSubmissions.pipelineError,
        submittedAt: crfSubmissions.submittedAt,
        lastUpdatedAt: crfSubmissions.lastUpdatedAt,
      })
      .from(crfSubmissions)
      .innerJoin(patientProfiles, eq(crfSubmissions.patientProfileId, patientProfiles.id))
      .orderBy(desc(crfSubmissions.lastUpdatedAt)),
    fetchBackendIntakes(),
  ]);

  const submissionIds = submissionRows.map((row) => row.submissionId);
  const docRows =
    submissionIds.length > 0
      ? await db
          .select({
            id: uploadedDocuments.id,
            submissionId: uploadedDocuments.submissionId,
            fileName: uploadedDocuments.fileName,
            mimeType: uploadedDocuments.mimeType,
            sizeBytes: uploadedDocuments.sizeBytes,
            isImage: uploadedDocuments.isImage,
            storageProvider: uploadedDocuments.storageProvider,
            ocrJobStatus: uploadedDocuments.ocrJobStatus,
            createdAt: uploadedDocuments.createdAt,
          })
          .from(uploadedDocuments)
          .where(inArray(uploadedDocuments.submissionId, submissionIds))
          .orderBy(uploadedDocuments.position, uploadedDocuments.createdAt)
      : [];

  const docsBySub = new Map<string, AdminPipelineDocumentDTO[]>();
  for (const doc of docRows) {
    const list = docsBySub.get(doc.submissionId) ?? [];
    list.push({
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: Number(doc.sizeBytes || 0),
      isImage: doc.isImage,
      storageProvider: doc.storageProvider,
      ocrJobStatus: doc.ocrJobStatus,
      createdAt: doc.createdAt.toISOString(),
    });
    docsBySub.set(doc.submissionId, list);
  }

  const backendJobMap = new Map(backendState.jobs.map((j) => [j.job_id, j.status]));

  const byStatus: Record<PipelineStatus, number> = {
    none: 0,
    privacy_check: 0,
    privacy_review: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  const hydrated: AdminPipelineJobDTO[] = submissionRows.map((row) => {
    byStatus[row.pipelineStatus] = (byStatus[row.pipelineStatus] ?? 0) + 1;
    const docs = docsBySub.get(row.submissionId) ?? [];
    const studyId = decryptField(
      row.studyIdEncrypted,
      `patient_profiles:${row.profileId}:study_id`
    );

    return {
      submissionId: row.submissionId,
      legacyRecordKey: row.legacyRecordKey,
      studyId,
      reviewStatus: row.reviewStatus,
      pipelineStatus: row.pipelineStatus,
      pipelineIntakeId: row.pipelineIntakeId,
      pipelineError: row.pipelineError,
      backendJobStatus: row.pipelineIntakeId
        ? backendJobMap.get(row.pipelineIntakeId) ?? null
        : null,
      submittedAt: row.submittedAt.toISOString(),
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
      documents: docs,
      localStoredImageCount: docs.filter((d) => d.storageProvider === "local" && d.isImage).length,
    };
  });

  const summary: AdminPipelineSummary = {
    total: hydrated.length,
    active: byStatus.privacy_check + byStatus.processing,
    pending: byStatus.none + byStatus.privacy_review,
    completed: byStatus.completed,
    failed: byStatus.failed,
    byStatus,
  };

  const searchLower = query.q.toLowerCase();
  const filtered = hydrated.filter((item) => {
    if (query.status !== "all" && item.pipelineStatus !== query.status) return false;
    if (!searchLower) return true;
    const haystack = [
      item.submissionId,
      item.legacyRecordKey ?? "",
      item.studyId,
      item.pipelineIntakeId ?? "",
      item.pipelineError ?? "",
      ...item.documents.map((d) => d.fileName),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });

  const pagination = buildPagination(query.page, query.pageSize, filtered.length);
  const start = (pagination.page - 1) * pagination.pageSize;
  const items = filtered.slice(start, start + pagination.pageSize);

  return {
    items,
    summary,
    pagination,
    backendOnline: backendState.online,
  };
}

export async function syncAdminPipelineQueue(
  actor: AdminActor,
  context: AdminRequestContext = {},
  {
    db = getDb(),
    syncPipeline = () => refreshPipelineStatuses({ db }),
  }: {
    db?: DatabaseClient;
    syncPipeline?: () => Promise<number>;
  } = {}
): Promise<{ action: "sync"; syncedCount: number }> {
  let syncedCount = 0;
  try {
    syncedCount = await syncPipeline();
  } catch {
    throw new AdminError(502, "OCR pipeline backend is unavailable for queue sync.");
  }
  await writeAuditLog(
    {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "admin.pipeline_synced",
      targetType: "pipeline_queue",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: { syncedCount },
    },
    db
  );
  return { action: "sync", syncedCount };
}

export async function performAdminPipelineAction(
  submissionId: string,
  rawInput: AdminPipelineActionInput,
  actor: AdminActor,
  context: AdminRequestContext = {},
  {
    db = getDb(),
    schedulePipeline = (id: string) => {
      void startSubmissionPipeline(id, { db });
    },
  }: {
    db?: DatabaseClient;
    schedulePipeline?: (submissionId: string) => void;
  } = {}
): Promise<{
  action: AdminPipelineActionInput["action"];
  submissionId: string;
  pipelineStatus: PipelineStatus;
}> {
  assertValidUuid(submissionId, "Submission");
  const input = adminPipelineActionSchema.parse(rawInput);

  const [existing] = await db
    .select({
      id: crfSubmissions.id,
      pipelineStatus: crfSubmissions.pipelineStatus,
      pipelineIntakeId: crfSubmissions.pipelineIntakeId,
    })
    .from(crfSubmissions)
    .where(eq(crfSubmissions.id, submissionId))
    .limit(1);

  if (!existing) {
    throw new AdminError(404, "CRF submission not found.");
  }

  if (input.action === "retry") {
    if (existing.pipelineStatus !== "failed") {
      throw new AdminError(409, "Only failed pipeline jobs can be retried.");
    }
    const localDocs = await db
      .select({ id: uploadedDocuments.id })
      .from(uploadedDocuments)
      .where(
        and(
          eq(uploadedDocuments.submissionId, submissionId),
          eq(uploadedDocuments.storageProvider, "local"),
          eq(uploadedDocuments.isImage, true)
        )
      )
      .limit(1);

    if (localDocs.length === 0) {
      throw new AdminError(400, "No stored local images are available to retry.");
    }

    const updated = await db
      .update(crfSubmissions)
      .set({ pipelineStatus: "none", pipelineError: null, lastUpdatedAt: new Date() })
      .where(and(eq(crfSubmissions.id, submissionId), eq(crfSubmissions.pipelineStatus, "failed")))
      .returning({ id: crfSubmissions.id });

    if (updated.length === 0) {
      throw new AdminError(409, "Pipeline job state changed concurrently.");
    }

    schedulePipeline(submissionId);

    await writeAuditLog(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        action: "admin.pipeline_retried",
        targetType: "crf_submission",
        targetId: submissionId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { previousStatus: existing.pipelineStatus },
      },
      db
    );

    return { action: "retry", submissionId, pipelineStatus: "processing" };
  }

  if (input.action === "mark_failed") {
    if (existing.pipelineStatus === "completed" || existing.pipelineStatus === "failed") {
      throw new AdminError(409, "Completed or already failed jobs cannot be marked failed.");
    }
    const reason = input.reason?.trim() || "Marked failed by system administrator.";
    const updated = await db
      .update(crfSubmissions)
      .set({
        pipelineStatus: "failed",
        pipelineError: reason,
        lastUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(crfSubmissions.id, submissionId),
          inArray(crfSubmissions.pipelineStatus, [
            "none",
            "privacy_check",
            "privacy_review",
            "processing",
          ])
        )
      )
      .returning({ id: crfSubmissions.id });

    if (updated.length === 0) {
      throw new AdminError(409, "Pipeline job state changed concurrently.");
    }

    await writeAuditLog(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        action: "admin.pipeline_marked_failed",
        targetType: "crf_submission",
        targetId: submissionId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { previousStatus: existing.pipelineStatus, reason },
      },
      db
    );

    return { action: "mark_failed", submissionId, pipelineStatus: "failed" };
  }

  // reset_pending
  if (existing.pipelineStatus !== "failed" && existing.pipelineStatus !== "privacy_review") {
    throw new AdminError(409, "Only failed or privacy-held jobs can be reset to pending.");
  }

  const updated = await db
    .update(crfSubmissions)
    .set({
      pipelineStatus: "none",
      pipelineError: null,
      lastUpdatedAt: new Date(),
    })
    .where(
      and(
        eq(crfSubmissions.id, submissionId),
        inArray(crfSubmissions.pipelineStatus, ["failed", "privacy_review"])
      )
    )
    .returning({ id: crfSubmissions.id });

  if (updated.length === 0) {
    throw new AdminError(409, "Pipeline job state changed concurrently.");
  }

  await writeAuditLog(
    {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "admin.pipeline_reset",
      targetType: "crf_submission",
      targetId: submissionId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: { previousStatus: existing.pipelineStatus },
    },
    db
  );

  return { action: "reset_pending", submissionId, pipelineStatus: "none" };
}

// -----------------------------------------------------------------------------
// 4. Security Audit Log Explorer
// -----------------------------------------------------------------------------

export const adminAuditQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  category: z
    .enum(["all", "auth", "submission", "admin", "security_alerts"])
    .optional()
    .default("all"),
  action: z.string().trim().max(80).optional().default(""),
  actorRole: z
    .enum(["all", "patient", "specialist", "admin", "system"])
    .optional()
    .default("all"),
  dateFrom: z.string().trim().max(40).optional().default(""),
  dateTo: z.string().trim().max(40).optional().default(""),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;

export interface AdminAuditLogDTO {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  isSecurityAlert: boolean;
  createdAt: string;
}

export interface AdminAuditSummary {
  total: number;
  authEvents: number;
  securityAlerts: number;
  submissionEvents: number;
  adminEvents: number;
}

export interface AdminAuditResult {
  items: AdminAuditLogDTO[];
  summary: AdminAuditSummary;
  pagination: PaginationInfo;
  availableActions: string[];
}

const SECURITY_ALERT_SET = new Set<string>(SECURITY_ALERT_ACTIONS);

function parseIsoBoundary(value: string, endOfDay: boolean): Date | null {
  if (!value) return null;
  const isoCandidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) {
    throw new AdminError(400, "Invalid date filter format.");
  }
  return date;
}

export async function queryAdminAuditLogs(
  rawQuery: Partial<AdminAuditQuery> = {},
  db: DatabaseClient = getDb()
): Promise<AdminAuditResult> {
  const query = adminAuditQuerySchema.parse(rawQuery);
  const dateFrom = parseIsoBoundary(query.dateFrom, false);
  const dateTo = parseIsoBoundary(query.dateTo, true);

  const whereConditions: SQL[] = [];
  if (query.category === "auth") {
    whereConditions.push(sql`${auditLogs.action} LIKE 'auth.%'`);
  } else if (query.category === "submission") {
    whereConditions.push(sql`${auditLogs.action} LIKE 'submission.%'`);
  } else if (query.category === "admin") {
    whereConditions.push(sql`${auditLogs.action} LIKE 'admin.%'`);
  } else if (query.category === "security_alerts") {
    whereConditions.push(inArray(auditLogs.action, SECURITY_ALERT_ACTIONS));
  }

  if (query.action) {
    whereConditions.push(eq(auditLogs.action, query.action));
  }

  if (query.actorRole === "system") {
    whereConditions.push(or(isNull(auditLogs.actorRole), eq(auditLogs.actorRole, "")) as SQL);
  } else if (query.actorRole !== "all") {
    whereConditions.push(eq(auditLogs.actorRole, query.actorRole));
  }

  if (dateFrom) {
    whereConditions.push(gte(auditLogs.createdAt, dateFrom));
  }
  if (dateTo) {
    whereConditions.push(lte(auditLogs.createdAt, dateTo));
  }

  const allSummaryRows = await db
    .select({ action: auditLogs.action })
    .from(auditLogs);

  const summary: AdminAuditSummary = {
    total: allSummaryRows.length,
    authEvents: 0,
    securityAlerts: 0,
    submissionEvents: 0,
    adminEvents: 0,
  };
  const actionSet = new Set<string>();
  for (const r of allSummaryRows) {
    actionSet.add(r.action);
    if (r.action.startsWith("auth.")) summary.authEvents += 1;
    if (r.action.startsWith("submission.")) summary.submissionEvents += 1;
    if (r.action.startsWith("admin.")) summary.adminEvents += 1;
    if (SECURITY_ALERT_SET.has(r.action)) summary.securityAlerts += 1;
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.actorUserId,
      actorRole: auditLogs.actorRole,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadataJson: auditLogs.metadataJson,
      createdAt: auditLogs.createdAt,
      userFullNameEncrypted: users.fullNameEncrypted,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(auditLogs.createdAt));

  const hydrated: AdminAuditLogDTO[] = rows.map((row) => {
    let actorName: string | null = null;
    if (row.actorUserId && row.userFullNameEncrypted) {
      try {
        actorName = decryptField(row.userFullNameEncrypted, `users:${row.actorUserId}:full_name`);
      } catch {
        actorName = null;
      }
    }

    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorName,
      actorRole: row.actorRole,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: row.metadataJson ?? {},
      isSecurityAlert: SECURITY_ALERT_SET.has(row.action),
      createdAt: row.createdAt.toISOString(),
    };
  });

  const searchLower = query.q.toLowerCase();
  const filtered = searchLower
    ? hydrated.filter((item) => {
        const haystack = [
          item.id,
          item.action,
          item.targetType,
          item.targetId ?? "",
          item.actorUserId ?? "",
          item.actorName ?? "",
          item.actorRole ?? "",
          item.ipAddress ?? "",
          JSON.stringify(item.metadata),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchLower);
      })
    : hydrated;

  const pagination = buildPagination(query.page, query.pageSize, filtered.length);
  const start = (pagination.page - 1) * pagination.pageSize;
  const items = filtered.slice(start, start + pagination.pageSize);

  return {
    items,
    summary,
    pagination,
    availableActions: Array.from(actionSet).sort(),
  };
}

export { auditLogsToCsv, sanitizeCsvCell } from "@/lib/adminCsv";
