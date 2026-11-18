"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import { DoctorWorkspace } from "@/components/DoctorWorkspace";

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

const BENEFIT_ICONS = [
  // Improved Treatment
  <svg
    key="heart"
    aria-hidden="true"
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>,
  // Anonymity and Security
  <svg
    key="shield"
    aria-hidden="true"
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>,
];

export default function LandingPage() {
  const { t, currentUser, authLoading } = useLupiva();
  const l = t.landing;

  if (authLoading) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy="true"
        className="flex-1 bg-slate-50 py-12 focus:outline-none"
      >
        <div className="mx-auto max-w-6xl space-y-4 px-4 sm:px-6 lg:px-8">
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </main>
    );
  }

  if (currentUser?.role === "specialist") {
    return <DoctorWorkspace />;
  }

  const sectionAnchors = [
    { href: "#boi-canh", label: l.navBackground },
    { href: "#hoat-dong", label: l.navHowItWorks },
    { href: "#quyen-loi", label: l.navBenefits },
    { href: "#dang-ky", label: l.navRegistration },
  ];

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      {/* Hero Section */}
      <section className="border-b border-teal-950 bg-teal-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-950 shadow-xs sm:text-sm">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-teal-700"
              />
              <span>{l.programTag}</span>
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.2]">
              {l.heroTitle}
            </h1>

            <p className="mt-5 text-base leading-relaxed text-teal-50/95 sm:text-lg sm:leading-8">
              {l.heroDescription}
            </p>

            {/* Primary Dual-Audience Buttons (Both Navigate to /login) */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href="/login?role=patient"
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
                <span>{l.patientCta}</span>
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
                <span>{l.doctorCta}</span>
                <ArrowRightIcon />
              </Link>
            </div>
          </div>

          {/* Quick Section Anchors */}
          <nav
            aria-label={l.programTag}
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

      {/* Section 1: Bối cảnh */}
      <section
        id="boi-canh"
        aria-labelledby="heading-background"
        className="scroll-mt-16 border-b border-slate-200 bg-slate-50/70 py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
              {l.backgroundKicker}
            </p>
            <h2
              id="heading-background"
              className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
            >
              {l.backgroundTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              {l.backgroundLead}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {l.backgroundCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-7"
              >
                <h3 className="text-lg font-bold text-slate-900">
                  {card.title}
                </h3>
                <p className="mt-2.5 text-sm leading-7 text-slate-600 sm:text-[15px]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Registry hoạt động như nào */}
      <section
        id="hoat-dong"
        aria-labelledby="heading-how-it-works"
        className="scroll-mt-16 border-b border-slate-200 bg-white py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
              {l.howItWorksKicker}
            </p>
            <h2
              id="heading-how-it-works"
              className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
            >
              {l.howItWorksTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              {l.howItWorksSubtitle}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {l.howItWorksSteps.map((step, index) => (
              <div
                key={step.title}
                className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-7"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    {step.stepLabel}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-7 text-slate-600 sm:text-[15px]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Quyền lợi của bệnh nhân */}
      <section
        id="quyen-loi"
        aria-labelledby="heading-benefits"
        className="scroll-mt-16 border-b border-slate-200 bg-slate-50/70 py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
              {l.benefitsKicker}
            </p>
            <h2
              id="heading-benefits"
              className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
            >
              {l.benefitsTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              {l.benefitsSubtitle}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {l.benefitsItems.map((item, idx) => (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-7"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-800">
                  {BENEFIT_ICONS[idx % BENEFIT_ICONS.length]}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Cách thức đăng ký */}
      <section
        id="dang-ky"
        aria-labelledby="heading-registration"
        className="scroll-mt-16 bg-white py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
              {l.registrationKicker}
            </p>
            <h2
              id="heading-registration"
              className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl"
            >
              {l.registrationTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              {l.registrationSubtitle}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Step 1: E-consent form (Button -> /login) */}
            <Link
              href="/login?role=patient&mode=register"
              id="reg-btn-econsent"
              className="group flex flex-col justify-between rounded-2xl border-2 border-teal-300 bg-teal-50/50 p-6 text-left shadow-2xs transition hover:-translate-y-0.5 hover:border-teal-600 hover:bg-teal-50 hover:shadow-md sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white transition group-hover:bg-teal-800">
                      1
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-900">
                      {l.regStep1Title}
                    </h3>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-800 shadow-2xs transition group-hover:bg-teal-700 group-hover:text-white">
                    <ArrowRightIcon />
                  </span>
                </div>
                <p className="mt-4 rounded-xl border border-teal-200/80 bg-white px-4 py-3 text-sm font-semibold text-teal-950">
                  {l.regStep1Rule}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  {l.regStep1Desc}
                </p>
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 group-hover:text-teal-950">
                <span>{l.regStepAction}</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>

            {/* Step 2: Submit records (Button -> /login) */}
            <Link
              href="/login?role=patient"
              id="reg-btn-submit-records"
              className="group flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-6 text-left shadow-2xs transition hover:-translate-y-0.5 hover:border-teal-600 hover:bg-white hover:shadow-md sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white transition group-hover:bg-teal-700">
                      2
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-900">
                      {l.regStep2Title}
                    </h3>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-2xs transition group-hover:bg-teal-700 group-hover:text-white">
                    <ArrowRightIcon />
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
                  {l.regStep2Desc}
                </p>
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 group-hover:text-teal-950">
                <span>{l.regStepAction}</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p className="font-semibold text-slate-800">{t.common.brandName}</p>
          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-600">
            <Link href="/login?role=patient" className="hover:text-teal-800">
              {l.patientCta}
            </Link>
            <Link href="/login?role=specialist" className="hover:text-teal-800">
              {l.doctorCta}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
