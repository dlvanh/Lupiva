import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INITIAL_CRF_PATIENTS, type CrfOcrField } from "@/data/crfData";
import { DEMO_USERS } from "@/data/mockData";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
  users,
} from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { decryptField, isEncryptedEnvelope } from "@/lib/crypto";
import { attachDecryptedHivField, isSensitiveHivOcrField } from "@/lib/piiScrubber";
import {
  createTestDatabase,
  type TestDatabaseHandle,
} from "./helpers/pgliteTestDb";

describe("Lupiva Database Seed & 3-Zone PII Vault Verification", () => {
  let testDb: TestDatabaseHandle;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    await testDb.resetTables();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("seeds demo accounts and baseline SLE e-CRF dossiers idempotently", async () => {
    const first = await seedDatabase(testDb.db);
    expect(first.usersSeeded).toBe(2);
    expect(first.profilesSeeded).toBe(INITIAL_CRF_PATIENTS.length);
    expect(first.submissionsSeeded).toBe(INITIAL_CRF_PATIENTS.length);

    const expectedDocsCount = INITIAL_CRF_PATIENTS.reduce(
      (sum, pat) => sum + (pat.uploadedFiles?.length ?? 0),
      0
    );
    expect(first.documentsSeeded).toBe(expectedDocsCount);

    // Run seed a second time — must upsert cleanly with zero duplicate rows
    await seedDatabase(testDb.db);

    const userRows = await testDb.db.select().from(users);
    const profileRows = await testDb.db.select().from(patientProfiles);
    const submissionRows = await testDb.db.select().from(crfSubmissions);
    const docRows = await testDb.db.select().from(uploadedDocuments);

    expect(userRows).toHaveLength(2);
    expect(profileRows).toHaveLength(INITIAL_CRF_PATIENTS.length);
    expect(submissionRows).toHaveLength(INITIAL_CRF_PATIENTS.length);
    expect(docRows).toHaveLength(expectedDocsCount);
  });

  it("encrypts Zone B PII columns and strips HIV Ag/Ab from Zone C JSONB at rest", async () => {
    await seedDatabase(testDb.db);

    const userRows = await testDb.db.select().from(users);
    const serializedUsers = JSON.stringify(userRows);
    expect(serializedUsers).not.toContain(DEMO_USERS.specialist.email);
    expect(serializedUsers).not.toContain(DEMO_USERS.specialist.name);
    expect(serializedUsers).not.toContain(DEMO_USERS.patient.email);
    expect(serializedUsers).not.toContain(DEMO_USERS.patient.name);
    expect(serializedUsers).not.toContain("VinmecSLE#2026");

    for (const u of userRows) {
      expect(isEncryptedEnvelope(u.emailEncrypted)).toBe(true);
      expect(isEncryptedEnvelope(u.fullNameEncrypted)).toBe(true);
      expect(u.passwordHash.startsWith("scrypt$")).toBe(true);

      const decryptedEmail = decryptField(u.emailEncrypted!, `users:${u.id}:email`);
      const decryptedName = decryptField(
        u.fullNameEncrypted,
        `users:${u.id}:full_name`
      );
      expect([
        DEMO_USERS.specialist.email.toLowerCase(),
        DEMO_USERS.patient.email.toLowerCase(),
      ]).toContain(decryptedEmail);
      expect([DEMO_USERS.specialist.name, DEMO_USERS.patient.name]).toContain(
        decryptedName
      );
    }

    const profileRows = await testDb.db.select().from(patientProfiles);
    const serializedProfiles = JSON.stringify(profileRows);
    for (const pat of INITIAL_CRF_PATIENTS) {
      expect(serializedProfiles).not.toContain(pat.studyId);
      expect(serializedProfiles).not.toContain(pat.patientName);
      expect(serializedProfiles).not.toContain(pat.icfSignedDate);
    }

    for (const p of profileRows) {
      expect(isEncryptedEnvelope(p.studyIdEncrypted)).toBe(true);
      expect(isEncryptedEnvelope(p.patientNameEncrypted)).toBe(true);
      expect(isEncryptedEnvelope(p.icfSignedDateEncrypted)).toBe(true);

      const decryptedStudyId = decryptField(
        p.studyIdEncrypted,
        `patient_profiles:${p.id}:study_id`
      );
      expect(INITIAL_CRF_PATIENTS.map((pat) => pat.studyId)).toContain(
        decryptedStudyId
      );
    }

    const submissionRows = await testDb.db.select().from(crfSubmissions);
    const vn084Sub = submissionRows.find(
      (s) => s.legacyRecordKey === "crf-pat-084"
    );
    expect(vn084Sub).toBeDefined();

    // HIV Ag/Ab must NOT appear in plain ocrFieldsJson
    expect(
      vn084Sub!.ocrFieldsJson.some((field) => isSensitiveHivOcrField(field))
    ).toBe(false);
    expect(JSON.stringify(vn084Sub!.ocrFieldsJson)).not.toContain("HIV-AGAB");

    // HIV Ag/Ab must be encrypted in hivStatusEncrypted and decrypt cleanly with row AAD
    expect(isEncryptedEnvelope(vn084Sub!.hivStatusEncrypted)).toBe(true);
    const decryptedHiv = JSON.parse(
      decryptField(
        vn084Sub!.hivStatusEncrypted!,
        `crf_submissions:${vn084Sub!.id}:hiv_status`
      )
    ) as CrfOcrField;
    expect(decryptedHiv.code).toBe("HIV-AGAB");

    const rehydratedFields = attachDecryptedHivField(
      vn084Sub!.ocrFieldsJson,
      decryptedHiv
    );
    expect(rehydratedFields.some((f) => f.code === "HIV-AGAB")).toBe(true);
  });
});
