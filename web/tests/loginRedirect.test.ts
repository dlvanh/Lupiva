import { describe, expect, it } from "vitest";
import { resolveSafeRedirect } from "@/lib/loginRedirect";

describe("where sign-in leads", () => {
  it("patients land on the home page after signing in", () => {
    expect(resolveSafeRedirect(null, "patient", "login")).toBe("/");
  });
  it("new patients go on to submit records after registering", () => {
    expect(resolveSafeRedirect(null, "patient", "register")).toBe("/upload");
  });
  it("doctors land on the dashboard", () => {
    expect(resolveSafeRedirect(null, "specialist", "login")).toBe("/upload");
  });
  it("keeps a safe next link and blocks doctor pages and external links for patients", () => {
    expect(resolveSafeRedirect("/benh-nhan", "patient", "login")).toBe("/benh-nhan");
    expect(resolveSafeRedirect("/registry", "patient", "login")).toBe("/");
    expect(resolveSafeRedirect("//evil.example", "patient", "login")).toBe("/");
  });
});
