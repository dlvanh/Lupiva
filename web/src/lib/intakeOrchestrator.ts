/**
 * Sends a patient's stored images to the Python OCR/CRF backend.
 *
 * Runs on the Next.js server only. For each image the backend proposes the
 * region to send and the identifiers to mask; an image goes to the API only
 * when that proposal is automatic (the backend's own rule). If any image needs
 * a person to review the masking, the whole submission is held for a
 * specialist and nothing is sent. Filenames sent to the backend are document
 * ids, never the patient's original filename.
 */
import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { crfSubmissions, uploadedDocuments, type PipelineStatus } from "@/db/schema";
import { readDocumentBytes } from "@/lib/documentVault";
import { callPipeline } from "@/lib/pipeline";

export type PipelineBody = { json?: Record<string, unknown>; raw?: ArrayBuffer };
export type PipelineCall = (
  method: "GET" | "POST",
  path: string,
  query?: Record<string, string>,
  body?: PipelineBody,
) => Promise<Record<string, unknown>>;

export class PipelineCallError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Backend writes are recorded under the portal, not the patient's name. */
const PORTAL_ACTOR = { name: "Cổng bệnh nhân", role: "patient" as const };

export const defaultPipelineCall: PipelineCall = async (method, path, query = {}, body) => {
  const response = await callPipeline(method, path, new URLSearchParams(query), body ?? null, PORTAL_ACTOR);
  const text = new TextDecoder().decode(response.body);
  const data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  if (response.status >= 400) {
    throw new PipelineCallError(String(data.error ?? `HTTP ${response.status}`), response.status);
  }
  return data;
};

export interface IntakeImage {
  fileId: string;
  mime: string;
  sha256: string;
  bytes: Buffer;
}

export interface PlanOptions {
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/bmp": "bmp",
};

