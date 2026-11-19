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
  it("home: Vietnam Lupus Registry hero without tagline badge or 'tại', no submit CTA on home, merged About sections", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    const hero = markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    expect(hero).toContain("Vietnam Lupus Registry");
    expect(hero).not.toContain("Registry bệnh lupus ban đỏ hệ thống Việt Nam");
    expect(hero).not.toContain("bệnh lupus ban đỏ hệ thống tại Việt Nam");
    expect(hero).not.toContain("(SLE) tại Việt Nam");
    expect(hero).toContain('href="/benh-nhan"');
    expect(hero).toContain('href="/login?role=specialist"');
    expect(hero).not.toContain('href="/upload"');
    expect(markup).not.toContain('href="/login?mode=register"');

    for (const text of [
      "Mục tiêu và hướng nghiên cứu",
      "Chuẩn hóa hồ sơ khám và xét nghiệm thực tế",
      "Theo dõi mức độ hoạt động bệnh, diễn biến lâm sàng",
      "Ứng dụng AI hiểu ngữ cảnh y khoa",
      "mô hình dự báo đợt bùng phát",
      "Cách registry vận hành",
      "Hướng phát triển",
      "Thành viên nhóm thực hiện",
      "PGS.TS.BS Nguyễn Văn Đĩnh",
      "Hoàng Thị Oánh",
      "Đỗ Lê Việt Anh",
      "Phạm Văn Kiên",
      "Vương Việt Hoàng",
      "Học viên AI Thực Chiến",
      "Đơn vị thực hiện",
      "Viện Nghiên cứu Miễn dịch Vinmec – VinUni",
      "VinUni VRIC - VinMec",
      "Thuộc chương trình AI Thực Chiến",
      "26ai.anhdlv@vinuni.edu.vn",
      "(+84) 93 456 0122",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("Bối cảnh");
    expect(markup).not.toContain("Giảm &gt;75%");
    expect(markup).not.toContain("75%");
    expect(markup).not.toContain("VRISG");
    expect(markup).not.toContain("SLEDAI-2K");
    expect(markup).not.toContain("Câu hỏi thường gặp");
  });

  it("about (/gioi-thieu): renders merged registry home sections", () => {
    const markup = renderToStaticMarkup(<AboutPage />);
    expect(markup).toContain("Thành viên nhóm thực hiện");
    expect(markup).toContain("Cách registry vận hành");
  });

  it("patients: lupus explained, benefits incl. talking with a specialist, joining, FAQ and notice", () => {
    const markup = renderToStaticMarkup(<PatientsPage />);
    for (const text of [
      "Lupus ban đỏ hệ thống là gì?", "Quyền lợi", "Cơ hội trao đổi với bác sĩ chuyên khoa",
      "Dùng email/số điện thoại để tạo tài khoản", "Đồng ý tham gia (ký chấp thuận)", "rút khỏi dự án",
      "Tôi tham gia có mất phí không?", "tự nguyện và miễn phí", "Ai được quyền xem hồ sơ của tôi?", "giả danh hóa",
      "Thời gian nộp hồ sơ mất bao lâu?", "Thời gian gửi mỗi tài liệu mất vài phút.", "Hồ sơ của tôi dùng vào việc gì?",
      "Đây không phải đặt lịch khám và không thay thế việc khám bác sĩ.", "Bắt đầu tham gia",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("vài ngày làm việc");
    expect(markup.indexOf("Quyền lợi")).toBeLessThan(markup.indexOf("Cách tham gia"));
    expect(markup).not.toContain("E-consent");
  });

  it("contact: team members matching home page, partners, and real email/phone", () => {
    const markup = renderToStaticMarkup(<ContactPage />);
    for (const text of [
      "Liên hệ",
      "Thành viên nhóm thực hiện",
      "PGS.TS.BS Nguyễn Văn Đĩnh",
      "Hoàng Thị Oánh",
      "Đỗ Lê Việt Anh",
      "Phạm Văn Kiên",
      "Vương Việt Hoàng",
      "Học viên AI Thực Chiến",
      "Viện Nghiên cứu Miễn dịch Vinmec – VinUni",
      "VinUni VRIC - VinMec thuộc chương trình AI Thực Chiến",
      "Điện thoại",
      "26ai.anhdlv@vinuni.edu.vn",
      "(+84) 93 456 0122",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("VRISG");
    expect(markup).not.toContain("Chủ nhiệm dự án");
  });

  it("presents the pages in English", () => {
    state.language = "en";
    const home = renderToStaticMarkup(<LandingPage />);
    expect(home).toContain("How the registry operates");
    expect(home).toContain("Future directions");
    expect(home).toContain("Our Members");
    const patients = renderToStaticMarkup(<PatientsPage />);
    expect(patients).toContain("A chance to talk with a specialist");
    expect(patients).toContain("Agree to take part (sign consent)");
    const contact = renderToStaticMarkup(<ContactPage />);
    expect(contact).toContain("Our Members");
    expect(contact).toContain("Assoc. Prof. Dr. Nguyen Van Dinh");
  });

  it("menu: 3 public pages (Trang chủ, Cho bệnh nhân, Liên hệ) without Về Registry and no doctor button beside sign-in", () => {
    const markup = renderToStaticMarkup(<Navbar />);
    expect(markup).toContain("Vietnam Lupus Registry");
    expect(markup).not.toMatch(/>Lupiva</);
    for (const href of ["/", "/benh-nhan", "/lien-he"]) {
      expect(markup).toContain(`href="${href}"`);
    }
    expect(markup).not.toContain('href="/gioi-thieu"');
    expect(markup).not.toContain("Về Registry");
    expect(markup).not.toContain('href="/upload"');
    expect(markup.indexOf('href="/benh-nhan"')).toBeLessThan(markup.indexOf('href="/lien-he"'));
    expect(markup).not.toContain('id="nav-btn-doctor"');
    expect(markup).not.toContain('href="/login?role=specialist"');
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
