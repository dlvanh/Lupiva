"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BUTTON_ACTION_MAP } from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";
import { getLocalizedLabReports } from "@/data/translations";

export default function LandingPage() {
  const router = useRouter();
  const {
    language,
    t,
    setSelectedReportId,
    setIsActionGuideOpen,
    savedRecords,
    currentUser,
  } = useLupiva();

  const localizedReports = getLocalizedLabReports(language);

  const handleOpenSampleReport = (reportId: string) => {
    setSelectedReportId(reportId);
    router.push("/ocr");
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Column: Clinical Copy & Primary Actions */}
            <div className="lg:col-span-7">
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

                <Link
                  href="/ocr"
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

                <Link
                  href="/login"
                  id="hero-btn-login"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <span>
                    {currentUser
                      ? t.landing.switchRoleBtn(currentUser.role)
                      : t.landing.loginBtn}
                  </span>
                </Link>

                <button
                  type="button"
                  id="hero-btn-button-map"
                  onClick={() => setIsActionGuideOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200/70 cursor-pointer"
                >
                  <span>
                    {t.landing.viewButtonMapBtn(BUTTON_ACTION_MAP.length)}
                  </span>
                </button>
              </div>

              {/* Clinical Key Metrics Bar */}
              <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    {t.landing.metricPanelsTitle}
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-slate-900">
                    {t.landing.metricPanelsVal}
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    {t.landing.metricPanelsSub}
                  </p>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    {t.landing.metricConfidenceTitle}
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-teal-800">
                    {t.landing.metricConfidenceVal}
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    {t.landing.metricConfidenceSub}
                  </p>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    {t.landing.metricCommitsTitle}
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-slate-900">
                    {t.landing.metricCommitsVal(savedRecords.length)}
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    {t.landing.metricCommitsSub}
                  </p>
                </div>
              </dl>
            </div>

            {/* Right Column: Live Interactive Preview Card of the Split OCR UI */}
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {t.landing.previewBadge}
                    </span>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                    {t.landing.previewNeedsReview(2)}
                  </span>
                </div>

                <div className="space-y-3 p-4">
                  {localizedReports[0].fields.slice(0, 4).map((field) => {
                    const isManual = !field.verified && field.confidence < 80;
                    const isVerify =
                      !field.verified &&
                      field.confidence >= 80 &&
                      field.confidence <= 90;
                    const flagLabel =
                      field.flag === "Normal"
                        ? t.common.normal
                        : field.flag === "High"
                        ? t.common.high
                        : field.flag === "Low"
                        ? t.common.low
                        : t.common.positive;

                    return (
                      <div
                        key={field.id}
                        className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                          isManual
                            ? "border-rose-300 bg-rose-50/70"
                            : isVerify
                            ? "border-amber-300 bg-amber-50/70"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-slate-500">
                              {field.code}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {field.name}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Ref: {field.referenceRange}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isManual ? (
                              <span className="font-mono text-xs font-bold text-rose-700">
                                {language === "vi"
                                  ? "[Trống — Xem bản gốc]"
                                  : "[Blank — Check Scan]"}
                              </span>
                            ) : (
                              <>
                                <span className="font-mono text-sm font-bold text-slate-900">
                                  {field.value}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  {field.unit}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                field.flag === "Normal"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {flagLabel}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                isManual
                                  ? "bg-rose-200 text-rose-950"
                                  : isVerify
                                  ? "bg-amber-200/80 text-amber-950"
                                  : "bg-teal-100 text-teal-900"
                              }`}
                            >
                              {isManual
                                ? `<80% (${field.confidence}%) Manual`
                                : isVerify
                                ? `80–90% (${field.confidence}%) Verify`
                                : `>90% (${field.confidence}%) Auto`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    id="preview-card-btn-open-ocr"
                    onClick={() => handleOpenSampleReport(localizedReports[0].id)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
                  >
                    <span>{t.landing.previewOpenOcrBtn}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Step Clinical OCR Workflow Section */}
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
            href="/ocr"
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

      {/* Pre-Loaded Mock SLE Lab Reports Section */}
      <section className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                {t.landing.mockSectionTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t.landing.mockSectionSub}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {localizedReports.map((report, index) => {
              const needsReviewCount = report.fields.filter(
                (f) => !f.verified || f.confidence < 85
              ).length;
              const abnormalCount = report.fields.filter(
                (f) => f.flag !== "Normal"
              ).length;

              return (
                <div
                  key={report.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition hover:border-teal-700/40 hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                        {t.landing.sampleBadge(index + 1)}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {report.collectionDate}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-slate-900">
                      {report.title}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-teal-800">
                      {report.subtitle}
                    </p>
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                      {report.clinicalSummary}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {report.fields.map((f) => (
                        <span
                          key={f.id}
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-slate-700"
                        >
                          {f.code}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-200/80 pt-4">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-rose-700">
                        {t.landing.abnormalBadge(abnormalCount)}
                      </span>
                      <span className="font-medium text-amber-800">
                        {t.landing.needsReviewBadge(needsReviewCount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      id={`sample-card-btn-${report.id}`}
                      onClick={() => handleOpenSampleReport(report.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800 cursor-pointer"
                    >
                      <span>{t.landing.inspectCardBtn}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
