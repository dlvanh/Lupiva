import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LandingPage from "@/app/page";
import LoginPage from "@/app/login/page";
import { Navbar } from "@/components/Navbar";
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
  usePathname: () => "/",
}));

beforeEach(() => {
  state.language = "vi";
  state.currentUser = null;
  state.searchParams = new URLSearchParams();
});

describe("patient landing page", () => {
  it("leads with a plain-language hero, then benefits and joining before the research details", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    const hero = markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    expect(hero).toContain("Chia sẻ kết quả khám và xét nghiệm để cùng bác sĩ hiểu rõ hơn về bệnh lupus.");
    expect(hero).not.toMatch(/registry tiến cứu|CRF|chuẩn hóa/i);
    expect(markup.indexOf("Quyền lợi")).toBeLessThan(markup.indexOf("Cách tham gia"));
    expect(markup.indexOf("Cách tham gia")).toBeLessThan(markup.indexOf("Mục tiêu và hướng nghiên cứu"));
    expect(markup).toMatch(/<details[^>]*>.*<summary[^>]*>.*Mục tiêu và hướng nghiên cứu.*Xem thêm.*<\/summary>/);
    expect(markup).toContain("EULAR/ACR 2019");
    expect(markup).toContain("SLEDAI-2K");
  });

  it("presents the registry in English", () => {
    state.language = "en";
    const markup = renderToStaticMarkup(<LandingPage />);
    for (const text of ["Lupus Patient Registry", "Aim and research directions", "Background", "How the registry works"]) {
      expect(markup).toContain(text);
    }
  });

  it("explains consent, fee, access, timing and use, and gives a contact number placeholder", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    for (const text of [
      "Đồng ý tham gia (ký điện tử)", "rút khỏi dự án", "miễn phí", "bác sĩ chuyên khoa của dự án",
      "giả danh hóa", "Mất bao lâu?", "Hồ sơ dùng vào việc gì?", "Liên hệ", "Điện thoại", "...",
      "Đây không phải đặt lịch khám và không thay thế việc khám bác sĩ.",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("E-consent");
  });

  it("shows the patient sections after switching to English", () => {
    state.language = "en";
    const markup = renderToStaticMarkup(<LandingPage />);
    expect(markup).toContain("Benefits for Patients");
    expect(markup).toContain("Agree to take part (sign electronically)");
    expect(markup).toContain("Start participation");
  });

  it("gives guests one registration action and keeps a single sign-in link in the menu", () => {
    const markup = renderToStaticMarkup(<><Navbar /><LandingPage /></>);
    expect(markup).toMatch(/href="\/login\?mode=register"[^>]*>Bắt đầu tham gia<\/a>/);
    expect(markup.match(/href="\/login\?mode=register"/g)).toHaveLength(1);
    expect(markup.match(/href="\/login"/g)).toHaveLength(1);
    expect(markup).toMatch(/id="nav-link-upload"[^>]*>Nộp hồ sơ<\/a>/);
    expect(markup).toContain("Đăng nhập");
  });

  it("shows Hồ sơ của tôi and links consented patients to upload", () => {
    state.currentUser = { role: "patient", consentSigned: true };
    const markup = renderToStaticMarkup(<><Navbar /><LandingPage /></>);
    expect(markup).toContain("Bạn đã đồng ý tham gia");
    expect(markup).not.toContain("mode=register");
    expect(markup).toMatch(/id="nav-link-upload"[^>]*>Hồ sơ của tôi<\/a>/);
    expect(markup).toMatch(/href="\/upload"[^>]*>Nộp hồ sơ<\/a>/);
  });

  it("opens patient registration with the consent box for the patient to check", () => {
    state.searchParams = new URLSearchParams("mode=register");
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain('id="login-input-fullname"');
    const checkbox = markup.match(/<input[^>]*id="login-checkbox-consent"[^>]*>/)?.[0];
    expect(checkbox).toBeDefined();
    expect(checkbox).not.toContain('checked=""');
    expect(markup).not.toContain('id="login-input-invite-code"');
  });
});
