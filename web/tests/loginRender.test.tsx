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

  it("offers both roles at registration and describes the selected patient role", () => {
    state.query = "mode=register";
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain('id="login-tab-specialist"');
    expect(html).toContain('id="login-tab-patient" aria-pressed="true"');
    const panel = html.match(/<aside\b[^>]*>.*?<\/aside>/)?.[0];
    expect(panel).toContain("Bệnh nhân nộp");
    expect(panel).not.toContain("Bác sĩ duyệt hồ sơ");
    expect(html).not.toMatch(/aes-256|hmac|blind index/i);
  });
});
