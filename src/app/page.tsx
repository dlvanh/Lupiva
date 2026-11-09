"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MOCK_LAB_REPORTS, BUTTON_ACTION_MAP } from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";

export default function LandingPage() {
  const router = useRouter();
  const {
    setSelectedReportId,
    setIsActionGuideOpen,
    savedRecords,
    currentUser,
  } = useLupiva();

  const handleOpenSampleReport = (reportId: string) => {
    setSelectedReportId(reportId);
    router.push("/ocr");
  };

  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Column: Clinical Copy & Primary Actions */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span className="font-mono font-semibold text-teal-800">
                  VINMEC INNOVATION CHALLENGE 2026
                </span>
                <span className="text-slate-300">•</span>
                <span>Clinical Immunology &amp; Allergy</span>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
                Standardized Lupus Lab OCR &amp; Physician-Verified e-CRF
                Registry
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                <strong>Lupiva</strong> transforms paper and PDF immunology lab
                reports into structured{" "}
                <span className="font-medium text-slate-800">
                  Systemic Lupus Erythematosus (SLE)
                </span>{" "}
                registry records. Powered by side-by-side optical character
                recognition, bounding-box grounding, and mandatory
                Physician-in-the-Loop (HITL) verification.
              </p>

              {/* Hero Action Buttons */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/ocr"
                  id="hero-btn-launch-ocr"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
                >
                  <span>Launch Document OCR Workspace</span>
                  <span aria-hidden="true">→</span>
                </Link>

                <Link
                  href="/login"
                  id="hero-btn-login"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <span>
                    {currentUser
                      ? `Switch Role (${currentUser.role === "specialist" ? "Specialist" : "Patient"})`
                      : "Specialist / Patient Login"}
                  </span>
                </Link>

                <button
                  type="button"
                  id="hero-btn-button-map"
                  onClick={() => setIsActionGuideOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-200/70 cursor-pointer"
                >
                  <span>View Interactive Button Map ({BUTTON_ACTION_MAP.length})</span>
                </button>
              </div>

              {/* Clinical Key Metrics Bar */}
              <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    SLE Lab Panels Mapped
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-slate-900">
                    3 Core e-CRFs
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    Serology, Renal, Hematology
                  </p>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    HITL Confidence Gate
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-teal-800">
                    &ge; 85% Auto
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    Flagged review below threshold
                  </p>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    Session e-CRF Commits
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-bold text-slate-900">
                    {savedRecords.length} Saved
                  </dd>
                  <p className="text-[11px] text-slate-500">
                    Ready for FHIR / JSON export
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
                      PREVIEW: SLE SEROLOGY e-CRF EXTRACTION
                    </span>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                    2 Fields Need Review
                  </span>
                </div>

                <div className="space-y-3 p-4">
                  {MOCK_LAB_REPORTS[0].fields.slice(0, 4).map((field) => {
                    const needsReview = !field.verified || field.confidence < 85;
                    return (
                      <div
                        key={field.id}
                        className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                          needsReview
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
                            <span className="font-mono text-sm font-bold text-slate-900">
                              {field.value}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {field.unit}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                field.flag === "Normal"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {field.flag}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                needsReview
                                  ? "bg-amber-200/80 text-amber-950"
                                  : "bg-teal-100 text-teal-900"
                              }`}
                            >
                              {field.confidence}% OCR
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    id="preview-card-btn-open-ocr"
                    onClick={() => handleOpenSampleReport(MOCK_LAB_REPORTS[0].id)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
                  >
                    <span>Open Full Split-Screen Review &amp; Verify C3/C4</span>
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
              How the Physician-in-the-Loop (HITL) OCR Workflow Operates
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Designed around medical Document AI safety standards: source
              grounding, confidence triage, and explicit specialist sign-off.
            </p>
          </div>
          <Link
            href="/ocr"
            className="text-xs font-semibold text-teal-800 hover:underline"
          >
            Jump straight to OCR Workspace →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800">
                STEP 01
              </span>
              <span className="text-xs font-medium text-slate-500">
                Document Capture
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              Select or Upload SLE Lab Report
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Patients or clinical coordinators upload a hospital lab sheet
              (Serology, 24h Urinalysis, or CBC) or choose from 3 pre-loaded
              Vinmec SLE sample panels.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-mono text-xs font-bold text-amber-900">
                STEP 02
              </span>
              <span className="text-xs font-medium text-amber-800">
                Side-by-Side Grounding
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              Inspect Bounding Boxes &amp; Flagged Reads
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Clicking any biomarker row highlights its exact bounding box on
              the original lab report. Values below{" "}
              <span className="font-mono font-semibold">85%</span> confidence
              are flagged in amber for human verification.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-teal-100 px-2.5 py-1 font-mono text-xs font-bold text-teal-900">
                STEP 03
              </span>
              <span className="text-xs font-medium text-teal-800">
                Standardized e-CRF
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              Approve &amp; Commit to SLE Registry
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Once verified, the structured panel is saved to the patient&apos;s
              longitudinal e-CRF profile with automated SLEDAI-2K biomarker
              scoring and JSON export.
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
                Interactive Mock Lab Reports Ready for Testing
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Click any report card below to load its scanned document and
                mock biomarker dataset directly into the OCR Workspace.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {MOCK_LAB_REPORTS.map((report, index) => {
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
                        SAMPLE #{index + 1}
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
                        {abnormalCount} Abnormal Flags
                      </span>
                      <span className="font-medium text-amber-800">
                        {needsReviewCount} Low-Confidence OCR Reads
                      </span>
                    </div>
                    <button
                      type="button"
                      id={`sample-card-btn-${report.id}`}
                      onClick={() => handleOpenSampleReport(report.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800 cursor-pointer"
                    >
                      <span>Inspect in OCR Workspace</span>
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
