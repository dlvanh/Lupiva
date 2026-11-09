"use client";

import React from "react";
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
    savedRecords,
    isActionGuideOpen,
    setIsActionGuideOpen,
    toast,
    dismissToast,
  } = useLupiva();

  const navLinks = [
    { href: "/", label: t.navbar.overviewWorkflow, id: "nav-link-home" },
    { href: "/login", label: t.navbar.roleLogin, id: "nav-link-login" },
    { href: "/ocr", label: t.navbar.ocrWorkspace, id: "nav-link-ocr" },
  ];

  const localizedButtonMap = getLocalizedButtonActionMap(language);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              id="nav-brand-logo"
              className="group flex items-center gap-2.5 focus:outline-none"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white shadow-xs transition group-hover:bg-teal-800">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-slate-900">
                    Lupiva
                  </span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                    e-CRF v1.0
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {t.common.brandSubtitle}
                </p>
              </div>
            </Link>
          </div>

          {/* Primary Navigation Links */}
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 rounded-lg bg-slate-100/90 p-1"
          >
            {navLinks.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={item.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    isActive
                      ? "bg-white text-teal-800 shadow-xs"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                  {item.href === "/ocr" && savedRecords.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-800">
                      {savedRecords.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Controls: Language Switcher, Button Map Guide & Active Session */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Bilingual English / Vietnamese Toggle Button */}
            <div
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-2xs"
              role="group"
              aria-label={t.common.languageToggleTitle}
            >
              <button
                type="button"
                id="nav-btn-language-toggle"
                onClick={toggleLanguage}
                title={t.common.languageToggleTitle}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200/60 cursor-pointer"
              >
                {/* Globe Icon */}
                <svg
                  className="h-3.5 w-3.5 text-teal-700"
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
                <div className="flex items-center gap-1 font-mono text-[11px]">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage("en");
                    }}
                    className={`rounded px-1.5 py-0.5 transition ${
                      language === "en"
                        ? "bg-teal-700 font-bold text-white shadow-xs"
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
                    className={`rounded px-1.5 py-0.5 transition ${
                      language === "vi"
                        ? "bg-teal-700 font-bold text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    VI
                  </span>
                </div>
              </button>
            </div>

            {/* UI Button Map Modal Trigger */}
            <button
              type="button"
              id="nav-btn-action-guide"
              onClick={() => setIsActionGuideOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-600/40 hover:bg-teal-50/50 hover:text-teal-900 cursor-pointer"
              title={t.navbar.inspectButtonsTitle}
            >
              <svg
                className="h-3.5 w-3.5 text-teal-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{t.navbar.uiButtonMap}</span>
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-2xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    currentUser.role === "specialist"
                      ? "bg-teal-600"
                      : "bg-blue-600"
                  }`}
                />
                <div className="hidden text-left md:block">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-900">
                      {currentUser.name}
                    </p>
                    <span className="rounded bg-teal-50 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-teal-800">
                      {currentUser.badgeText}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {currentUser.role === "specialist"
                      ? t.common.activeModeSpecialist
                      : t.common.activeModePatient}
                  </p>
                </div>
                <button
                  type="button"
                  id="nav-btn-signout"
                  onClick={logout}
                  className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  {t.common.signOut}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                id="nav-btn-signin"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                <span>{t.common.signIn}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Global Toast Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <div
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
              toast.tone === "teal"
                ? "bg-teal-700"
                : toast.tone === "amber"
                ? "bg-amber-600"
                : "bg-slate-800"
            }`}
          >
            ✓
          </div>
          <div className="flex-1 text-xs">
            <p className="font-semibold text-slate-900">{toast.title}</p>
            <p className="mt-0.5 text-slate-600">{toast.description}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Close notification"
          >
            ✕
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
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
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
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                      <th className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThPage}
                      </th>
                      <th className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThButton}
                      </th>
                      <th className="px-3.5 py-2.5 font-semibold">
                        {t.navbar.modalThAction}
                      </th>
                      <th className="px-3.5 py-2.5 font-semibold">
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
