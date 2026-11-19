import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LandingPage from "@/app/page";
import AboutPage from "@/app/gioi-thieu/page";
import PatientsPage from "@/app/benh-nhan/page";
import ContactPage from "@/app/lien-he/page";
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => state.searchParams,
  usePathname: () => "/",
}));

beforeEach(() => {
  state.language = "vi";
  state.currentUser = null;
  state.searchParams = new URLSearchParams();
});

describe("public site pages", () => {
  it("home: Vietnam Lupus Registry hero without 'tại', no submit CTA on home, merged About sections", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    const hero = markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    expect(hero).toContain("Vietnam Lupus Registry");
    expect(hero).toContain("Registry bệnh lupus ban đỏ hệ thống Việt Nam");
    expect(hero).not.toContain("bệnh lupus ban đỏ hệ thống tại Việt Nam");
    expect(hero).toContain('href="/benh-nhan"');
    expect(hero).toContain('href="/login?role=specialist"');
    expect(hero).not.toContain('href="/upload"');
    expect(markup).not.toContain('href="/login?mode=register"');

    for (const text of [
      "Bối cảnh",
      "EULAR/ACR 2019",
      "SLEDAI-2K",
      "Cách registry vận hành",
      "75%",
      "Hướng phát triển",
      "biobank",
      "Thành viên (Steering Committee)",
      "Nguyễn Văn Đinh",
      "Đơn vị thực hiện",
      "Viện Nghiên cứu Miễn dịch Vinmec – VinUni",
      "Viện Nghiên cứu Tế bào gốc và Công nghệ gen Vinmec (VRISG)",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("VRIC");
    expect(markup).not.toContain("Câu hỏi thường gặp");
  });

  it("about (/gioi-thieu): renders merged registry home sections", () => {
    const markup = renderToStaticMarkup(<AboutPage />);
    expect(markup).toContain("Thành viên (Steering Committee)");
    expect(markup).toContain("Cách registry vận hành");
  });

  it("patients: lupus explained, benefits incl. talking with a specialist, joining, FAQ and notice", () => {
    const markup = renderToStaticMarkup(<PatientsPage />);
    for (const text of [
      "Lupus ban đỏ hệ thống là gì?", "Quyền lợi", "Cơ hội trao đổi với bác sĩ chuyên khoa",
      "Đồng ý tham gia (ký điện tử)", "rút khỏi dự án", "miễn phí", "giả danh hóa", "Mất bao lâu?",
      "Đây không phải đặt lịch khám và không thay thế việc khám bác sĩ.", "Bắt đầu tham gia",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup.indexOf("Quyền lợi")).toBeLessThan(markup.indexOf("Cách tham gia"));
    expect(markup).not.toContain("E-consent");
  });

  it("contact: partners with full Vietnamese names, principal investigator and placeholders for email and phone", () => {
    const markup = renderToStaticMarkup(<ContactPage />);
    for (const text of [
      "Liên hệ",
      "Chủ nhiệm nghiên cứu",
      "Nguyen Van Dinh",
      "Viện Nghiên cứu Miễn dịch Vinmec – VinUni",
      "Viện Nghiên cứu Tế bào gốc và Công nghệ gen Vinmec (VRISG)",
      "Điện thoại",
      "...",
    ]) {
      expect(markup).toContain(text);
    }
  });

  it("presents the pages in English", () => {
    state.language = "en";
    const home = renderToStaticMarkup(<LandingPage />);
    expect(home).toContain("How the registry operates");
    expect(home).toContain("Future directions");
    expect(home).toContain("Our Members (Steering Committee)");
    const patients = renderToStaticMarkup(<PatientsPage />);
    expect(patients).toContain("A chance to talk with a specialist");
    expect(patients).toContain("Agree to take part (sign electronically)");
  });

  it("menu: Vietnam Lupus Registry brand, Cho bệnh nhân before Nộp hồ sơ, doctor entry and sign-in link", () => {
    const markup = renderToStaticMarkup(<Navbar />);
    expect(markup).toContain("Vietnam Lupus Registry");
    expect(markup).not.toMatch(/>Lupiva</);
    for (const href of ["/", "/benh-nhan", "/upload", "/lien-he"]) {
      expect(markup).toContain(`href="${href}"`);
    }
    expect(markup.indexOf('href="/benh-nhan"')).toBeLessThan(markup.indexOf('href="/upload"'));
    expect(markup.indexOf('href="/upload"')).toBeLessThan(markup.indexOf('href="/lien-he"'));
    expect(markup).toContain('id="nav-btn-doctor"');
    expect(markup).toContain('href="/login?role=specialist"');
    expect(markup.match(/href="\/login"/g)).toHaveLength(1);
  });

  it("shows Hồ sơ của tôi and the consent done state to consented patients", () => {
    state.currentUser = { role: "patient", consentSigned: true };
    const markup = renderToStaticMarkup(<><Navbar /><PatientsPage /></>);
    expect(markup).toContain("Bạn đã đồng ý tham gia");
    expect(markup).not.toContain("mode=register");
    expect(markup).toMatch(/id="nav-link-upload"[^>]*>Hồ sơ của tôi<\/a>/);
  });

  it("opens patient registration with full name input and without specialist invite code", () => {
    state.searchParams = new URLSearchParams("mode=register");
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain('id="login-input-fullname"');
    expect(markup).toContain('id="login-password-hint"');
    expect(markup).not.toContain('id="login-input-invite-code"');
    expect(markup).not.toContain('id="login-tab-specialist"');
  });
});
