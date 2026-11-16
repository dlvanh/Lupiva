import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedDatabase } from "@/db/seed";
import { crfSubmissions, users } from "@/db/schema";
import type { AuthenticatedUserDTO } from "@/lib/auth";
import {
  automaticPlans,
  intakeStatus,
  refreshPipelineStatuses,
  sendToPipeline,
  startSubmissionPipeline,
  type IntakeImage,
  type PipelineCall,
} from "@/lib/intakeOrchestrator";
import { createPatientSubmission, patientStage, querySubmissions, toPatientStatus } from "@/lib/submissionsService";
import { UploadError, storeSubmissionImage } from "@/lib/submissionUploads";
import { submissionQuerySchema } from "@/lib/submissionFilters";
import { createTestDatabase, type TestDatabaseHandle } from "./helpers/pgliteTestDb";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("synthetic-lab-page")]);
const AUTO_PLAN = { sha256: "a".repeat(64), crop: [0, 10, 100, 200], masks: [], mask_polygons: [], automatic: true, reviewed: true };

/** A fake backend: records every call; proposals finish after one poll. */
function fakeBackend(options: { automatic?: boolean; finalStatus?: string } = {}) {
  const calls: { method: string; path: string; query: Record<string, string>; json?: Record<string, unknown> }[] = [];
  const call: PipelineCall = async (method, pathName, query = {}, body) => {
    calls.push({ method, path: pathName, query, json: body?.json });
    if (pathName === "/api/privacy-proposals" && method === "POST") return { job_id: "privacy-1", status: "queued" };
    if (pathName === "/api/privacy-proposals") {
      return { job_id: query.job_id, status: "completed", automatic_plan: options.automatic === false ? null : AUTO_PLAN };
    }
    if (pathName === "/api/intakes" && method === "POST") return { status: "created", job: { job_id: "intake-abc" } };
    if (pathName === "/api/intakes") return { jobs: [{ job_id: "intake-abc", status: options.finalStatus ?? "completed" }] };
    return { status: "ok" };
  };
  return { call, calls };
}

const image: IntakeImage = { fileId: "doc-1", mime: "image/png", sha256: "a".repeat(64), bytes: PNG };
const noSleep = { sleep: async () => {}, pollMs: 0 };

describe("backend hand-off rules", () => {
  it("sends nothing when any image needs a person to review the masking", async () => {
    const backend = fakeBackend({ automatic: false });
    expect(await sendToPipeline("s-1", [image], backend.call, noSleep)).toEqual({ status: "privacy_review" });
    expect(backend.calls.some((c) => c.path.startsWith("/api/intakes"))).toBe(false);
  });

  it("creates, uploads and starts an intake with the automatic plans and document-id filenames", async () => {
    const backend = fakeBackend();
    expect(await automaticPlans([image], backend.call, noSleep)).toEqual([AUTO_PLAN]);
    const result = await sendToPipeline("s-1", [image], backend.call, { ...noSleep, engine: "gemini" });
    expect(result).toEqual({ status: "processing", intakeId: "intake-abc" });
    const create = backend.calls.find((c) => c.path === "/api/intakes" && c.method === "POST");
    expect(create?.json).toMatchObject({ request_id: "next-s-1", file_count: 1, same_patient: true, engine: "gemini", privacy: [AUTO_PLAN] });
    const upload = backend.calls.find((c) => c.path === "/api/intakes/image");
    expect(upload?.query).toEqual({ job_id: "intake-abc", file_id: "doc-1", name: "doc-1.png" });
    expect(backend.calls.at(-1)?.path).toBe("/api/intakes/start");
  });

  it("asks the backend to retry an intake that already failed", async () => {
    const backend = fakeBackend();
    const call: PipelineCall = async (method, pathName, query, body) =>
      pathName === "/api/intakes" && method === "POST"
        ? { status: "already_created", job: { job_id: "intake-abc", status: "failed" } }
        : backend.call(method, pathName, query, body);
    await sendToPipeline("s-1", [image], call, noSleep);
    expect(backend.calls.at(-1)).toMatchObject({ path: "/api/intakes/start", json: { job_id: "intake-abc", retry: true } });
  });

  it("maps backend job states to coarse statuses and patient stages", () => {
    expect(intakeStatus("queued")).toBe("processing");
    expect(intakeStatus("completed")).toBe("completed");
    expect(intakeStatus("needs_attention")).toBe("failed");
    expect(patientStage("privacy_review", "pending_doctor_review")).toBe("awaiting_doctor");
    expect(patientStage("failed", "pending_doctor_review")).toBe("awaiting_doctor");
    expect(patientStage("completed", "pending_doctor_review")).toBe("extracted");
    expect(patientStage("processing", "approved")).toBe("approved");
  });
});

