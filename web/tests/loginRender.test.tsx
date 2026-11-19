import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { TRANSLATIONS, type Language } from "@/data/translations";

const state = vi.hoisted(() => ({ language: "vi" as Language, query: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({ language: state.language, t: TRANSLATIONS[state.language], currentUser: null }),
}));

beforeEach(() => {
  state.query = "";
  state.language = "vi";
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
});

afterEach(() => vi.unstubAllEnvs());

describe("login copy", () => {
  it.each([
    ["vi", "Đăng nhập", "Bệnh nhân nộp", "Bác sĩ duyệt"],
    ["en", "Sign in", "Patients submit", "Doctors review"],
  ] as const)("uses neutral sign-in copy in %s", (language, button, patientUse, doctorUse) => {
    state.language = language;
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toMatch(new RegExp(`id="login-btn-submit"[^>]*>${button}</button>`));
    expect(html).toContain(patientUse);
    expect(html).toContain(doctorUse);
    expect(html).not.toMatch(/login-tab-specialist|phân quyền|role-based clinical access|aes-256|hmac|blind index/i);
  });

  it("registration is patient-only: no role choice and no invite code", () => {
    state.query = "mode=register";
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).not.toMatch(/login-tab-specialist|login-tab-patient|login-input-invite-code/);
    expect(html).not.toContain("Bác sĩ Chuyên khoa");
    expect(html).toMatch(/<h1[^>]*>Đăng ký bệnh nhân<\/h1>/);
    expect(html).toMatch(/id="login-mode-register"[^>]*>Đăng ký bệnh nhân<\/button>/);
    expect(html).toMatch(/id="login-btn-submit"[^>]*>Đăng ký tài khoản bệnh nhân →<\/button>/);
    const panel = html.match(/<aside\b[^>]*>.*?<\/aside>/)?.[0];
    expect(panel).toContain("Bệnh nhân nộp");
    expect(panel).not.toContain("Bác sĩ duyệt hồ sơ");
    expect(html).not.toMatch(/aes-256|hmac|blind index/i);
  });

  it("sign-in screen never shows the role tabs or invite code", () => {
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).not.toMatch(/login-tab-specialist|login-tab-patient|login-input-invite-code/);
    expect(html).toMatch(/id="login-mode-register"[^>]*>Đăng ký bệnh nhân<\/button>/);
  });
});

describe("registration password check", () => {
  it("matches the server rule: letter, digit, special char, 8-128", async () => {
    const { isValidRegisterPassword } = await import("@/lib/registerPassword");
    expect(isValidRegisterPassword("Abc12345!")).toBe(true);
    expect(isValidRegisterPassword("Abc12345")).toBe(false);
    expect(isValidRegisterPassword("abcdefg!")).toBe(false);
    expect(isValidRegisterPassword("Ab1!")).toBe(false);
  });
});
