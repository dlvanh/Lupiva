import { NextResponse } from "next/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { crfSubmissions, patientProfiles } from "@/db/schema";
import { AuthError, requireAuth } from "@/lib/auth";
import { decryptField } from "@/lib/crypto";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const LATEST_LIMIT = 5;

/** How many submissions no specialist has opened yet, and the newest few (with Study ID and name for the bell list). */
export async function GET(request: Request) {
  void request;
  try {
    await requireAuth(["specialist"]);
    const db = getDb();
    const unopened = and(eq(crfSubmissions.status, "pending_doctor_review"), isNull(crfSubmissions.firstOpenedAt));
    const [{ total }] = await db.select({ total: count() }).from(crfSubmissions).where(unopened);
    const latest = await db
      .select({
        id: crfSubmissions.id,
        submittedAt: crfSubmissions.submittedAt,
        profileId: patientProfiles.id,
        studyIdEncrypted: patientProfiles.studyIdEncrypted,
        patientNameEncrypted: patientProfiles.patientNameEncrypted,
      })
      .from(crfSubmissions)
      .innerJoin(patientProfiles, eq(crfSubmissions.patientProfileId, patientProfiles.id))
      .where(unopened)
      .orderBy(desc(crfSubmissions.submittedAt))
      .limit(LATEST_LIMIT);
    return NextResponse.json(
      {
        count: Number(total),
        latest: latest.map((row) => ({
          id: row.id,
          submittedAt: row.submittedAt.toISOString(),
          studyId: decryptField(row.studyIdEncrypted, `patient_profiles:${row.profileId}:study_id`),
          patientName: decryptField(row.patientNameEncrypted, `patient_profiles:${row.profileId}:patient_name`),
        })),
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("[Lupiva] new-count failed:", error);
    return NextResponse.json({ error: "Không đếm được hồ sơ mới." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
