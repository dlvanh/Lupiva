import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { crfSubmissions, users } from "@/db/schema";
import { DEFAULT_SUBMISSION_FILTERS } from "@/lib/submissionFilters";
import { markSubmissionOpened } from "@/lib/submissionOpened";
import {
  createPatientSubmission,
  querySubmissions,
  updateSubmissionRecord,
} from "@/lib/submissionsService";
import type { AuthenticatedUserDTO } from "@/lib/auth";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

let handle: TestDatabaseHandle;
let doctor: AuthenticatedUserDTO;

beforeAll(async () => {
  handle = await createTestDatabase();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.resetTables();
  const userId = crypto.randomUUID();
  await handle.db.insert(users).values({
    id: userId,
    emailEncrypted: "ciphertext",
    emailBlindIndex: `blind-${userId}`,
    fullNameEncrypted: "ciphertext",
    passwordHash: "hash",
    role: "specialist",
    title: "Dr",
    departmentOrRegistryId: "dept",
    badgeText: "badge",
  });
  doctor = {
    id: userId,
    name: "Bác sĩ Thử nghiệm",
    email: "doctor@example.test",
    role: "specialist",
    title: "Dr",
    departmentOrRegistryId: "dept",
    badgeText: "badge",
    consentSigned: true,
    consentSignedAt: null,
  };
});

const DAY = 24 * 60 * 60 * 1000;

async function submissionAt(ageDays: number) {
  const created = await createPatientSubmission({
    user: doctor,
    input: { utcOffsetMinutes: 420, files: [{ name: "sheet.jpg", mimeType: "image/jpeg", sizeBytes: 10, isImage: true }] },
  });
  await handle.db
    .update(crfSubmissions)
    .set({ submittedAt: new Date(Date.now() - ageDays * DAY) })
    .where(eq(crfSubmissions.id, created.dbSubmissionId));
  return created;
}

describe("specialist default sort: new first, unreviewed next, approved last", () => {
  it("groups by review state before upload date, newest within each group", async () => {
    const approvedNewest = await submissionAt(0);
    const openedMiddle = await submissionAt(1);
    const newOlder = await submissionAt(2);
    const newOldest = await submissionAt(3);

    await markSubmissionOpened({ user: doctor, submissionId: openedMiddle.dbSubmissionId });
    await updateSubmissionRecord({
      user: doctor,
      idOrKey: approvedNewest.dbSubmissionId,
      updatedRecord: { ...approvedNewest.record, submissionStatus: "approved" },
    });

    const result = await querySubmissions({
      user: doctor,
      filters: { ...DEFAULT_SUBMISSION_FILTERS, pageSize: 10 },
    });
    expect(result.items.map((item) => item.dbSubmissionId)).toEqual([
      newOlder.dbSubmissionId,
      newOldest.dbSubmissionId,
      openedMiddle.dbSubmissionId,
      approvedNewest.dbSubmissionId,
    ]);
    expect(result.stats).toMatchObject({ total: 4, new: 2, pending: 1, approved: 1 });
  });

  it("keeps the same order when an encrypted text search is active", async () => {
    const approvedNewest = await submissionAt(0);
    const newOlder = await submissionAt(2);
    await updateSubmissionRecord({
      user: doctor,
      idOrKey: approvedNewest.dbSubmissionId,
      updatedRecord: { ...approvedNewest.record, submissionStatus: "approved" },
    });

    const result = await querySubmissions({
      user: doctor,
      filters: { ...DEFAULT_SUBMISSION_FILTERS, pageSize: 10, q: "VN-" },
    });
    expect(result.items.map((item) => item.dbSubmissionId)).toEqual([
      newOlder.dbSubmissionId,
      approvedNewest.dbSubmissionId,
    ]);
  });

  it("explicit oldest sort stays a plain date order", async () => {
    const approvedNewest = await submissionAt(0);
    const newOldest = await submissionAt(3);
    await updateSubmissionRecord({
      user: doctor,
      idOrKey: approvedNewest.dbSubmissionId,
      updatedRecord: { ...approvedNewest.record, submissionStatus: "approved" },
    });

    const result = await querySubmissions({
      user: doctor,
      filters: { ...DEFAULT_SUBMISSION_FILTERS, pageSize: 10, sort: "oldest" },
    });
    expect(result.items.map((item) => item.dbSubmissionId)).toEqual([
      newOldest.dbSubmissionId,
      approvedNewest.dbSubmissionId,
    ]);
  });
});