"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import { SITE_CONTENT, SITE_NAME } from "@/components/landing/siteContent";

/** The start action for the current visitor: register, sign the consent, or submit. */
export function useStartAction() {
  const { currentUser, t } = useLupiva();
  const copy = t.patientPortal;
  return currentUser?.role === "patient"
    ? currentUser.consentSigned
      ? { href: "/upload", label: copy.submitMenuLabel }
      : { href: "/login?consent=1", label: copy.step1Btn }
    : { href: "/login?mode=register", label: copy.startBtn };
}

function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function RegistryOverview() {
  const { language } = useLupiva();
  const home = SITE_CONTENT[language].home;

  const sectionAnchors = [
    { href: "#muc-tieu", label: home.navAims },
    { href: "#van-hanh", label: home.navWorkflow },
    { href: "#huong-phat-trien", label: home.navFuture },
    { href: "#thanh-vien", label: home.navMembers },
  ];

  return (
    <section className="border-b border-teal-950 bg-teal-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.2]">
            {SITE_NAME}
          </h1>

          <p className="mt-5 text-base leading-relaxed text-teal-50/95 sm:text-lg sm:leading-8">
            {home.intro}
          </p>

          {/* Primary Dual-Audience Navigation Buttons (No Submit CTA on Home) */}
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Link
              href="/benh-nhan"
              id="hero-btn-patient"
              className="inline-flex min-h-12 items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-teal-900 shadow-sm transition hover:bg-teal-50 sm:text-base"
            >
              <svg
                aria-hidden="true"
                className="h-4.5 w-4.5 text-teal-800"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{home.patientsBtn}</span>
              <ArrowRightIcon />
            </Link>

            <Link
              href="/login?role=specialist"
              id="hero-btn-doctor"
              className="inline-flex min-h-12 items-center gap-2.5 rounded-lg border border-teal-400/50 bg-teal-800/80 px-6 py-3 text-sm font-semibold text-white shadow-2xs transition hover:border-teal-200 hover:bg-teal-800 sm:text-base"
            >
              <svg
                aria-hidden="true"
                className="h-4.5 w-4.5 text-teal-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                <circle cx="20" cy="10" r="2" />
              </svg>
              <span>{home.doctorBtn}</span>
              <ArrowRightIcon />
            </Link>
          </div>
        </div>

        {/* Quick Section Anchors */}
        <nav
          aria-label={SITE_NAME}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-teal-800 pt-5"
        >
          {sectionAnchors.map((item, idx) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-teal-100 transition hover:text-white"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-teal-700 bg-teal-800 text-xs font-bold text-teal-100">
                {idx + 1}
              </span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
