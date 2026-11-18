import { describe, expect, it } from "vitest";
import {
  allowedPipelineCall,
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
