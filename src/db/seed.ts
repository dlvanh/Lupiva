import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { DEMO_USERS } from "@/data/mockData";
import {
  INITIAL_CRF_PATIENTS,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
  type SleCrfPatientRecord,
} from "@/data/crfData";
import { closeDb, getDb, type DatabaseClient } from "@/db";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
  users,
  type CrfMedicalHistoryPayload,
  type CrfOrgansDamagePayload,
} from "@/db/schema";
import {
  assertCryptoConfig,
  computeBlindIndex,
  encryptField,
  normalizeEmail,
  normalizeStudyId,
} from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import {
  scrubCheckItems,
  scrubFreeText,
  scrubInfectionEpisodes,
  scrubTreatments,
  stripSensitiveOcrFields,
} from "@/lib/piiScrubber";

export const SEEDED_SPECIALIST_UUID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_PATIENT_UUID = "00000000-0000-4000-8000-000000000002";

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

function parseTimestampOrNow(value?: string): Date {
  if (!value) return new Date();
  const isoCandidate = value.replace(" ", "T").replace(" ICT", "+07:00");
  const withZone = isoCandidate.includes("+")
    ? isoCandidate
    : `${isoCandidate}:00+07:00`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildScrubbedMedicalHistory(
  pat: SleCrfPatientRecord,
  redactTokens: string[]
): CrfMedicalHistoryPayload {
  const opts = { redactTokens };
  return {
    physician: scrubFreeText(pat.physician, opts),
    nurse: scrubFreeText(pat.nurse, opts),
    malignantDisease: pat.malignantDisease,
    malignantSpecify: scrubFreeText(pat.malignantSpecify, opts),
    otherComorbidities: pat.otherComorbidities,
    otherComorbiditiesSpecify: scrubFreeText(pat.otherComorbiditiesSpecify, opts),
    familyAutoimmuneHistory: pat.familyAutoimmuneHistory,
    familyRelatives: pat.familyRelatives,
    familyDiseaseSpecify: scrubFreeText(pat.familyDiseaseSpecify, opts),
    fever: pat.fever,
    feverTempC: pat.feverTempC,
    feverOnsetDate: pat.feverOnsetDate,
    feverType: pat.feverType,
    feverTypeSpecify: scrubFreeText(pat.feverTypeSpecify, opts),
    historyOfInfection: pat.historyOfInfection,
    infectionEpisodes: scrubInfectionEpisodes(pat.infectionEpisodes, opts),
    treatmentStatus: pat.treatmentStatus,
    treatments: scrubTreatments(pat.treatments, opts),
  };
}

function buildScrubbedOrgansDamage(
  pat: SleCrfPatientRecord,
  redactTokens: string[]
): CrfOrgansDamagePayload {
  const opts = { redactTokens };
  return {
    skinMucosaAbnormality: pat.skinMucosaAbnormality,
    skinMucosaItems: scrubCheckItems(pat.skinMucosaItems, opts),
    muscleDamage: pat.muscleDamage,
    muscleBiopsyOther: pat.muscleBiopsyOther,
    muscleBiopsySpecify: scrubFreeText(pat.muscleBiopsySpecify, opts),
    jointsDamage: pat.jointsDamage,
    swollenJointsCount: pat.swollenJointsCount,
    tenderJointsCount: pat.tenderJointsCount,
    vasScore: pat.vasScore,
    abnormalXray: pat.abnormalXray,
    abnormalXraySpecify: scrubFreeText(pat.abnormalXraySpecify, opts),
    abnormalUltrasound: pat.abnormalUltrasound,
    abnormalUltrasoundSpecify: scrubFreeText(pat.abnormalUltrasoundSpecify, opts),
    jointDeformity: pat.jointDeformity,
    jointDeformitySpecify: scrubFreeText(pat.jointDeformitySpecify, opts),
    jointsOther: pat.jointsOther,
    jointsOtherSpecify: scrubFreeText(pat.jointsOtherSpecify, opts),
    kidneysDamage: pat.kidneysDamage,
    renalBiopsyPerformed: pat.renalBiopsyPerformed,
    renalBiopsyNote: scrubFreeText(pat.renalBiopsyNote, opts),
    renalBiopsyClasses: pat.renalBiopsyClasses,
    kidneysOther: pat.kidneysOther,
    kidneysOtherSpecify: scrubFreeText(pat.kidneysOtherSpecify, opts),
    haematologicalDisorders: pat.haematologicalDisorders,
    haematologicalSpecify: scrubFreeText(pat.haematologicalSpecify, opts),
    cardiovascularAbnormality: pat.cardiovascularAbnormality,
    cardiovascularItems: scrubCheckItems(pat.cardiovascularItems, opts),
    lungDamage: pat.lungDamage,
    lungIld: pat.lungIld,
    lungIldPatterns: pat.lungIldPatterns,
    lungPleuritis: pat.lungPleuritis,
    lungPleuritisSpecify: scrubFreeText(pat.lungPleuritisSpecify, opts),
    lungOther: pat.lungOther,
    lungOtherSpecify: scrubFreeText(pat.lungOtherSpecify, opts),
    neuropsychiatricDisorders: pat.neuropsychiatricDisorders,
    neuropsychiatricItems: scrubCheckItems(pat.neuropsychiatricItems, opts),
    giDisorders: pat.giDisorders,
    giItems: scrubCheckItems(pat.giItems, opts),
  };
}

export interface SeedResult {
  usersSeeded: number;
  profilesSeeded: number;
  submissionsSeeded: number;
  documentsSeeded: number;
  specialistId: string;
  patientId: string;
}

export async function seedDatabase(
  db: DatabaseClient = getDb()
): Promise<SeedResult> {
  assertCryptoConfig();

  const demoSpecs: Array<{
    defaultId: string;
    user: (typeof DEMO_USERS)["specialist"] | (typeof DEMO_USERS)["patient"];
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
  ];

  const resolvedUserIds: Record<"specialist" | "patient", string> = {
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

  for (const pat of INITIAL_CRF_PATIENTS) {
    const fixedIds = SEED_RECORD_IDS[pat.id];
    const normalizedStudyId = normalizeStudyId(pat.studyId);
    const studyIdBlindIndex = computeBlindIndex(normalizedStudyId, "study_id");

    const [existingProfile] = await db
      .select({ id: patientProfiles.id })
      .from(patientProfiles)
      .where(eq(patientProfiles.studyIdBlindIndex, studyIdBlindIndex))
      .limit(1);

    const profileId =
      existingProfile?.id ??
      fixedIds?.profileId ??
      "00000000-0000-4000-8000-000000000199";

    const heightCm = Number.parseFloat(pat.heightCm) || null;
    const weightKg = Number.parseFloat(pat.weightKg) || null;
    const bmi =
      heightCm && weightKg && heightCm > 0
        ? Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
        : null;

    const linkedUserId =
      pat.id === "crf-pat-084" ? resolvedUserIds.patient : null;

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

    const submissionId =
      existingSub?.id ??
      fixedIds?.submissionId ??
      "00000000-0000-4000-8000-000000000299";

    const redactTokens = [pat.patientName, pat.studyId];
    const { safeOcrFields, hivField } = stripSensitiveOcrFields(pat.ocrFields, {
      redactTokens,
    });

    const hivStatusEncrypted = hivField
      ? encryptField(
          JSON.stringify(hivField),
          `crf_submissions:${submissionId}:hiv_status`
        )
      : null;

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
          i === 0 && fixedIds?.docId
            ? fixedIds.docId
            : `00000000-0000-4000-8000-${String(400 + i).padStart(12, "0")}`;

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
  };
}

async function runCli() {
  const loadEnv = (process as unknown as { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (typeof loadEnv === "function") {
    if (existsSync(".env.local")) loadEnv(".env.local");
    if (existsSync(".env")) loadEnv(".env");
  }

  const result = await seedDatabase();
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
      console.error("[Lupiva Seed] Failed:", error);
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
