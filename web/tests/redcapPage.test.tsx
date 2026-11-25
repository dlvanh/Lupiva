import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RedcapPage from "@/app/redcap/page";
import { Navbar } from "@/components/Navbar";
import { TRANSLATIONS, type Language } from "@/data/translations";
import { proxy } from "@/proxy";

const state = vi.hoisted(() => ({
  language: "vi" as Language,
  pathname: "/redcap",
  currentUser: null as { role: "patient" | "specialist" | "admin"; name: string } | null,
}));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({
    ...state,
    t: TRANSLATIONS[state.language],
    toggleLanguage: vi.fn(),
    setLanguage: vi.fn(),
    logout: vi.fn(),
    crfPatients: [],
    isActionGuideOpen: false,
    setIsActionGuideOpen: vi.fn(),
    toast: null,
    dismissToast: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => state.pathname,
}));

vi.mock("@/lib/newSubmissionStore", () => ({
  useNewSubmissions: () => ({ count: 0, latest: [] }),
}));

beforeEach(() => {
  state.language = "vi";
  state.pathname = "/redcap";
  state.currentUser = null;
});

describe("REDCap specialist tab and page", () => {
  it("shows Quản lý dữ liệu REDCap in the navbar only for signed-in specialists", () => {
    state.currentUser = { role: "specialist", name: "Dr. Nguyen Minh" };
    const specialistNav = renderToStaticMarkup(<Navbar />);
    expect(specialistNav).toContain('id="nav-link-redcap"');
    expect(specialistNav).toContain('href="/redcap"');
    expect(specialistNav).toContain(">Quản lý dữ liệu REDCap</a>");

    state.language = "en";
    const specialistNavEn = renderToStaticMarkup(<Navbar />);
    expect(specialistNavEn).toContain(">REDCap Data Management</a>");

    state.language = "vi";
    state.currentUser = { role: "patient", name: "Tran Thi Mai" };
    expect(renderToStaticMarkup(<Navbar />)).not.toContain('id="nav-link-redcap"');

    state.currentUser = { role: "admin", name: "Admin" };
    expect(renderToStaticMarkup(<Navbar />)).not.toContain('id="nav-link-redcap"');

    state.currentUser = null;
    expect(renderToStaticMarkup(<Navbar />)).not.toContain('id="nav-link-redcap"');
  });

  it("renders the REDCap dashboard image for specialists", () => {
    state.currentUser = { role: "specialist", name: "Dr. Nguyen Minh" };
    const html = renderToStaticMarkup(<RedcapPage />);
    expect(html).toContain("Quản lý dữ liệu REDCap");
    expect(html).toContain('src="/images/redcap-dashboard.jpg"');
  });

  it("redirects unauthenticated requests to /redcap in proxy.ts", () => {
    const res = proxy(new NextRequest("http://localhost:3000/redcap"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fredcap");
  });
});
