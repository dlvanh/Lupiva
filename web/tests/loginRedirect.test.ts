import { describe, expect, it } from "vitest";
import { resolveSafeRedirect } from "@/lib/loginRedirect";

describe("where sign-in leads", () => {
  it("patients land on the submission page after signing in or registering", () => {
    expect(resolveSafeRedirect(null, "patient")).toBe("/upload");
  });
  it("doctors land on the dashboard", () => {
    expect(resolveSafeRedirect(null, "specialist")).toBe("/upload");
  });
  it("keeps a safe next link and blocks doctor pages and external links for patients", () => {
    expect(resolveSafeRedirect("/benh-nhan", "patient")).toBe("/benh-nhan");
    expect(resolveSafeRedirect("/registry", "patient")).toBe("/upload");
    expect(resolveSafeRedirect("//evil.example", "patient")).toBe("/upload");
  });
  it("admins land on /admin and non-admins cannot redirect into /admin", () => {
    expect(resolveSafeRedirect(null, "admin")).toBe("/admin");
    expect(resolveSafeRedirect("/admin", "admin")).toBe("/admin");
    expect(resolveSafeRedirect("/registry", "admin")).toBe("/admin");
    expect(resolveSafeRedirect("/admin", "patient")).toBe("/upload");
    expect(resolveSafeRedirect("/admin", "specialist")).toBe("/upload");
  });
});
