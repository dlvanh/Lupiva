import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { DEMO_USERS } from "@/data/mockData";
import {
  INITIAL_CRF_PATIENTS,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";
import { closeDb, getDb, type DatabaseClient } from "@/db";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
  users,
} from "@/db/schema";
import {
  buildScrubbedMedicalHistory,
  buildScrubbedOrgansDamage,
  encryptSensitiveOcrFields,
} from "@/lib/crfPersistence";
import {
  assertCryptoConfig,
  computeBlindIndex,
  encryptField,
  normalizeEmail,
  normalizeStudyId,
} from "@/lib/crypto";
import { hashPassword } from "@/lib/password";

export const SEEDED_SPECIALIST_UUID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_PATIENT_UUID = "00000000-0000-4000-8000-000000000002";
export const SEEDED_ADMIN_UUID = "00000000-0000-4000-8000-000000000003";

const PATIENT_LINKED_KEYS = new Set(["crf-pat-084", "crf-pat-103", "crf-pat-108"]);

const SEED_RECORD_IDS: Record<
  string,
  { profileId: string; submissionId: string; docId: string; linkedUserId?: string }
> = {
  "crf-pat-084": {
    profileId: "00000000-0000-4000-8000-000000000101",
    submissionId: "00000000-0000-4000-8000-000000000201",
    docId: "00000000-0000-4000-8000-000000000301",
    linkedUserId: SEEDED_PATIENT_UUID,
  },
  "crf-pat-102": {
    profileId: "00000000-0000-4000-8000-000000000102",
    submissionId: "00000000-0000-4000-8000-000000000202",
    docId: "00000000-0000-4000-8000-000000000302",
  },
};

function resolveDeterministicIds(recordKey: string, patIdx: number) {
  const mapped = SEED_RECORD_IDS[recordKey];
  const slot = 101 + patIdx;
  return {
    profileId:
      mapped?.profileId ??
      `00000000-0000-4000-8000-${String(slot).padStart(12, "0")}`,
    submissionId:
      mapped?.submissionId ??
      `00000000-0000-4000-8000-${String(100 + slot).padStart(12, "0")}`,
    firstDocId:
      mapped?.docId ??
      `00000000-0000-4000-8000-${String(200 + slot).padStart(12, "0")}`,
  };
}

