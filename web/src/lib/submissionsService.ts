import crypto from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  buildBlankCrfRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  type SleCrfPatientRecord,
  type UploadedDocFile,
} from "@/data/crfData";
import { getDb, type DatabaseClient } from "@/db";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
} from "@/db/schema";
import { AuthError, type AuthenticatedUserDTO } from "@/lib/auth";
import type { PipelineStatus } from "@/db/schema";
import type { CrfView } from "@/lib/crfApproval";
import { canFinalizeReview, caseForIntake, withoutHidden } from "@/lib/crfEvidence";
import {
  buildScrubbedMedicalHistory,
  buildScrubbedOrgansDamage,
  decryptSubmissionHivFields,
  encryptSensitiveOcrFields,
  rehydrateSleCrfRecord,
} from "@/lib/crfPersistence";
import {
  computeBlindIndex,
  encryptField,
  normalizeStudyId,
} from "@/lib/crypto";
import {
  DEFAULT_SUBMISSION_FILTERS,
  getOcrTierCounts,
  resolveUploadedDateBounds,
  type OcrTierCounts,
  type PaginationMeta,
  type SubmissionQueryFilters,
} from "@/lib/submissionFilters";
import { callPipeline } from "@/lib/pipeline";

export interface SubmissionItemDTO {
  record: SleCrfPatientRecord;
  dbSubmissionId: string;
  submittedAtIso: string;
  ocrSummary: OcrTierCounts;
  /** Python backend hand-off; specialists also see pipelineError. */
  pipelineStatus?: PipelineStatus;
  pipelineError?: string | null;
  /** Backend intake job id; the doctor review opens /registry for it. */
  pipelineIntakeId?: string | null;
  /** First time a specialist opened it; null = "Hồ sơ mới". */
  firstOpenedAt?: string | null;
}

/**
 * What a patient may see about their own submission: who and when, which
 * files were sent, and the review status. No CRF values, OCR fields, scores
 * or clinical data ever leave the server for a patient account.
 */
export interface PatientStatusRecord {
  id: string;
  patientName: string;
  studyId: string;
  submittedAt?: string;
  submissionStatus: "pending_doctor_review" | "approved";
  processingStage: PatientStage;
  uploadedFiles: { id: string; name: string; isImage: boolean }[];
}

/**
 * Coarse processing detail for the patient, without backend errors.
 */
export type PatientStage = "received" | "processing" | "awaiting_doctor" | "extracted" | "approved" | "failed";

export function patientStage(
  pipelineStatus: PipelineStatus | undefined,
  submissionStatus: "pending_doctor_review" | "approved",
): PatientStage {
  if (pipelineStatus === "failed") return "failed";
  if (submissionStatus === "approved") return "approved";
  if (pipelineStatus === "privacy_check" || pipelineStatus === "processing") return "processing";
  if (pipelineStatus === "none" || pipelineStatus === undefined) return "received";
  if (pipelineStatus === "completed") return "extracted";
  return "awaiting_doctor";
}

export interface PatientSubmissionStatusDTO {
  record: PatientStatusRecord;
  dbSubmissionId: string;
  submittedAtIso: string;
}

export function toPatientStatus(item: SubmissionItemDTO): PatientSubmissionStatusDTO {
  const { record } = item;
  const submissionStatus = record.submissionStatus ?? (record.signedOffBy ? "approved" : "pending_doctor_review");
  return {
    dbSubmissionId: item.dbSubmissionId,
    submittedAtIso: item.submittedAtIso,
    record: {
      id: record.id,
      patientName: record.patientName,
      studyId: record.studyId,
      submittedAt: record.submittedAt,
      submissionStatus,
      processingStage: patientStage(item.pipelineStatus, submissionStatus),
      uploadedFiles: (record.uploadedFiles ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        isImage: file.isImage,
      })),
    },
  };
}

export interface SubmissionStatsDTO {
  total: number;
  /** Never opened by a specialist and not approved ("Hồ sơ mới"). */
  new: number;
  /** Opened but not yet approved ("Chưa phê duyệt"). */
  pending: number;
  approved: number;
  manualRequiredDossiers: number;
  filteredTotal: number;
}

