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
    ["vi", "Đăng nhập", "Đăng nhập", "Đăng ký tài khoản", "Số điện thoại hoặc Email"],
    ["en", "Sign In", "Sign In", "Create an account", "Phone number or Email"],
  ] as const)("renders single-card sign-in screen in %s", (language, heading, button, registerLinkText, identifierLabel) => {
    state.language = language;
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toMatch(new RegExp(`<h1[^>]*id="login-form-heading"[^>]*>${heading}</h1>`));
    expect(html).toMatch(new RegExp(`id="login-btn-submit"[^>]*>${button}</button>`));
    expect(html).toContain('id="login-input-identifier"');
    expect(html).toContain(identifierLabel);
    expect(html).toContain('id="login-link-register"');
    expect(html).toContain('href="/login?mode=register"');
    expect(html).toContain(registerLinkText);
    expect(html).toContain('id="login-btn-toggle-password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${language === "vi" ? "Hiện mật khẩu" : "Show password"}"`);
    expect(html).toMatch(/id="login-btn-toggle-password"[^>]*><svg aria-hidden="true"/);
    expect(html).not.toMatch(/<aside\b|login-tab-specialist|login-tab-patient|login-input-invite-code|phân quyền|role-based clinical access|aes-256|hmac|blind index/i);
  });

  it("registration is patient-only: requires phone + OTP, optional email, full name and password hint without role choice or invite code", () => {
    state.query = "mode=register";
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).not.toMatch(/<aside\b|login-tab-specialist|login-tab-patient|login-input-invite-code|login-checkbox-consent/);
    expect(html).not.toContain("Bác sĩ Chuyên khoa");
    expect(html).toMatch(/<h1[^>]*id="login-form-heading"[^>]*>Đăng ký tài khoản<\/h1>/);
    expect(html).toContain('id="login-input-fullname"');
    expect(html).toContain('id="login-input-phone"');
    expect(html).toContain('id="login-btn-send-otp"');
    expect(html).toContain('id="login-input-otp"');
    expect(html).toContain('id="login-input-email"');
    expect(html).toContain("Email (không bắt buộc)");
    expect(html).not.toMatch(/id="login-input-email"[^>]*\brequired\b/);
    expect(html).toContain('id="login-password-hint"');
    expect(html).toContain('id="login-btn-toggle-password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Hiện mật khẩu"');
    expect(html).toMatch(/id="login-btn-submit"[^>]*>Đăng ký<\/button>/);
    expect(html).toContain('id="login-link-signin"');
    expect(html).toContain('href="/login"');
    expect(html).not.toMatch(/aes-256|hmac|blind index/i);
  });

  it("preserves next query param when linking between sign-in and register", () => {
    state.query = "next=/upload";
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain('href="/login?mode=register&amp;next=%2Fupload"');
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
