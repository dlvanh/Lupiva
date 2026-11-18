import { existsSync } from "node:fs";
import { eq, inArray, like } from "drizzle-orm";
import { DEMO_USERS } from "@/data/mockData";
import { closeDb, getDb, type DatabaseClient } from "@/db";
import { crfSubmissions, patientProfiles, users } from "@/db/schema";
import {
  assertCryptoConfig,
  computeBlindIndex,
  encryptField,
  normalizeEmail,
} from "@/lib/crypto";
import { hashPassword } from "@/lib/password";

export const SEEDED_SPECIALIST_UUID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_PATIENT_UUID = "00000000-0000-4000-8000-000000000002";

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

  // Clean up any legacy seeded mock patient records (`crf-pat-%`) if present
  const mockSubs = await db
    .select({
      submissionId: crfSubmissions.id,
      profileId: crfSubmissions.patientProfileId,
    })
    .from(crfSubmissions)
    .where(like(crfSubmissions.legacyRecordKey, "crf-pat-%"));

  if (mockSubs.length > 0) {
    const profileIds = Array.from(new Set(mockSubs.map((m) => m.profileId)));
    await db
      .delete(patientProfiles)
      .where(inArray(patientProfiles.id, profileIds));
  }

  return {
    usersSeeded,
    profilesSeeded: 0,
    submissionsSeeded: 0,
    documentsSeeded: 0,
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
    `[Lupiva Seed] Complete: ${result.usersSeeded} users seeded (0 mock CRF dossiers).`
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