export interface QuerySubmissionsResult {
  items: SubmissionItemDTO[];
  stats: SubmissionStatsDTO;
  pagination: PaginationMeta;
  appliedFilters: SubmissionQueryFilters;
  roleScope: "specialist" | "patient";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function computePagination(
  page: number,
  pageSize: number,
  totalItems: number
): PaginationMeta {
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

export async function querySubmissions(params: {
  user: AuthenticatedUserDTO;
  filters: SubmissionQueryFilters;
  now?: Date;
  db?: DatabaseClient;
}): Promise<QuerySubmissionsResult> {
  const db = params.db ?? getDb();
  const { user } = params;
  if (user.role !== "specialist" && user.role !== "patient") {
    throw new AuthError(403, "Insufficient role privileges.");
  }
  const roleScope: "specialist" | "patient" = user.role;

  // Patients are strictly scoped to their own submissions sorted by upload date (newest first),
  // while still respecting backend page & pageSize pagination.
  const effectiveFilters: SubmissionQueryFilters =
    roleScope === "patient"
      ? {
          ...DEFAULT_SUBMISSION_FILTERS,
          page: params.filters.page,
          pageSize: params.filters.pageSize,
          utcOffsetMinutes: params.filters.utcOffsetMinutes,
          sort: "newest",
        }
      : params.filters;

  const baseScopeConditions: SQL[] = [];
  if (roleScope === "patient") {
    baseScopeConditions.push(eq(patientProfiles.userId, user.id));
  }

  // 1. Cohort-wide KPIs within the user's authorized scope
  const cohortSummaryRows = await db
    .select({
      submissionId: crfSubmissions.id,
      status: crfSubmissions.status,
      firstOpenedAt: crfSubmissions.firstOpenedAt,
      hivStatusEncrypted: crfSubmissions.hivStatusEncrypted,
      ocrFieldsJson: crfSubmissions.ocrFieldsJson,
      antibodyBlotsJson: crfSubmissions.antibodyBlotsJson,
    })
    .from(crfSubmissions)
    .innerJoin(
      patientProfiles,
      eq(crfSubmissions.patientProfileId, patientProfiles.id)
    )
    .where(baseScopeConditions.length > 0 ? and(...baseScopeConditions) : undefined);

  let fresh = 0;
  let pending = 0;
  let approved = 0;
  let manualRequiredDossiers = 0;
  for (const row of cohortSummaryRows) {
    if (row.status === "approved") approved += 1;
    else if (row.firstOpenedAt) pending += 1;
    else fresh += 1;

    const fullFields = decryptSubmissionHivFields(
      row.ocrFieldsJson,
      row.hivStatusEncrypted,
      row.submissionId
    );
    const counts = getOcrTierCounts({
      ocrFields: fullFields,
      antibodyBlots: row.antibodyBlotsJson,
    });
    if (counts.manualCount > 0) {
      manualRequiredDossiers += 1;
    }
  }

  // 2. Build SQL WHERE predicates
  const filterConditions: SQL[] = [...baseScopeConditions];

  if (effectiveFilters.status === "new") {
    filterConditions.push(eq(crfSubmissions.status, "pending_doctor_review"), isNull(crfSubmissions.firstOpenedAt));
  } else if (effectiveFilters.status === "pending_doctor_review") {
    filterConditions.push(eq(crfSubmissions.status, "pending_doctor_review"), isNotNull(crfSubmissions.firstOpenedAt));
  } else if (effectiveFilters.status !== "all") {
    filterConditions.push(eq(crfSubmissions.status, effectiveFilters.status));
  }

  if (effectiveFilters.gender !== "all") {
    filterConditions.push(eq(patientProfiles.gender, effectiveFilters.gender));
  }

  const dateBounds = resolveUploadedDateBounds({
    datePreset: effectiveFilters.datePreset,
    fromDate: effectiveFilters.fromDate,
    toDate: effectiveFilters.toDate,
    utcOffsetMinutes: effectiveFilters.utcOffsetMinutes,
    now: params.now,
  });
  if (dateBounds.start) {
    filterConditions.push(gte(crfSubmissions.submittedAt, dateBounds.start));
  }
  if (dateBounds.end) {
    filterConditions.push(lte(crfSubmissions.submittedAt, dateBounds.end));
  }

  if (effectiveFilters.clinicalRisk === "eular_classified") {
    filterConditions.push(eq(crfSubmissions.eularClassifiedSle, true));
  } else if (effectiveFilters.clinicalRisk === "eular_below") {
    filterConditions.push(eq(crfSubmissions.eularClassifiedSle, false));
  } else if (effectiveFilters.clinicalRisk === "sledai_high") {
    filterConditions.push(gte(crfSubmissions.sledaiTotalScore, 11));
  } else if (effectiveFilters.clinicalRisk === "sledai_low_mod") {
    filterConditions.push(lt(crfSubmissions.sledaiTotalScore, 11));
  }

  const whereClause =
    filterConditions.length > 0 ? and(...filterConditions) : undefined;

  const searchLower = effectiveFilters.q.trim().toLowerCase();
  const requiresPostDecryptionScan = Boolean(searchLower);

  const sqlOrderBy =
    effectiveFilters.sort === "oldest"
      ? [asc(crfSubmissions.submittedAt), asc(crfSubmissions.id)]
      : roleScope === "specialist"
      ? // Put failures before new dossiers. Review detail is grouped after the lazy CRF reads.
        [
          asc(sql`case when ${crfSubmissions.pipelineStatus} = 'failed' then 0 when ${crfSubmissions.status} = 'approved' then 3 when ${crfSubmissions.firstOpenedAt} is null then 1 else 2 end`),
          desc(crfSubmissions.submittedAt),
          asc(crfSubmissions.id),
        ]
      : [desc(crfSubmissions.submittedAt), asc(crfSubmissions.id)];

  // 3. Execute SQL-level LIMIT/OFFSET pagination directly when no encrypted text search is active
  let pagination: PaginationMeta;
  let sqlRows;

  if (!requiresPostDecryptionScan) {
    const [{ totalCount }] = await db
      .select({ totalCount: count() })
      .from(crfSubmissions)
      .innerJoin(
        patientProfiles,
        eq(crfSubmissions.patientProfileId, patientProfiles.id)
      )
      .where(whereClause);

    pagination = computePagination(
      effectiveFilters.page,
      effectiveFilters.pageSize,
      Number(totalCount ?? 0)
    );

    const offset = (pagination.page - 1) * pagination.pageSize;

    sqlRows = await db
      .select({
        submissionId: crfSubmissions.id,
        legacyRecordKey: crfSubmissions.legacyRecordKey,
        status: crfSubmissions.status,
        submittedAt: crfSubmissions.submittedAt,
        signedOffByName: crfSubmissions.signedOffByName,
        signedOffRole: crfSubmissions.signedOffRole,
        sledaiTotalScore: crfSubmissions.sledaiTotalScore,
        hivStatusEncrypted: crfSubmissions.hivStatusEncrypted,
        medicalHistoryJson: crfSubmissions.medicalHistoryJson,
        organsDamageJson: crfSubmissions.organsDamageJson,
        ocrFieldsJson: crfSubmissions.ocrFieldsJson,
        antibodyBlotsJson: crfSubmissions.antibodyBlotsJson,
        eularAcrJson: crfSubmissions.eularAcrJson,
        sledai2kJson: crfSubmissions.sledai2kJson,
        lastUpdatedAt: crfSubmissions.lastUpdatedAt,
        pipelineStatus: crfSubmissions.pipelineStatus,
        pipelineError: crfSubmissions.pipelineError,
        pipelineIntakeId: crfSubmissions.pipelineIntakeId,
        firstOpenedAt: crfSubmissions.firstOpenedAt,
        profileId: patientProfiles.id,
        studyIdEncrypted: patientProfiles.studyIdEncrypted,
        patientNameEncrypted: patientProfiles.patientNameEncrypted,
        icfSignedDateEncrypted: patientProfiles.icfSignedDateEncrypted,
        age: patientProfiles.age,
        gender: patientProfiles.gender,
        heightCm: patientProfiles.heightCm,
        weightKg: patientProfiles.weightKg,
      })
      .from(crfSubmissions)
      .innerJoin(
        patientProfiles,
        eq(crfSubmissions.patientProfileId, patientProfiles.id)
      )
      .where(whereClause)
      .orderBy(...sqlOrderBy)
      .limit(pagination.pageSize)
      .offset(offset);
  } else {
    sqlRows = await db
      .select({
        submissionId: crfSubmissions.id,
        legacyRecordKey: crfSubmissions.legacyRecordKey,
        status: crfSubmissions.status,
        submittedAt: crfSubmissions.submittedAt,
        signedOffByName: crfSubmissions.signedOffByName,
        signedOffRole: crfSubmissions.signedOffRole,
        sledaiTotalScore: crfSubmissions.sledaiTotalScore,
        hivStatusEncrypted: crfSubmissions.hivStatusEncrypted,
        medicalHistoryJson: crfSubmissions.medicalHistoryJson,
        organsDamageJson: crfSubmissions.organsDamageJson,
        ocrFieldsJson: crfSubmissions.ocrFieldsJson,
        antibodyBlotsJson: crfSubmissions.antibodyBlotsJson,
        eularAcrJson: crfSubmissions.eularAcrJson,
        sledai2kJson: crfSubmissions.sledai2kJson,
        lastUpdatedAt: crfSubmissions.lastUpdatedAt,
        pipelineStatus: crfSubmissions.pipelineStatus,
        pipelineError: crfSubmissions.pipelineError,
        pipelineIntakeId: crfSubmissions.pipelineIntakeId,
        firstOpenedAt: crfSubmissions.firstOpenedAt,
        profileId: patientProfiles.id,
        studyIdEncrypted: patientProfiles.studyIdEncrypted,
        patientNameEncrypted: patientProfiles.patientNameEncrypted,
        icfSignedDateEncrypted: patientProfiles.icfSignedDateEncrypted,
        age: patientProfiles.age,
        gender: patientProfiles.gender,
        heightCm: patientProfiles.heightCm,
        weightKg: patientProfiles.weightKg,
      })
      .from(crfSubmissions)
      .innerJoin(
        patientProfiles,
        eq(crfSubmissions.patientProfileId, patientProfiles.id)
      )
      .where(whereClause)
      .orderBy(...sqlOrderBy);

    //Placeholder pagination until post-decryption filtering settles below
    pagination = computePagination(
      effectiveFilters.page,
      effectiveFilters.pageSize,
      sqlRows.length
    );
  }

  // 4. Batch load attached document metadata
  const submissionIds = sqlRows.map((r) => r.submissionId);
  const docsBySubmission = new Map<string, UploadedDocFile[]>();

  if (submissionIds.length > 0) {
    const docRows = await db
      .select({
        id: uploadedDocuments.id,
        submissionId: uploadedDocuments.submissionId,
        fileName: uploadedDocuments.fileName,
        isImage: uploadedDocuments.isImage,
      })
      .from(uploadedDocuments)
      .where(inArray(uploadedDocuments.submissionId, submissionIds))
      .orderBy(uploadedDocuments.position, uploadedDocuments.createdAt);

    for (const d of docRows) {
      const list = docsBySubmission.get(d.submissionId) ?? [];
      list.push({
        id: d.id,
        name: d.fileName,
        url: null,
        isImage: d.isImage,
      });
      docsBySubmission.set(d.submissionId, list);
    }
  }

  // 5. Decrypt Zone B PII server-side & evaluate encrypted search / computed OCR sort
  const hydratedItems: Array<{
    dto: SubmissionItemDTO;
    submittedAtMs: number;
    sledaiScore: number;
    reviewRank: number;
  }> = [];

  for (const row of sqlRows) {
    const docs = docsBySubmission.get(row.submissionId) ?? [];
    const record = rehydrateSleCrfRecord(
      row,
      docs,
      effectiveFilters.utcOffsetMinutes
    );
    const ocrSummary = getOcrTierCounts(record);

    if (searchLower) {
      const haystackMatched =
        record.patientName.toLowerCase().includes(searchLower) ||
        record.studyId.toLowerCase().includes(searchLower) ||
        record.physician.toLowerCase().includes(searchLower) ||
        (record.uploadedFiles?.some((f) =>
          f.name.toLowerCase().includes(searchLower)
        ) ??
          false);
      if (!haystackMatched) {
        continue;
      }
    }

    hydratedItems.push({
      dto: {
        record,
        dbSubmissionId: row.submissionId,
        submittedAtIso: row.submittedAt.toISOString(),
        ocrSummary,
        pipelineStatus: row.pipelineStatus,
        pipelineError: row.pipelineError,
        pipelineIntakeId: row.pipelineIntakeId,
        firstOpenedAt: row.firstOpenedAt ? row.firstOpenedAt.toISOString() : null,
      },
      submittedAtMs: row.submittedAt.getTime(),
      sledaiScore: row.sledaiTotalScore,
      reviewRank: row.pipelineStatus === "failed" ? 0 : row.status === "approved" ? 3 : row.firstOpenedAt ? 2 : 1,
    });
  }

  let pagedItems: SubmissionItemDTO[];

  if (requiresPostDecryptionScan) {
    hydratedItems.sort((a, b) => {
      if (effectiveFilters.sort === "oldest") return a.submittedAtMs - b.submittedAtMs;
      if (roleScope === "specialist" && a.reviewRank !== b.reviewRank) return a.reviewRank - b.reviewRank;
      return b.submittedAtMs - a.submittedAtMs;
    });

    pagination = computePagination(
      effectiveFilters.page,
      effectiveFilters.pageSize,
      hydratedItems.length
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    pagedItems = hydratedItems
      .slice(start, start + pagination.pageSize)
      .map((entry) => entry.dto);
  } else {
    pagedItems = hydratedItems.map((entry) => entry.dto);
  }

  return {
    items: pagedItems,
    stats: {
      total: cohortSummaryRows.length,
      new: fresh,
      pending,
      approved,
      manualRequiredDossiers,
      filteredTotal: pagination.totalItems,
    },
    pagination,
    appliedFilters: {
      ...effectiveFilters,
      page: pagination.page,
    },
    roleScope,
  };
}

export const createSubmissionSchema = z.object({
  patientName: z.string().trim().max(120).optional(),
  studyId: z.string().trim().max(40).optional(),
  utcOffsetMinutes: z.coerce
    .number()
    .int()
    .min(-840)
    .max(840)
    .default(420),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(240),
        mimeType: z.string().trim().max(120).default("application/pdf"),
        sizeBytes: z.number().int().min(0).max(20 * 1024 * 1024).default(0),
        isImage: z.boolean().default(false),
      })
    )
    .min(1, "Please attach at least one lab image or PDF file.")
    .max(12, "Maximum 12 files per submission."),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export async function createPatientSubmission(params: {
  user: AuthenticatedUserDTO;
  input: CreateSubmissionInput;
  db?: DatabaseClient;
}): Promise<SubmissionItemDTO> {
  const db = params.db ?? getDb();
  const { user, input } = params;
  const now = new Date();

  const patientName =
    user.role === "patient"
      ? user.name.trim()
      : // A doctor may leave it blank: the name is printed on the uploaded sheets.
        input.patientName?.trim() || "Chưa nhập tên";
  if (!patientName) throw new AuthError(400, "Patient name is required.");

  const studyId =
    input.studyId?.trim() ||
    `VN-${String(1000 + crypto.randomInt(8999))}-${String(now.getFullYear()).slice(-2)}`;

  const profileId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const legacyRecordKey = `crf-up-${submissionId.slice(0, 8)}`;

  const draftRecord = buildBlankCrfRecord({
    id: legacyRecordKey,
    studyId,
    patientName,
    physician: user.role === "specialist" ? user.name : "",
  });

  const redactTokens = [patientName, studyId];
  const medicalHistoryJson = buildScrubbedMedicalHistory(draftRecord, redactTokens);
  const organsDamageJson = buildScrubbedOrgansDamage(draftRecord, redactTokens);
  const { safeOcrFields, hivStatusEncrypted } = encryptSensitiveOcrFields(
    draftRecord.ocrFields,
    submissionId,
    redactTokens
  );

  const eularSummary = calculateEularAcrSummary(
    draftRecord.eularAcrCriteria,
    draftRecord.anaEntryCriterionMet
  );
  const sledaiSummary = calculateSledai2kSummary(draftRecord.sledai2kCriteria);

  const studyIdEncrypted = encryptField(
    studyId,
    `patient_profiles:${profileId}:study_id`
  );
  const patientNameEncrypted = encryptField(
    patientName,
    `patient_profiles:${profileId}:patient_name`
  );
  const icfSignedDateEncrypted = encryptField(
    draftRecord.icfSignedDate,
    `patient_profiles:${profileId}:icf_signed_date`
  );
  const studyIdBlindIndex = computeBlindIndex(
    normalizeStudyId(studyId),
    "study_id"
  );

  const docs: UploadedDocFile[] = [];

  await db.transaction(async (tx) => {
    await tx.insert(patientProfiles).values({
      id: profileId,
      userId: user.role === "patient" ? user.id : null,
      studyIdEncrypted,
      studyIdBlindIndex,
      patientNameEncrypted,
      icfSignedDateEncrypted,
      age: null,
      gender: null,
      heightCm: null,
      weightKg: null,
      bmi: null,
    });

    await tx.insert(crfSubmissions).values({
      id: submissionId,
      legacyRecordKey,
      patientProfileId: profileId,
      assignedSpecialistId: user.role === "specialist" ? user.id : null,
      status: "pending_doctor_review",
      submittedAt: now,
      eularTotalScore: eularSummary.totalScore,
      eularClassifiedSle: eularSummary.isClassifiedSle,
      sledaiTotalScore: sledaiSummary.totalScore,
      sledaiActivityTier: sledaiSummary.activityTierEn,
      hivStatusEncrypted,
      medicalHistoryJson,
      organsDamageJson,
      ocrFieldsJson: safeOcrFields,
      antibodyBlotsJson: draftRecord.antibodyBlots,
      eularAcrJson: {
        anaEntryCriterionMet: draftRecord.anaEntryCriterionMet,
        criteria: draftRecord.eularAcrCriteria,
      },
      sledai2kJson: draftRecord.sledai2kCriteria,
      lastUpdatedAt: now,
    });

    for (const [index, file] of input.files.entries()) {
      const docId = crypto.randomUUID();
      await tx.insert(uploadedDocuments).values({
        id: docId,
        submissionId,
        uploadedByUserId: user.id,
        fileName: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        isImage: file.isImage,
        storageProvider: "sample",
        storageKey: `uploads/${submissionId}/${file.name}`,
        ocrJobStatus: "pending",
        position: index,
      });
      docs.push({
        id: docId,
        name: file.name,
        url: null,
        isImage: file.isImage,
      });
    }
  });

  const hydrated = rehydrateSleCrfRecord(
    {
      submissionId,
      legacyRecordKey,
      status: "pending_doctor_review",
      submittedAt: now,
      signedOffByName: null,
      signedOffRole: null,
      hivStatusEncrypted,
      medicalHistoryJson,
      organsDamageJson,
      ocrFieldsJson: safeOcrFields,
      antibodyBlotsJson: draftRecord.antibodyBlots,
      eularAcrJson: {
        anaEntryCriterionMet: draftRecord.anaEntryCriterionMet,
        criteria: draftRecord.eularAcrCriteria,
      },
      sledai2kJson: draftRecord.sledai2kCriteria,
      lastUpdatedAt: now,
      profileId,
      studyIdEncrypted,
      patientNameEncrypted,
      icfSignedDateEncrypted,
      age: null,
      gender: null,
      heightCm: null,
      weightKg: null,
    },
    docs,
    input.utcOffsetMinutes
  );

  return {
    record: hydrated,
    dbSubmissionId: submissionId,
    submittedAtIso: now.toISOString(),
    ocrSummary: getOcrTierCounts(hydrated),
    pipelineStatus: "none",
  };
}

async function verifyPipelineReview(intakeId: string, user: AuthenticatedUserDTO): Promise<void> {
  const read = async <T,>(path: string, query = new URLSearchParams()): Promise<T> => {
    const result = await callPipeline("GET", path, query, null, user);
    if (result.status !== 200) throw new Error("Unable to verify the backend CRF.");
    return JSON.parse(new TextDecoder().decode(result.body)) as T;
  };
  const { jobs } = await read<{ jobs?: Parameters<typeof caseForIntake>[0] }>("/api/intakes");
  const caseId = caseForIntake(jobs, intakeId);
  if (!caseId) throw new AuthError(400, "No backend CRF is linked to this submission.");
  const view = await read<CrfView>("/api/crf", new URLSearchParams({ case_id: caseId }));
  if (!canFinalizeReview(withoutHidden(view))) {
    throw new AuthError(400, "Approve the remaining CRF cells before approving the dossier.");
  }
}

export async function updateSubmissionRecord(params: {
  user: AuthenticatedUserDTO;
  idOrKey: string;
  updatedRecord: SleCrfPatientRecord;
  utcOffsetMinutes?: number;
  db?: DatabaseClient;
}): Promise<SubmissionItemDTO | null> {
  if (params.user.role !== "specialist") {
    throw new AuthError(403, "Only clinical specialists may update CRF dossiers.");
  }

  const db = params.db ?? getDb();
  const lookupCondition = UUID_RE.test(params.idOrKey)
    ? or(
        eq(crfSubmissions.id, params.idOrKey),
        eq(crfSubmissions.legacyRecordKey, params.idOrKey)
      )
    : eq(crfSubmissions.legacyRecordKey, params.idOrKey);

  const [existing] = await db
    .select({
      submissionId: crfSubmissions.id,
      legacyRecordKey: crfSubmissions.legacyRecordKey,
      submittedAt: crfSubmissions.submittedAt,
      pipelineIntakeId: crfSubmissions.pipelineIntakeId,
      profileId: patientProfiles.id,
      studyIdEncrypted: patientProfiles.studyIdEncrypted,
      patientNameEncrypted: patientProfiles.patientNameEncrypted,
      icfSignedDateEncrypted: patientProfiles.icfSignedDateEncrypted,
      age: patientProfiles.age,
      gender: patientProfiles.gender,
      heightCm: patientProfiles.heightCm,
      weightKg: patientProfiles.weightKg,
    })
    .from(crfSubmissions)
    .innerJoin(
      patientProfiles,
      eq(crfSubmissions.patientProfileId, patientProfiles.id)
    )
    .where(lookupCondition)
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const next = params.updatedRecord;
  const nextStatus = next.submissionStatus ?? (next.signedOffBy ? "approved" : "pending_doctor_review");
  const isApproved = nextStatus === "approved";

  let saved: typeof crfSubmissions.$inferSelect | undefined;
  if (isApproved && existing.pipelineIntakeId) {
    // The pipeline owns the CRF for linked dossiers. Sign off without rewriting
    // the clinical record returned to the browser when the page first opened.
    const intakeId = existing.pipelineIntakeId;
    await verifyPipelineReview(intakeId, params.user);
    [saved] = await db
      .update(crfSubmissions)
      .set({
        status: "approved",
        signedOffByUserId: params.user.id,
        signedOffByName: params.user.name,
        signedOffRole: params.user.role,
        signedOffAt: now,
        lastUpdatedAt: now,
      })
      .where(and(
        eq(crfSubmissions.id, existing.submissionId),
        eq(crfSubmissions.pipelineIntakeId, intakeId),
        eq(crfSubmissions.status, "pending_doctor_review"),
      ))
      .returning();
    if (!saved) {
      [saved] = await db.select().from(crfSubmissions).where(and(
        eq(crfSubmissions.id, existing.submissionId),
        eq(crfSubmissions.pipelineIntakeId, intakeId),
        eq(crfSubmissions.status, "approved"),
      ));
      if (!saved) throw new AuthError(400, "The linked intake changed. Reload the dossier and try again.");
    }
  } else {
    const redactTokens = [next.patientName, next.studyId];
    const medicalHistoryJson = buildScrubbedMedicalHistory(next, redactTokens);
    const organsDamageJson = buildScrubbedOrgansDamage(next, redactTokens);
    const { safeOcrFields, hivStatusEncrypted } = encryptSensitiveOcrFields(
      next.ocrFields,
      existing.submissionId,
      redactTokens
    );

    const eularSummary = calculateEularAcrSummary(
      next.eularAcrCriteria,
      next.anaEntryCriterionMet
    );
    const sledaiSummary = calculateSledai2kSummary(next.sledai2kCriteria);

    [saved] = await db
      .update(crfSubmissions)
      .set({
        status: nextStatus,
        signedOffByUserId: isApproved ? params.user.id : null,
        signedOffByName: isApproved ? next.signedOffBy ?? params.user.name : null,
        signedOffRole: isApproved ? next.signedOffRole ?? params.user.role : null,
        signedOffAt: isApproved ? now : null,
        eularTotalScore: eularSummary.totalScore,
        eularClassifiedSle: eularSummary.isClassifiedSle,
        sledaiTotalScore: sledaiSummary.totalScore,
        sledaiActivityTier: sledaiSummary.activityTierEn,
        hivStatusEncrypted,
        medicalHistoryJson,
        organsDamageJson,
        ocrFieldsJson: safeOcrFields,
        antibodyBlotsJson: next.antibodyBlots,
        eularAcrJson: {
          anaEntryCriterionMet: next.anaEntryCriterionMet,
          criteria: next.eularAcrCriteria,
        },
        sledai2kJson: next.sledai2kCriteria,
        lastUpdatedAt: now,
      })
      .where(and(
        eq(crfSubmissions.id, existing.submissionId),
        existing.pipelineIntakeId ? eq(crfSubmissions.status, "pending_doctor_review") : undefined,
        isApproved ? isNull(crfSubmissions.pipelineIntakeId) : undefined,
      ))
      .returning();
    if (!saved && existing.pipelineIntakeId) {
      throw new AuthError(400, "The dossier has already been approved. Reload it before making changes.");
    }
  }

  if (!saved) return null;

  const docRows = await db
    .select({
      id: uploadedDocuments.id,
      fileName: uploadedDocuments.fileName,
      isImage: uploadedDocuments.isImage,
    })
    .from(uploadedDocuments)
    .where(eq(uploadedDocuments.submissionId, existing.submissionId))
    .orderBy(uploadedDocuments.position, uploadedDocuments.createdAt);

  const docs: UploadedDocFile[] = docRows.map((d) => ({
    id: d.id,
    name: d.fileName,
    url: null,
    isImage: d.isImage,
  }));

  const utcOffset = params.utcOffsetMinutes ?? 420;
  const hydrated = rehydrateSleCrfRecord(
    {
      submissionId: existing.submissionId,
      legacyRecordKey: existing.legacyRecordKey,
      status: saved.status,
      submittedAt: existing.submittedAt,
      signedOffByName: saved.signedOffByName,
      signedOffRole: saved.signedOffRole,
      hivStatusEncrypted: saved.hivStatusEncrypted,
      medicalHistoryJson: saved.medicalHistoryJson,
      organsDamageJson: saved.organsDamageJson,
      ocrFieldsJson: saved.ocrFieldsJson,
      antibodyBlotsJson: saved.antibodyBlotsJson,
      eularAcrJson: saved.eularAcrJson,
      sledai2kJson: saved.sledai2kJson,
      lastUpdatedAt: saved.lastUpdatedAt,
      profileId: existing.profileId,
      studyIdEncrypted: existing.studyIdEncrypted,
      patientNameEncrypted: existing.patientNameEncrypted,
      icfSignedDateEncrypted: existing.icfSignedDateEncrypted,
      age: existing.age,
      gender: existing.gender,
      heightCm: existing.heightCm,
      weightKg: existing.weightKg,
    },
    docs,
    utcOffset
  );

  return {
    record: hydrated,
    dbSubmissionId: existing.submissionId,
    submittedAtIso: existing.submittedAt.toISOString(),
    ocrSummary: getOcrTierCounts(hydrated),
    pipelineIntakeId: saved.pipelineIntakeId,
    pipelineStatus: saved.pipelineStatus,
    firstOpenedAt: saved.firstOpenedAt?.toISOString() ?? null,
  };
}
