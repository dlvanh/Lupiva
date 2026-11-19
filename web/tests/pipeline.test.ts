import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedPipelineCall,
  callPipeline,
  declaredActor,
  extractReviewToken,
  pipelinePath,
} from "@/lib/pipeline";

describe("pipeline proxy guards", () => {
  it("builds a path only from plain segments", () => {
    expect(pipelinePath(["api", "crf"])).toBe("/api/crf");
    expect(pipelinePath(["api", "intakes", "start"])).toBe("/api/intakes/start");
    for (const bad of [[], ["api", ".."], ["api", "crf%2F..%2Fexport"], ["api", "a/b"], ["api", ""]]) {
      expect(pipelinePath(bad)).toBeNull();
    }
  });

  it("allows reads from the allowlist only", () => {
    expect(allowedPipelineCall("GET", "/api/crf", "specialist")).toBe(true);
    expect(allowedPipelineCall("GET", "/api/crf", "patient")).toBe(false);
    expect(allowedPipelineCall("GET", "/api/summary", "patient")).toBe(false);
    expect(allowedPipelineCall("GET", "/api/intakes", "patient")).toBe(false);
    expect(allowedPipelineCall("GET", "toString", "specialist")).toBe(false);
    expect(allowedPipelineCall("GET", "/api/export", "specialist")).toBe(false);
    expect(allowedPipelineCall("GET", "/api/patient/export", "specialist")).toBe(false);
  });

  it("keeps approval and draft generation with specialists", () => {
    expect(allowedPipelineCall("POST", "/api/crf/approve", "specialist")).toBe(true);
    expect(allowedPipelineCall("POST", "/api/crf/approve", "patient")).toBe(false);
    expect(allowedPipelineCall("POST", "/api/crf/generate", "patient")).toBe(false);
    // LLM clinical proposals are switched off for everyone.
    expect(allowedPipelineCall("POST", "/api/crf/generate", "specialist")).toBe(false);
    expect(allowedPipelineCall("POST", "/api/intakes", "patient")).toBe(false);
    expect(allowedPipelineCall("POST", "/api/intakes/image", "patient")).toBe(false);
    for (const path of ["/api/review", "/api/patient-review", "/api/source-review"]) {
      expect(allowedPipelineCall("POST", path, "specialist")).toBe(false);
    }
  });

  it("lets only specialists reach the REDCap export endpoints", () => {
    for (const [method, path] of [
      ["GET", "/api/exports/options"],
      ["GET", "/api/exports/download"],
      ["POST", "/api/exports/preview"],
      ["POST", "/api/exports/create"],
    ] as const) {
      expect(allowedPipelineCall(method, path, "specialist")).toBe(true);
      expect(allowedPipelineCall(method, path, "patient")).toBe(false);
    }
  });

  it("reads the backend CSRF token from its UI page", () => {
    expect(extractReviewToken('<script nonce="n">const TOKEN = "abc\\"d";</script>')).toBe('abc"d');
    expect(extractReviewToken("<html>no token</html>")).toBeNull();
    expect(extractReviewToken('const TOKEN = "";')).toBeNull();
  });

  it("records the signed-in user as the actor", () => {
    expect(declaredActor({ name: "Dr A", role: "specialist" })).toEqual({ actor: "Dr A", role: "clinician" });
    expect(declaredActor({ name: "P B", role: "patient" })).toEqual({ actor: "P B", role: "source_reviewer" });
  });
});

describe("registry approval changes", () => {
  const user = { name: "Dr A", role: "specialist" as const };
  const changes = {
    case_id: "case-1",
    source_snapshot: "source",
    draft_sha256: "draft",
    expected_review_sha256: "review-1",
    selections: { "ADM05/result": "height" },
    manual_values: {},
  };
  const field = (slot: string, id: string, value: string) => ({
    slot, choices: [], options: [{ id, value }],
  });
  const saved = {
    source_snapshot: "source",
    draft_sha256: "draft",
    review_sha256: "review-1",
    fields: [field("ADM02/result", "age", "64 years"), field("ADM05/result", "height", "170 cm")],
    review: { values: { "ADM02/result": { id: "age", value: "64 years", origin: "source" } } },
  };

  afterEach(() => vi.unstubAllGlobals());

  it("preserves approved values in the pipeline receipt while the browser submits only changed fields", async () => {
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === "POST") return Response.json({ ok: true });
      if (url.includes("/api/crf?")) return Response.json(saved);
      return new Response('const TOKEN = "test-token";');
    });
    vi.stubGlobal("fetch", fetch);

    const response = await callPipeline("POST", "/api/crf/approve", new URLSearchParams(), { json: changes }, user);
    expect(response.status).toBe(200);
    const [, post] = fetch.mock.calls.find(([, options]) => options.method === "POST") ?? [];
    expect(JSON.parse(String(post?.body))).toEqual({
      case_id: "case-1",
      source_snapshot: "source",
      draft_sha256: "draft",
      selections: { "ADM02/result": "age", "ADM05/result": "height" },
      manual_values: {},
      actor: "Dr A",
      role: "clinician",
    });
  });

  it("rejects a stale review before sending a pipeline write", async () => {
    const fetch = vi.fn(async () => Response.json({ ...saved, review_sha256: "review-2" }));
    vi.stubGlobal("fetch", fetch);

    const response = await callPipeline("POST", "/api/crf/approve", new URLSearchParams(), { json: changes }, user);
    expect(response.status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