function parseTimestampOrNow(value?: string): Date {
  if (!value) return new Date();
  const ddmmyyyyMatch = value
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?:\s+ICT)?$/);
  if (ddmmyyyyMatch) {
    const [, dd, mm, yyyy, hh, min] = ddmmyyyyMatch;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const isoCandidate = value.replace(" ", "T").replace(" ICT", "+07:00");
  const withZone = isoCandidate.includes("+")
    ? isoCandidate
    : `${isoCandidate}:00+07:00`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export interface SeedResult {
  usersSeeded: number;
  profilesSeeded: number;
  submissionsSeeded: number;
  documentsSeeded: number;
  specialistId: string;
  patientId: string;
  adminId?: string;
}

export async function seedDatabase(
  db: DatabaseClient = getDb(),
  // Sample (fictional) cases are for tests and local demos only; a pilot
  // database must start with the accounts alone.
  { sampleCases = true, includeAdmin = false }: { sampleCases?: boolean; includeAdmin?: boolean } = {}
): Promise<SeedResult> {
  assertCryptoConfig();

  const demoSpecs: Array<{
    defaultId: string;
    user: (typeof DEMO_USERS)["specialist"] | (typeof DEMO_USERS)["patient"] | (typeof DEMO_USERS)["admin"];
    defaultPassword: string;
  }> = [
    {
      defaultId: SEEDED_SPECIALIST_UUID,
      user: DEMO_USERS.specialist,
      defaultPassword: DEMO_USERS.specialist.passwordHint ?? "VinmecSLE#2026",
    },
    {
      defaultId: SEEDED_PATIENT_UUID,
      user: DEMO_USERS.patient,
      defaultPassword: DEMO_USERS.patient.passwordHint ?? "PatientCare#2026",
    },
    ...(includeAdmin
      ? [
          {
            defaultId: SEEDED_ADMIN_UUID,
            user: DEMO_USERS.admin,
            defaultPassword: DEMO_USERS.admin.passwordHint ?? "AdminVault#2026",
          },
        ]
      : []),
  ];

  const resolvedUserIds: { specialist: string; patient: string; admin?: string } = {
    specialist: SEEDED_SPECIALIST_UUID,
    patient: SEEDED_PATIENT_UUID,
  };

  let usersSeeded = 0;

  for (const spec of demoSpecs) {
    const normalizedEmail = normalizeEmail(spec.user.email);
    const emailBlindIndex = computeBlindIndex(normalizedEmail, "email");

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailBlindIndex, emailBlindIndex))
      .limit(1);

    const userId = existingUser?.id ?? spec.defaultId;
    resolvedUserIds[spec.user.role] = userId;

    const emailEncrypted = encryptField(normalizedEmail, `users:${userId}:email`);
    const fullNameEncrypted = encryptField(
      spec.user.name,
      `users:${userId}:full_name`
    );
    const passwordHash = await hashPassword(spec.defaultPassword);
    const now = new Date();

    await db
      .insert(users)
      .values({
        id: userId,
        emailEncrypted,
        emailBlindIndex,
        fullNameEncrypted,
        passwordHash,
        role: spec.user.role,
        title: spec.user.title,
        departmentOrRegistryId: spec.user.departmentOrRegistryId,
        badgeText: spec.user.badgeText,
        consentSigned: spec.user.consentSigned,
        consentSignedAt: spec.user.consentSigned ? now : null,
        isActive: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          emailEncrypted,
          fullNameEncrypted,
          passwordHash,
          role: spec.user.role,
          title: spec.user.title,
          departmentOrRegistryId: spec.user.departmentOrRegistryId,
          badgeText: spec.user.badgeText,
          consentSigned: spec.user.consentSigned,
          isActive: true,
          updatedAt: now,
        },
      });

    usersSeeded += 1;
  }

  let profilesSeeded = 0;
  let submissionsSeeded = 0;
  let documentsSeeded = 0;

  const samplePatients = sampleCases ? INITIAL_CRF_PATIENTS : [];
  for (let patIdx = 0; patIdx < samplePatients.length; patIdx += 1) {
    const pat = samplePatients[patIdx];
    const deterministicIds = resolveDeterministicIds(pat.id, patIdx);
    const normalizedStudyId = normalizeStudyId(pat.studyId);
    const studyIdBlindIndex = computeBlindIndex(normalizedStudyId, "study_id");

    const [existingProfile] = await db
      .select({ id: patientProfiles.id })
      .from(patientProfiles)
      .where(eq(patientProfiles.studyIdBlindIndex, studyIdBlindIndex))
      .limit(1);

    const profileId = existingProfile?.id ?? deterministicIds.profileId;

    const heightCm = Number.parseFloat(pat.heightCm) || null;
    const weightKg = Number.parseFloat(pat.weightKg) || null;
    const bmi =
      heightCm && weightKg && heightCm > 0
        ? Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
        : null;

    const linkedUserId = PATIENT_LINKED_KEYS.has(pat.id)
      ? resolvedUserIds.patient
      : null;

    const studyIdEncrypted = encryptField(
      pat.studyId,
      `patient_profiles:${profileId}:study_id`
    );
    const patientNameEncrypted = encryptField(
      pat.patientName,
      `patient_profiles:${profileId}:patient_name`
    );
    const icfSignedDateEncrypted = encryptField(
      pat.icfSignedDate,
      `patient_profiles:${profileId}:icf_signed_date`
    );

    await db
      .insert(patientProfiles)
      .values({
        id: profileId,
        userId: linkedUserId,
        studyIdEncrypted,
        studyIdBlindIndex,
        patientNameEncrypted,
        icfSignedDateEncrypted,
        age: Number.parseInt(pat.age, 10) || 0,
        gender: pat.gender,
        heightCm,
        weightKg,
        bmi,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: patientProfiles.id,
        set: {
          userId: linkedUserId,
          studyIdEncrypted,
          patientNameEncrypted,
          icfSignedDateEncrypted,
          age: Number.parseInt(pat.age, 10) || 0,
          gender: pat.gender,
          heightCm,
          weightKg,
          bmi,
          updatedAt: new Date(),
        },
      });
    profilesSeeded += 1;

    const [existingSub] = await db
      .select({ id: crfSubmissions.id })
      .from(crfSubmissions)
      .where(eq(crfSubmissions.legacyRecordKey, pat.id))
      .limit(1);

    const submissionId = existingSub?.id ?? deterministicIds.submissionId;

    const redactTokens = [pat.patientName, pat.studyId];
    const { safeOcrFields, hivStatusEncrypted } = encryptSensitiveOcrFields(
      pat.ocrFields,
      submissionId,
      redactTokens
    );

    const eularSummary = calculateEularAcrSummary(
      pat.eularAcrCriteria,
      pat.anaEntryCriterionMet
    );
    const sledaiSummary = calculateSledai2kSummary(pat.sledai2kCriteria);
    const status = getSubmissionStatus(pat);
    const submittedAt = parseTimestampOrNow(pat.submittedAt);
    const lastUpdatedAt = parseTimestampOrNow(pat.lastUpdated);
    const isApproved = status === "approved";

    const medicalHistoryJson = buildScrubbedMedicalHistory(pat, redactTokens);
    const organsDamageJson = buildScrubbedOrgansDamage(pat, redactTokens);
    const eularAcrJson = {
      anaEntryCriterionMet: pat.anaEntryCriterionMet,
      criteria: pat.eularAcrCriteria,
    };

    await db
      .insert(crfSubmissions)
      .values({
        id: submissionId,
        legacyRecordKey: pat.id,
        patientProfileId: profileId,
        assignedSpecialistId: resolvedUserIds.specialist,
        status,
        submittedAt,
        signedOffByUserId: isApproved ? resolvedUserIds.specialist : null,
        signedOffByName: pat.signedOffBy,
        signedOffRole: pat.signedOffRole,
        signedOffAt: isApproved ? lastUpdatedAt : null,
        eularTotalScore: eularSummary.totalScore,
        eularClassifiedSle: eularSummary.isClassifiedSle,
        sledaiTotalScore: sledaiSummary.totalScore,
        sledaiActivityTier: sledaiSummary.activityTierEn,
        hivStatusEncrypted,
        medicalHistoryJson,
        organsDamageJson,
        ocrFieldsJson: safeOcrFields,
        antibodyBlotsJson: pat.antibodyBlots,
        eularAcrJson,
        sledai2kJson: pat.sledai2kCriteria,
        lastUpdatedAt,
      })
      .onConflictDoUpdate({
        target: crfSubmissions.id,
        set: {
          patientProfileId: profileId,
          assignedSpecialistId: resolvedUserIds.specialist,
          status,
          submittedAt,
          signedOffByUserId: isApproved ? resolvedUserIds.specialist : null,
          signedOffByName: pat.signedOffBy,
          signedOffRole: pat.signedOffRole,
          signedOffAt: isApproved ? lastUpdatedAt : null,
          eularTotalScore: eularSummary.totalScore,
          eularClassifiedSle: eularSummary.isClassifiedSle,
          sledaiTotalScore: sledaiSummary.totalScore,
          sledaiActivityTier: sledaiSummary.activityTierEn,
          hivStatusEncrypted,
          medicalHistoryJson,
          organsDamageJson,
          ocrFieldsJson: safeOcrFields,
          antibodyBlotsJson: pat.antibodyBlots,
          eularAcrJson,
          sledai2kJson: pat.sledai2kCriteria,
          lastUpdatedAt,
        },
      });
    submissionsSeeded += 1;

    if (pat.uploadedFiles && pat.uploadedFiles.length > 0) {
      for (let i = 0; i < pat.uploadedFiles.length; i += 1) {
        const file = pat.uploadedFiles[i];
        const docId =
          i === 0
            ? deterministicIds.firstDocId
            : `00000000-0000-4000-8000-${String(1000 + patIdx * 20 + i).padStart(
                12,
                "0"
              )}`;

        await db
          .insert(uploadedDocuments)
          .values({
            id: docId,
            submissionId,
            uploadedByUserId: linkedUserId,
            fileName: file.name,
            mimeType: file.isImage ? "image/png" : "application/pdf",
            sizeBytes: 0,
            isImage: file.isImage,
            storageProvider: "sample",
            storageKey: `sample/${submissionId}/${file.name}`,
            ocrJobStatus: "completed",
          })
          .onConflictDoUpdate({
            target: uploadedDocuments.id,
            set: {
              submissionId,
              uploadedByUserId: linkedUserId,
              fileName: file.name,
              mimeType: file.isImage ? "image/png" : "application/pdf",
              isImage: file.isImage,
              storageProvider: "sample",
              storageKey: `sample/${submissionId}/${file.name}`,
              ocrJobStatus: "completed",
            },
          });
        documentsSeeded += 1;
      }
    }
  }

  return {
    usersSeeded,
    profilesSeeded,
    submissionsSeeded,
    documentsSeeded,
    specialistId: resolvedUserIds.specialist,
    patientId: resolvedUserIds.patient,
    ...(resolvedUserIds.admin ? { adminId: resolvedUserIds.admin } : {}),
  };
}

async function runCli() {
  const loadEnv = (process as unknown as { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (typeof loadEnv === "function") {
    if (existsSync(".env.local")) loadEnv(".env.local");
    if (existsSync(".env")) loadEnv(".env");
  }

  const result = await seedDatabase(undefined, { includeAdmin: true });
  console.log(
    `[Lupiva Seed] Complete: ${result.usersSeeded} users, ${result.profilesSeeded} patient profiles, ${result.submissionsSeeded} CRF submissions, ${result.documentsSeeded} document records.`
  );
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectExecution) {
  runCli()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (error) => {
      const errObj = error as { code?: unknown; cause?: { code?: unknown } } | null;
      const pgCode = String(errObj?.code ?? errObj?.cause?.code ?? "");
      if (pgCode === "42703" || pgCode === "42P01") {
        console.error(
          '[Lupiva Seed] Database schema is missing or out of date. Run "npm run db:push" (or "npx tsx scripts/db-init.mts") before "npm run db:seed".'
        );
      }
      console.error("[Lupiva Seed] Failed:", error);
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
