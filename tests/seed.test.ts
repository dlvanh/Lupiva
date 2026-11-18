import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INITIAL_CRF_PATIENTS } from "@/data/crfData";
import { DEMO_USERS } from "@/data/mockData";
import {
  crfSubmissions,
  patientProfiles,
  uploadedDocuments,
  users,
} from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { decryptField, isEncryptedEnvelope } from "@/lib/crypto";
import {
  createTestDatabase,
  type TestDatabaseHandle,
} from "./helpers/pgliteTestDb";

describe("Lupiva Database Seed & Zone B PII Vault Verification", () => {
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

  it("seeds auth accounts idempotently with zero mock CRF dossiers", async () => {
    expect(INITIAL_CRF_PATIENTS).toHaveLength(0);

    const first = await seedDatabase(testDb.db);
    expect(first.usersSeeded).toBe(2);
    expect(first.profilesSeeded).toBe(0);
    expect(first.submissionsSeeded).toBe(0);
    expect(first.documentsSeeded).toBe(0);

    // Run seed a second time — must upsert cleanly with zero duplicate rows
    await seedDatabase(testDb.db);

    const userRows = await testDb.db.select().from(users);
    const profileRows = await testDb.db.select().from(patientProfiles);
    const submissionRows = await testDb.db.select().from(crfSubmissions);
    const docRows = await testDb.db.select().from(uploadedDocuments);

    expect(userRows).toHaveLength(2);
    expect(profileRows).toHaveLength(0);
    expect(submissionRows).toHaveLength(0);
    expect(docRows).toHaveLength(0);
  });

  it("encrypts Zone B PII columns on seeded user accounts", async () => {
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

      const decryptedEmail = decryptField(u.emailEncrypted, `users:${u.id}:email`);
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
  });
});