describe("patient submission to backend (database)", () => {
  let testDb: TestDatabaseHandle;
  let patient: AuthenticatedUserDTO;
  const uploadDir = mkdtempSync(path.join(tmpdir(), "lupiva-uploads-"));

  async function demoUser(role: "patient" | "specialist"): Promise<AuthenticatedUserDTO> {
    const [row] = await testDb.db.select().from(users).where(eq(users.role, role));
    return {
      id: row.id,
      name: role === "patient" ? "Demo Patient" : "Demo Doctor",
      email: `${role}@example.test`,
      role,
      title: "",
      departmentOrRegistryId: "",
      badgeText: "",
      consentSigned: true,
      consentSignedAt: null,
    };
  }

  beforeAll(async () => {
    process.env.UPLOAD_DIR = uploadDir;
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    await testDb.resetTables();
    await seedDatabase(testDb.db);
    patient = await demoUser("patient");
  });

  afterAll(async () => {
    await testDb.close();
  });

  async function newSubmission() {
    return createPatientSubmission({
      user: patient,
      db: testDb.db,
      input: {
        utcOffsetMinutes: 420,
        files: [{ name: "Nguyen Van A - xet nghiem.png", mimeType: "image/png", sizeBytes: PNG.length, isImage: true }],
      },
    });
  }

  it("stores only ciphertext, refuses other accounts and non-images", async () => {
    const created = await newSubmission();
    const documentId = created.record.uploadedFiles![0].id;
    const stranger = { ...patient, id: crypto.randomUUID() };
    await expect(
      storeSubmissionImage({ user: stranger, submissionId: created.dbSubmissionId, documentId, bytes: PNG, db: testDb.db }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      storeSubmissionImage({ user: patient, submissionId: created.dbSubmissionId, documentId, bytes: Buffer.from("%PDF-1.7"), db: testDb.db }),
    ).rejects.toBeInstanceOf(UploadError);
    await storeSubmissionImage({ user: patient, submissionId: created.dbSubmissionId, documentId, bytes: PNG, db: testDb.db });
    expect(readdirSync(uploadDir)).toContain(`${documentId}.bin`);
    expect(readFileSync(path.join(uploadDir, `${documentId}.bin`)).includes(Buffer.from("synthetic-lab-page"))).toBe(false);
  });

  it("hands the stored image to the backend once and shows the patient only a stage", async () => {
    const created = await newSubmission();
    const documentId = created.record.uploadedFiles![0].id;
    await storeSubmissionImage({ user: patient, submissionId: created.dbSubmissionId, documentId, bytes: PNG, db: testDb.db });

    const backend = fakeBackend({ finalStatus: "completed" });
    expect(await startSubmissionPipeline(created.dbSubmissionId, { db: testDb.db, call: backend.call, ...noSleep })).toBe("processing");
    // A second send does nothing: the submission was already claimed.
    expect(await startSubmissionPipeline(created.dbSubmissionId, { db: testDb.db, call: backend.call, ...noSleep })).toBe("none");
    const upload = backend.calls.find((c) => c.path === "/api/intakes/image");
    expect(upload?.query.name).toBe(`${documentId}.png`);
    expect(JSON.stringify(backend.calls)).not.toContain("Nguyen");

    expect(await refreshPipelineStatuses({ db: testDb.db, call: backend.call })).toBe(1);
    const [row] = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.id, created.dbSubmissionId));
    expect(row.pipelineStatus).toBe("completed");
    expect(row.pipelineIntakeId).toBe("intake-abc");

    const listing = await querySubmissions({ user: patient, db: testDb.db, filters: submissionQuerySchema.parse({ utcOffsetMinutes: 420 }) });
    const mine = listing.items.map(toPatientStatus).find((item) => item.dbSubmissionId === created.dbSubmissionId);
    expect(mine?.record.processingStage).toBe("extracted");
    expect(mine?.record).not.toHaveProperty("ocrFields");
  });

  it("records a backend failure for the doctor without exposing it to the patient", async () => {
    const created = await newSubmission();
    const documentId = created.record.uploadedFiles![0].id;
    await storeSubmissionImage({ user: patient, submissionId: created.dbSubmissionId, documentId, bytes: PNG, db: testDb.db });
    const failing: PipelineCall = async () => {
      throw new Error("backend down");
    };
    expect(await startSubmissionPipeline(created.dbSubmissionId, { db: testDb.db, call: failing, ...noSleep })).toBe("failed");
    const [row] = await testDb.db.select().from(crfSubmissions).where(eq(crfSubmissions.id, created.dbSubmissionId));
    expect(row.pipelineError).toBe("backend down");
    const status = toPatientStatus({ ...created, pipelineStatus: "failed", pipelineError: "backend down" });
    expect(status.record.processingStage).toBe("awaiting_doctor");
    expect(JSON.stringify(status)).not.toContain("backend down");
  });
});