function raw(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * The automatic privacy plan for every image, or null when any image needs a
 * person to review what would be sent.
 */
export async function automaticPlans(
  images: IntakeImage[],
  call: PipelineCall,
  { pollMs = 3000, timeoutMs = 10 * 60 * 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: PlanOptions = {},
): Promise<Record<string, unknown>[] | null> {
  const jobs = [];
  for (const image of images) {
    jobs.push(await call("POST", "/api/privacy-proposals", { sha256: image.sha256 }, { raw: raw(image.bytes) }));
  }
  const deadline = Date.now() + timeoutMs;
  const plans: Record<string, unknown>[] = [];
  let held = false;
  for (let job of jobs) {
    while (job.status === "queued" || job.status === "processing") {
      if (Date.now() > deadline) throw new Error("Privacy proposals did not finish in time.");
      await sleep(pollMs);
      job = await call("GET", "/api/privacy-proposals", { job_id: String(job.job_id) });
    }
    const plan = job.status === "completed" ? (job.automatic_plan as Record<string, unknown> | null) : null;
    if (!plan) held = true;
    else plans.push(plan);
  }
  return held ? null : plans;
}

export type SendResult = { status: "privacy_review" } | { status: "processing"; intakeId: string };

export async function sendToPipeline(
  submissionId: string,
  images: IntakeImage[],
  call: PipelineCall,
  options: PlanOptions & { engine?: string } = {},
): Promise<SendResult> {
  const plans = await automaticPlans(images, call, options);
  if (!plans) return { status: "privacy_review" };
  if (plans.every((plan) => plan.skip === true)) {
    throw new Error("Không có ảnh nào chứa kết quả để trích xuất.");
  }
  const created = await call("POST", "/api/intakes", {}, {
    json: {
      // Retrying the same submission reuses the same backend intake.
      request_id: `next-${submissionId}`,
      file_count: images.length,
      same_patient: true,
      engine: options.engine ?? process.env.PIPELINE_ENGINE ?? "gemini",
      privacy: plans,
    },
  });
  const job = (created.job ?? {}) as { job_id?: string; status?: string };
  const jobId = String(job.job_id ?? "");
  if (!jobId) throw new Error("Backend did not return an intake id.");
  // A retry reuses the same request_id, so the backend hands back the intake
  // that failed; it only starts that one again when asked to retry.
  const retry = created.status === "already_created" && job.status === "failed";
  for (const image of images) {
    const name = `${image.fileId}.${EXTENSION[image.mime] ?? "img"}`;
    await call("POST", "/api/intakes/image", { job_id: jobId, file_id: image.fileId, name }, { raw: raw(image.bytes) });
  }
  await call("POST", "/api/intakes/start", {}, { json: { job_id: jobId, retry } });
  return { status: "processing", intakeId: jobId };
}

/** Coarse status from a backend intake job. */
export function intakeStatus(jobStatus: unknown): PipelineStatus {
  if (jobStatus === "completed") return "completed";
  if (jobStatus === "failed" || jobStatus === "needs_attention") return "failed";
  return "processing";
}

/**
 * Claim a submission that has not been sent and send its stored images.
 * Safe to call twice: only one caller wins the claim.
 */
export async function startSubmissionPipeline(
  submissionId: string,
  { db = getDb(), call = defaultPipelineCall, ...options }: { db?: DatabaseClient; call?: PipelineCall } & PlanOptions = {},
): Promise<PipelineStatus> {
  const claimed = await db
    .update(crfSubmissions)
    .set({ pipelineStatus: "privacy_check", pipelineError: null })
    .where(and(eq(crfSubmissions.id, submissionId), eq(crfSubmissions.pipelineStatus, "none")))
    .returning({ id: crfSubmissions.id });
  if (!claimed.length) return "none";

  const finish = async (pipelineStatus: PipelineStatus, extra: { pipelineIntakeId?: string; pipelineError?: string } = {}) => {
    await db.update(crfSubmissions).set({ pipelineStatus, ...extra }).where(eq(crfSubmissions.id, submissionId));
    return pipelineStatus;
  };

  try {
    const documents = await db
      .select()
      .from(uploadedDocuments)
      .where(and(eq(uploadedDocuments.submissionId, submissionId), eq(uploadedDocuments.storageProvider, "local")))
      .orderBy(uploadedDocuments.createdAt);
    if (!documents.length) return await finish("none");
    const images: IntakeImage[] = [];
    for (const document of documents) {
      images.push({
        fileId: document.id,
        mime: document.mimeType,
        sha256: document.sha256 ?? "",
        bytes: await readDocumentBytes(document),
      });
    }
    const result = await sendToPipeline(submissionId, images, call, options);
    if (result.status === "privacy_review") return await finish("privacy_review");
    return await finish("processing", { pipelineIntakeId: result.intakeId });
  } catch (error) {
    return await finish("failed", { pipelineError: String((error as Error).message ?? error).slice(0, 500) });
  }
}

/** Update every submission still processing from the backend intake list. */
export async function refreshPipelineStatuses({
  db = getDb(),
  call = defaultPipelineCall,
}: { db?: DatabaseClient; call?: PipelineCall } = {}): Promise<number> {
  const pending = await db
    .select({ id: crfSubmissions.id, intakeId: crfSubmissions.pipelineIntakeId })
    .from(crfSubmissions)
    .where(eq(crfSubmissions.pipelineStatus, "processing"));
  if (!pending.length) return 0;
  const listing = await call("GET", "/api/intakes");
  const jobs = new Map(
    ((listing.jobs as { job_id: string; status: string; error?: string | null; case_id?: string | null }[] | undefined) ?? []).map(
      (job) => [job.job_id, job],
    ),
  );
  let changed = 0;
  for (const row of pending) {
    const job = row.intakeId ? jobs.get(row.intakeId) : undefined;
    if (!job) continue;
    const next = intakeStatus(job.status);
    if (next === "processing") continue;
    await db
      .update(crfSubmissions)
      .set({ pipelineStatus: next, pipelineError: next === "failed" ? String(job.error ?? job.status).slice(0, 500) : null })
      .where(eq(crfSubmissions.id, row.id));
    changed += 1;
    if (next === "completed" && job.case_id) {
      // Draft the clinical answers (LLM proposals) as soon as the images are read;
      // the doctor reviews them. A failure here never blocks the submission.
      await call("POST", "/api/crf/generate", {}, { json: { case_id: job.case_id } }).catch(() => undefined);
    }
  }
  return changed;
}
