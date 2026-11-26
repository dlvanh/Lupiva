/**
 * Renumber every patient profile to SLER-001, SLER-002, … by creation time (oldest first),
 * then move study_id_seq past the last number so new submissions continue the series.
 * Run after deploy/migrations/20261126-study-id-seq.sql. Back the database up first.
 * Usage: DATABASE_URL=... npx tsx scripts/renumber-study-ids.mts [--apply]
 * Without --apply it only prints the old → new mapping.
 */
import { asc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { crfSubmissions, patientProfiles } from "@/db/schema";
import { assertCryptoConfig, computeBlindIndex, decryptField, encryptField, normalizeStudyId } from "@/lib/crypto";
import { formatStudyId } from "@/lib/submissionsService";

assertCryptoConfig();
const apply = process.argv.includes("--apply");
const db = getDb();
const rows = await db
  .select({ id: patientProfiles.id, studyIdEncrypted: patientProfiles.studyIdEncrypted, createdAt: patientProfiles.createdAt })
  .from(patientProfiles)
  .orderBy(asc(patientProfiles.createdAt), asc(patientProfiles.id));

// Only profiles that still have a submission (listed on the dashboard) get SLER numbers;
// profiles whose submissions were removed keep a unique, clearly retired REMOVED-n.
const listed = new Set(
  (await db.selectDistinct({ id: crfSubmissions.patientProfileId }).from(crfSubmissions)).map((row) => row.id)
);
const kept = rows.filter((row) => listed.has(row.id));
const retired = rows.filter((row) => !listed.has(row.id));
const plan = [...kept, ...retired].map((row, index) => ({
  id: row.id,
  from: decryptField(row.studyIdEncrypted, `patient_profiles:${row.id}:study_id`),
  to: index < kept.length ? formatStudyId(index + 1) : `REMOVED-${index - kept.length + 1}`,
  createdAt: row.createdAt.toISOString(),
}));
for (const item of plan) console.log(`${item.createdAt}  ${item.from} -> ${item.to}`);

if (apply) {
  await db.transaction(async (tx) => {
    // Two passes so a new number never collides with an old one still in the unique index.
    for (const item of plan) {
      await tx.update(patientProfiles).set({ studyIdBlindIndex: `renumber-${item.id}` }).where(eq(patientProfiles.id, item.id));
    }
    for (const item of plan) {
      await tx
        .update(patientProfiles)
        .set({
          studyIdEncrypted: encryptField(item.to, `patient_profiles:${item.id}:study_id`),
          studyIdBlindIndex: computeBlindIndex(normalizeStudyId(item.to), "study_id"),
          updatedAt: new Date(),
        })
        .where(eq(patientProfiles.id, item.id));
    }
    if (kept.length) await tx.execute(sql`SELECT setval('study_id_seq', ${kept.length}, true)`);
  });
  console.log(`Renumbered ${plan.length} profiles; next Study ID is ${formatStudyId(kept.length + 1)}.`);
} else {
  console.log("Dry run: nothing written. Re-run with --apply.");
}
await closeDb();
