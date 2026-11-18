import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LandingPage from "@/app/page";
import LoginPage from "@/app/login/page";
import { TRANSLATIONS, type Language } from "@/data/translations";

const state = vi.hoisted(() => ({
  language: "vi" as Language,
  currentUser: null as { role: "patient" | "specialist"; consentSigned: boolean } | null,
  searchParams: new URLSearchParams(),
}));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({ ...state, t: TRANSLATIONS[state.language] }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => state.searchParams,
}));

beforeEach(() => {
  state.language = "vi";
  state.currentUser = null;
  state.searchParams = new URLSearchParams();
});

describe("patient landing page", () => {
  it("presents the lupus registry: aim and research directions, background, how it works", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    for (const text of [
      "Đăng ký bệnh nhân Lupus", "Mục tiêu và hướng nghiên cứu", "EULAR/ACR 2019", "SLEDAI-2K",
      "Bối cảnh", "Registry hoạt động như thế nào", "Dành cho bệnh nhân",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain(TRANSLATIONS.vi.landing.challengeTag);
  });

  it("presents the registry in English", () => {
    state.language = "en";
    const markup = renderToStaticMarkup(<LandingPage />);
    for (const text of ["Lupus Patient Registry", "Aim and research directions", "Background", "How the registry works"]) {
      expect(markup).toContain(text);
    }
  });

  it("shows the patient sections in Vietnamese by default", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    for (const text of [
      "Quyền lợi", "Điều trị tốt hơn", "Ẩn danh và bảo mật", "Hoàn thiện E-consent",
      "Tải hồ sơ lên", "Liên hệ",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain(TRANSLATIONS.vi.landing.workflowSectionTitle);
  });

  it("shows the patient sections after switching to English", () => {
    state.language = "en";
    const markup = renderToStaticMarkup(<LandingPage />);
    expect(markup).toContain("Improved Treatment");
    expect(markup).toContain("Anonymity and Security");
  });

  it("links visitors to E-consent registration and upload sign-in", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    expect(markup).toContain('href="/login?mode=register&amp;consent=1"');
    expect(markup).toContain('href="/login?next=/upload"');
  });

  it("marks E-consent complete for a signed-in patient who already consented", () => {
    state.currentUser = { role: "patient", consentSigned: true };
    const markup = renderToStaticMarkup(<LandingPage />);
    expect(markup).toContain("Đã hoàn thiện E-consent");
    expect(markup).not.toContain("mode=register");
    expect(markup).toMatch(/href="\/upload"[^>]*>Tải hồ sơ lên<\/a>/);
  });

  it("opens the patient registration form with E-consent checked", () => {
    state.searchParams = new URLSearchParams("mode=register&consent=1");
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain('id="login-input-fullname"');
    expect(markup).toMatch(/<input[^>]*id="login-checkbox-consent"[^>]*checked=""/);
    expect(markup).not.toContain('id="login-input-invite-code"');
  });
});
