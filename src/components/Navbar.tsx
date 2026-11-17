"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import { getLocalizedButtonActionMap } from "@/data/translations";

export function Navbar() {
  const pathname = usePathname();
  const {
    language,
    toggleLanguage,
    setLanguage,
    t,
    currentUser,
    logout,
    crfPatients,
    isActionGuideOpen,
    setIsActionGuideOpen,
    toast,
    dismissToast,
  } = useLupiva();

  const [fadingToastId, setFadingToastId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;

    const currentId = toast.id;
    // Start fading out after 4.3 seconds, fully dismiss after 5 seconds
    const fadeTimer = setTimeout(() => {
      setFadingToastId(currentId);
    }, 4300);

    const dismissTimer = setTimeout(() => {
      dismissToast();
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast, dismissToast]);

  useEffect(() => {
    if (!isActionGuideOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsActionGuideOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActionGuideOpen, setIsActionGuideOpen]);

  const visibleToast = toast;
  const isFadingOut = Boolean(toast && fadingToastId === toast.id);

  const isVi = language === "vi";

  const navLinks =
    currentUser?.role === "specialist"
      ? [
          {
            href: "/",
            label: isVi ? "Tổng quan" : "Overview",
            id: "nav-link-home",
          },
          {
            href: "/upload",
            label: isVi ? "Hồ sơ Bệnh nhân" : "Patient Submissions",
            id: "nav-link-upload",
          },
          {
            href: "/ocr",
            label: isVi ? "Duyệt hồ sơ" : "Review",
            id: "nav-link-ocr",
          },
          {
            href: "/scores",
            label: isVi ? "Bảng điểm SLE" : "SLE Scores",
            id: "nav-link-scores",
          },
        ]
      : [
          {
            href: "/",
            label: isVi ? "Tổng quan" : "Overview",
            id: "nav-link-home",
          },
          {
            href: "/upload",
            label:
              currentUser?.role === "patient"
                ? isVi
                  ? "Tải tài liệu"
                  : "Upload Document"
                : isVi
                  ? "Bệnh nhân Tải lên"
                  : "Patient Upload",
            id: "nav-link-upload",
          },
        ];

  const localizedButtonMap = getLocalizedButtonActionMap(language);

  return (
    <>
      <a
        href="#main-content"
        className="skip-link fixed top-2 left-2 z-50 rounded-md bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white shadow-md"
      >
        {isVi ? "Chuyển tới nội dung chính" : "Skip to main content"}
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Left: Inline Brand Logo + Menu Bar */}
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/"
              id="nav-brand-logo"
              className="group flex shrink-0 items-center gap-2 rounded-lg"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-800/20 bg-teal-700 text-white shadow-2xs transition group-hover:bg-teal-800">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900">
                Lupiva
              </span>
            </Link>

            {/* Clean Horizontal Menu Bar */}
            <nav
              aria-label="Primary"
              className="flex items-center gap-1 overflow-x-auto"
            >
              {navLinks.map((item) => {
                const isActive =
                  item.href === "/ocr"
                    ? pathname === "/ocr" || pathname === "/crf"
                    : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    id={item.id}
                    aria-current={isActive ? "page" : undefined}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                      isActive
                        ? "bg-teal-50 text-teal-900"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                    {item.href === "/ocr" && crfPatients.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-teal-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-teal-800">
                        {crfPatients.length}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls: Session (only if logged in) or Sign In, and Compact Language Switcher on far right */}
          <div className="ml-auto flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-2xs">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    currentUser.role === "specialist"
                      ? "bg-teal-600"
                      : "bg-blue-600"
                  }`}
                />
                <span className="hidden text-xs font-semibold text-slate-900 sm:inline">
                  {currentUser.name}
                </span>
                <span className="hidden rounded bg-teal-50 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-teal-800 md:inline">
                  {currentUser.badgeText}
                </span>
                <button
                  type="button"
                  id="nav-btn-signout"
                  onClick={logout}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  {t.common.signOut}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                id="nav-btn-signin"
                className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {t.common.signIn}
              </Link>
            )}

            {/* Compact Bilingual English / Vietnamese Switcher (Far Right) */}
            <div
              className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label={t.common.languageToggleTitle}
            >
              <button
                type="button"
                id="nav-btn-language-toggle"
                onClick={toggleLanguage}
                aria-label={t.common.languageToggleTitle}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-200/60 cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="h-3 w-3 text-teal-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="flex items-center gap-0.5 font-mono text-[10px]">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage("en");
                    }}
                    className={`rounded px-1 py-0.2 transition ${
                      language === "en"
                        ? "bg-teal-700 font-bold text-white"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    EN
                  </span>
                  <span className="text-slate-300">/</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage("vi");
                    }}
                    className={`rounded px-1 py-0.2 transition ${
                      language === "vi"
                        ? "bg-teal-700 font-bold text-white"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    VI
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Global Toast Banner */}
      {visibleToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg transition-all duration-700 ease-out ${
            isFadingOut
              ? "opacity-0 translate-y-2 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
        >
          <div
            aria-hidden="true"
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
              visibleToast.tone === "teal"
                ? "bg-teal-700"
                : visibleToast.tone === "amber"
                  ? "bg-amber-600"
                  : "bg-slate-800"
            }`}
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1 text-xs">
            <p className="font-semibold text-slate-900">{visibleToast.title}</p>
            <p className="mt-0.5 text-slate-600">{visibleToast.description}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Close notification"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Interactive Button & Mock Data Reference Modal */}
      {isActionGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-button-map-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsActionGuideOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h2
                  id="modal-button-map-title"
                  className="text-base font-bold text-slate-900"
                >
                  {t.navbar.modalTitle}
                </h2>
                <p className="text-xs text-slate-600">
                  {t.navbar.modalDescription}
                </p>
              </div>
              <button
                type="button"
                id="modal-btn-close-guide"
                onClick={() => setIsActionGuideOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                {t.common.closeEsc}
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="modal-button-map-title"
                className="overflow-x-auto rounded-lg border border-slate-200"
              >
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThPage}
                      </th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThButton}
                      </th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThAction}
                      </th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThOutcome}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {localizedButtonMap.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-slate-900">
                          {item.page}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="inline-block rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-900">
                            {item.buttonLabel}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600">
                          {item.mockAction}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-700">
                          {item.expectedOutcome}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-600">
              <span>
                {t.common.allMockDataNotice}{" "}
                <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                  src/data/mockData.ts
                </code>
              </span>
              <button
                type="button"
                onClick={() => setIsActionGuideOpen(false)}
                className="rounded-lg bg-teal-700 px-4 py-1.5 font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                {t.common.gotIt}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
