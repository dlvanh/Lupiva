import crypto from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  INITIAL_CRF_PATIENTS,
  buildDefaultEularAcrCriteria,
  buildDefaultSledai2kCriteria,
  buildCardiovascularItems,
  buildGiItems,
  buildNeuropsychiatricItems,
  buildSkinMucosaItems,
  calculateBmiNumeric,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  type SleCrfPatientRecord,
  type UploadedDocFile,
} from "@/data/crfData";
import { DEMO_USERS } from "@/data/mockData";
import { getDb, type DatabaseClient } from "@/db";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
} from "@/db/schema";
import { AuthError, type AuthenticatedUserDTO } from "@/lib/auth";
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
  formatDateInOffset,
  getOcrTierCounts,
  resolveUploadedDateBounds,
  type OcrTierCounts,
  type PaginationMeta,
  type SubmissionQueryFilters,
} from "@/lib/submissionFilters";

export interface SubmissionItemDTO {
  record: SleCrfPatientRecord;
  dbSubmissionId: string;
  submittedAtIso: string;
  ocrSummary: OcrTierCounts;
}

export interface SubmissionStatsDTO {
  total: number;
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
  const roleScope = user.role;

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

  let pending = 0;
  let approved = 0;
  let manualRequiredDossiers = 0;
  for (const row of cohortSummaryRows) {
    if (row.status === "approved") approved += 1;
    else pending += 1;

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

  if (effectiveFilters.status !== "all") {
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
      ? [asc(crfSubmissions.submittedAt)]
      : [desc(crfSubmissions.submittedAt)];

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
      .orderBy(uploadedDocuments.createdAt);

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
      },
      submittedAtMs: row.submittedAt.getTime(),
      sledaiScore: row.sledaiTotalScore,
    });
  }

  let pagedItems: SubmissionItemDTO[];

  if (requiresPostDecryptionScan) {
    hydratedItems.sort((a, b) =>
      effectiveFilters.sort === "oldest"
        ? a.submittedAtMs - b.submittedAtMs
        : b.submittedAtMs - a.submittedAtMs
    );

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
  patientName: z.string().trim().min(1).max(120).optional(),
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
      ? user.name
      : input.patientName?.trim() || "Tran Thi Mai";

  const studyId =
    input.studyId?.trim() ||
    `VN-${String(1000 + crypto.randomInt(8999))}-${String(now.getFullYear()).slice(-2)}`;

  const template = INITIAL_CRF_PATIENTS[0];
  const profileId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const legacyRecordKey = `crf-up-${submissionId.slice(0, 8)}`;

  const ocrFields = template.ocrFields.map((f) => ({
    ...f,
    value: f.confidence < 80 ? "" : f.printedValue,
    secondaryValue: f.confidence < 80 ? "" : f.printedSecondaryValue,
    status:
      f.confidence > 90
        ? ("auto_approved" as const)
        : f.confidence >= 80
        ? ("needs_verify" as const)
        : ("manual_required" as const),
  }));

  const antibodyBlots = template.antibodyBlots.map((b) => ({
    ...b,
    result: b.confidence < 80 ? ("" as const) : b.printedResult,
    intensity: b.confidence < 80 ? "" : b.printedIntensity,
    status:
      b.confidence > 90
        ? ("auto_approved" as const)
        : fConfidence(b.confidence),
  }));

  function fConfidence(conf: number) {
    return conf >= 80 ? ("needs_verify" as const) : ("manual_required" as const);
  }

  const doctorName =
    user.role === "specialist" ? user.name : DEMO_USERS.specialist.name;

  const draftRecord: SleCrfPatientRecord = {
    ...template,
    id: legacyRecordKey,
    studyId,
    patientName,
    age: "32",
    gender: "Female",
    icfSignedDate: formatDateInOffset(now, input.utcOffsetMinutes),
    heightCm: "160",
    weightKg: "54.0",
    physician: doctorName,
    nurse: "RN. Le Thi Huong",
    submittedAt: undefined,
    submissionStatus: "pending_doctor_review",
    lastUpdated: "",
    signedOffBy: null,
    signedOffRole: null,
    malignantDisease: "NO",
    malignantSpecify: "",
    otherComorbidities: "NO",
    otherComorbiditiesSpecify: "",
    familyAutoimmuneHistory: "NO",
    familyRelatives: {
      Father: false,
      Mother: false,
      Brother: false,
      Sister: false,
      Child: false,
      Others: false,
    },
    familyDiseaseSpecify: "",
    fever: "NO",
    feverTempC: "",
    feverOnsetDate: "",
    feverType: "periodic",
    feverTypeSpecify: "",
    historyOfInfection: "NO",
    infectionEpisodes: [],
    treatmentStatus: "NO",
    treatments: [],
    skinMucosaAbnormality: "NO",
    skinMucosaItems: buildSkinMucosaItems(),
    muscleDamage: "NO",
    muscleBiopsyOther: "NO",
    muscleBiopsySpecify: "",
    jointsDamage: "NO",
    swollenJointsCount: "0",
    tenderJointsCount: "0",
    vasScore: "0",
    abnormalXray: "NO",
    abnormalXraySpecify: "",
    abnormalUltrasound: "NO",
    abnormalUltrasoundSpecify: "",
    jointDeformity: "NO",
    jointDeformitySpecify: "",
    jointsOther: "NO",
    jointsOtherSpecify: "",
    kidneysDamage: "NO",
    renalBiopsyPerformed: "NO",
    renalBiopsyNote: "",
    renalBiopsyClasses: [],
    kidneysOther: "NO",
    kidneysOtherSpecify: "",
    haematologicalDisorders: "NO",
    haematologicalSpecify: "",
    cardiovascularAbnormality: "NO",
    cardiovascularItems: buildCardiovascularItems(),
    lungDamage: "NO",
    lungIld: false,
    lungIldPatterns: [],
    lungPleuritis: false,
    lungPleuritisSpecify: "",
    lungOther: false,
    lungOtherSpecify: "",
    neuropsychiatricDisorders: "NO",
    neuropsychiatricItems: buildNeuropsychiatricItems(),
    giDisorders: "NO",
    giItems: buildGiItems(),
    ocrFields,
    antibodyBlots,
    anaEntryCriterionMet: true,
    eularAcrCriteria: buildDefaultEularAcrCriteria(),
    sledai2kCriteria: buildDefaultSledai2kCriteria(),
  };

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
      age: 32,
      gender: "Female",
      heightCm: 160,
      weightKg: 54.0,
      bmi: 21.1,
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

    for (const file of input.files) {
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
        ocrJobStatus: "completed",
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
      age: 32,
      gender: "Female",
      heightCm: 160,
      weightKg: 54.0,
    },
    docs,
    input.utcOffsetMinutes
  );

  return {
    record: hydrated,
    dbSubmissionId: submissionId,
    submittedAtIso: now.toISOString(),
    ocrSummary: getOcrTierCounts(hydrated),
  };
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

  const nextStatus =
    next.submissionStatus ??
    (next.signedOffBy ? "approved" : "pending_doctor_review");
  const isApproved = nextStatus === "approved";

  const parsedAge = Number.parseInt(next.age, 10);
  const nextAge =
    Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : existing.age;
  const nextGender: "Female" | "Male" =
    next.gender === "Male" ? "Male" : "Female";
  const parsedHeight = Number.parseFloat(next.heightCm);
  const nextHeightCm =
    Number.isFinite(parsedHeight) && parsedHeight > 0
      ? parsedHeight
      : existing.heightCm;
  const parsedWeight = Number.parseFloat(next.weightKg);
  const nextWeightKg =
    Number.isFinite(parsedWeight) && parsedWeight > 0
      ? parsedWeight
      : existing.weightKg;
  const nextBmi = calculateBmiNumeric(nextHeightCm, nextWeightKg);

  await db
    .update(patientProfiles)
    .set({
      age: nextAge,
      gender: nextGender,
      heightCm: nextHeightCm,
      weightKg: nextWeightKg,
      bmi: nextBmi,
      updatedAt: now,
    })
    .where(eq(patientProfiles.id, existing.profileId));

  await db
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
    .where(eq(crfSubmissions.id, existing.submissionId));

  const docRows = await db
    .select({
      id: uploadedDocuments.id,
      fileName: uploadedDocuments.fileName,
      isImage: uploadedDocuments.isImage,
    })
    .from(uploadedDocuments)
    .where(eq(uploadedDocuments.submissionId, existing.submissionId));

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
      status: nextStatus,
      submittedAt: existing.submittedAt,
      signedOffByName: isApproved ? next.signedOffBy ?? params.user.name : null,
      signedOffRole: isApproved ? next.signedOffRole ?? params.user.role : null,
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
      profileId: existing.profileId,
      studyIdEncrypted: existing.studyIdEncrypted,
      patientNameEncrypted: existing.patientNameEncrypted,
      icfSignedDateEncrypted: existing.icfSignedDateEncrypted,
      age: nextAge,
      gender: nextGender,
      heightCm: nextHeightCm,
      weightKg: nextWeightKg,
    },
    docs,
    utcOffset
  );

  return {
    record: hydrated,
    dbSubmissionId: existing.submissionId,
    submittedAtIso: existing.submittedAt.toISOString(),
    ocrSummary: getOcrTierCounts(hydrated),
  };
}
