"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PatientInfoSections } from "@/components/landing/PatientInfoSections";
import { useLupiva } from "@/context/LupivaContext";

export default function LandingPage() {
  const {
    language,
    t,
    currentUser,
  } = useLupiva();

  const isSpecialist = currentUser?.role === "specialist";
  const router = useRouter();

  // Doctors have no overview page: their home is the dashboard.
  useEffect(() => {
    if (isSpecialist) router.replace("/upload");
  }, [isSpecialist, router]);


  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Column: Clinical Copy & Primary Actions */}
            <div className="lg:col-span-12">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span className="font-mono font-semibold text-teal-800">
                  {t.landing.challengeTag}
                </span>
                <span aria-hidden="true" className="text-slate-300">•</span>
                <span>{t.landing.specialtyTag}</span>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[40px] lg:leading-[1.15]">
                {t.landing.heroTitle}
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                {t.landing.heroDescription}
              </p>

              {/* Hero Action Buttons */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/upload"
                  id="hero-btn-launch-crf"
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-teal-800"
                >
                  <span>
                    {language === "vi"
                      ? "1. Bệnh nhân: Tải tài liệu lên"
                      : "1. Patient: Upload your document"}
                  </span>
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
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
                </Link>

                {isSpecialist && (
                  <Link
                    href="/upload"
                    id="hero-btn-launch-ocr"
                    className="inline-flex items-center gap-2 rounded-lg border border-teal-700/35 bg-teal-50 px-5 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
                  >
                    <span>{t.landing.launchOcrBtn}</span>
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
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
                  </Link>
                )}

                {!currentUser && (
                <Link
                  href="/login"
                  id="hero-btn-login"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <span>{t.landing.loginBtn}</span>
                </Link>
                )}

              </div>

            </div>

          </div>
        </div>
      </section>

      {isSpecialist ? <SpecialistWorkflow /> : <PatientInfoSections />}
    </main>
  );
}

function SpecialistWorkflow() {
  const { t } = useLupiva();

  return (
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {t.landing.workflowSectionTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t.landing.workflowSectionSub}
            </p>
          </div>
          <Link
            href={"/upload"}
            className="text-xs font-semibold text-teal-800 hover:underline"
          >
            {t.landing.workflowJumpLink}
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800">
                {t.landing.step1Tag}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {t.landing.step1Category}
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              {t.landing.step1Title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {t.landing.step1Desc}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-mono text-xs font-bold text-amber-900">
                {t.landing.step2Tag}
              </span>
              <span className="text-xs font-medium text-amber-800">
                {t.landing.step2Category}
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              {t.landing.step2Title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {t.landing.step2Desc}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-teal-100 px-2.5 py-1 font-mono text-xs font-bold text-teal-900">
                {t.landing.step3Tag}
              </span>
              <span className="text-xs font-medium text-teal-800">
                {t.landing.step3Category}
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              {t.landing.step3Title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {t.landing.step3Desc}
            </p>
          </div>
        </div>
      </section>

  );
}
