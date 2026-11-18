/**
 * Server-side client for the Python OCR/CRF pipeline (registry_review.server).
 *
 * The backend is the source of truth: patients, CRF fields, source values, LLM
 * proposals, reference intervals and scores all come from it. It listens on
 * 127.0.0.1 only and accepts a request when the Host header is its own
 * 127.0.0.1 authority, no foreign Origin is sent, and every POST carries the
 * X-Review-Token printed in its UI page. Next.js owns login; this module only
 * forwards allowlisted endpoints for an authenticated user.
 */
import type { UserRole } from "@/data/mockData";

export const PIPELINE_URL = (process.env.PIPELINE_URL ?? "http://127.0.0.1:8881").replace(/\/+$/, "");

/**
 * Read-only endpoints. They return every patient in the registry (the backend
 * has no per-patient ownership), so only specialists may read them.
 */
export const PIPELINE_GET: Record<string, readonly UserRole[]> = {
  "/api/summary": ["specialist"],
  "/api/patient": ["specialist"],
  "/api/crf": ["specialist"],
  "/api/crf/references": ["specialist"],
  "/api/crf/knowledge": ["specialist"],
  "/api/intakes": ["specialist"],
  "/api/privacy-proposals": ["specialist"],
  "/asset": ["specialist"],
  "/api/exports/options": ["specialist"],
  "/api/exports/download": ["specialist"],
};

/**
 * Write endpoints and who may call them. Intake responses carry case ids,
 * file details and OCR text, so patients never call the backend directly.
 */
export const PIPELINE_POST: Record<string, readonly UserRole[]> = {
  "/api/privacy-proposals": ["specialist"],
  "/api/intakes": ["specialist"],
  "/api/intakes/image": ["specialist"],
  "/api/intakes/start": ["specialist"],
  "/api/crf/generate": ["specialist"],
  "/api/crf/scores": ["specialist"],
  "/api/crf/approve": ["specialist"],
  "/api/exports/preview": ["specialist"],
  "/api/exports/create": ["specialist"],
};

/** Normalise a proxied path and refuse traversal or encoded tricks. */
export function pipelinePath(segments: readonly string[]): string | null {
  if (!segments.length || segments.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }
  return "/" + segments.join("/");
}

export function allowedPipelineCall(method: "GET" | "POST", path: string, role: UserRole): boolean {
  const table = method === "GET" ? PIPELINE_GET : PIPELINE_POST;
  return Object.hasOwn(table, path) && table[path].includes(role);
}

/** The backend's CSRF token is the TOKEN constant printed in its UI page. */
export function extractReviewToken(html: string): string | null {
  const match = html.match(/\bconst\s+TOKEN\s*=\s*("(?:\\.|[^"\\])*")\s*;/);
  if (!match) return null;
  try {
    const token = JSON.parse(match[1]);
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/**
 * Who the backend records for a write: the signed-in Next.js user, never a
 * value from the browser. Specialists act as clinicians, patients as submitters.
 */
export function declaredActor(user: { name: string; role: UserRole }): { actor: string; role: string } {
  return { actor: user.name, role: user.role === "specialist" ? "clinician" : "source_reviewer" };
}

let cachedToken: string | null = null;

async function reviewToken(refresh = false): Promise<string> {
  if (cachedToken && !refresh) return cachedToken;
  const response = await fetch(PIPELINE_URL + "/", { cache: "no-store", redirect: "error" });
  const token = extractReviewToken(await response.text());
  if (!response.ok || !token) throw new Error("Pipeline backend did not issue a review token");
  cachedToken = token;
  return token;
}

export interface PipelineResponse {
  status: number;
  body: ArrayBuffer;
  contentType: string;
}

/** Forward one allowlisted call. JSON writes get the signed-in actor and role. */
export async function callPipeline(
  method: "GET" | "POST",
  path: string,
  query: URLSearchParams,
  body: { json?: Record<string, unknown>; raw?: ArrayBuffer } | null,
  user: { name: string; role: UserRole },
): Promise<PipelineResponse> {
  const url = PIPELINE_URL + path + (query.size ? "?" + query.toString() : "");
  const send = async (token: string | null) => {
    const headers: Record<string, string> = {};
    let payload: BodyInit | undefined;
    if (method === "POST") {
      headers["X-Review-Token"] = token ?? "";
      if (body?.raw) {
        headers["Content-Type"] = "application/octet-stream";
        payload = body.raw;
      } else {
        headers["Content-Type"] = "application/json";
        const json = { ...(body?.json ?? {}) };
        if ("actor" in json || "role" in json || path === "/api/crf/approve" || path === "/api/intakes") {
          Object.assign(json, declaredActor(user));
        }
        payload = JSON.stringify(json);
      }
    }
    return fetch(url, { method, headers, body: payload, cache: "no-store", redirect: "error" });
  };
  let response = await send(method === "POST" ? await reviewToken() : null);
  if (method === "POST" && response.status === 403) {
    // The backend issues a new token when it restarts.
    response = await send(await reviewToken(true));
  }
  return {
    status: response.status,
    body: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
