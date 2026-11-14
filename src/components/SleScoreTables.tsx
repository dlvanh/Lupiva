"use client";

import React from "react";
import {
  EularAcrCriterionItem,
  SleCrfPatientRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";

interface SleScoreTablesProps {
  patient: SleCrfPatientRecord;
  isVi: boolean;
  readOnly?: boolean;
  onToggleAnaEntry?: (checked: boolean) => void;
  onToggleEular?: (criterionId: string, checked: boolean) => void;
  onToggleSledai?: (criterionId: string, checked: boolean) => void;
}

const CLINICAL_DOMAIN_ORDER = [
  "constitutional",
  "hematologic",
  "neuropsychiatric",
  "mucocutaneous",
  "serosal",
  "musculoskeletal",
  "renal",
] as const;

const IMMUNO_DOMAIN_ORDER = [
  "antiphospholipid",
  "complement",
  "sle_specific_ab",
] as const;

const EULAR_OCR_HINTS: Record<string, string[]> = {
  "eular-leukopenia": ["WBC-TOTAL"],
  "eular-thrombocytopenia": ["PLT-COUNT"],
  "eular-hemolysis": ["DAT-COOMBS"],
  "eular-proteinuria": ["UPROT-24H", "UPCR-SPOT"],
  "eular-apl": ["ACL-IGG", "ACL-IGM", "B2GP1-IGG", "LAC-CONFIRM"],
  "eular-comp-single": ["COMP-C3", "COMP-C4"],
  "eular-comp-both": ["COMP-C3", "COMP-C4"],
  "eular-sle-ab": ["ANTI-DSDNA"],
};

const SLEDAI_OCR_HINTS: Record<string, string[]> = {
  "sledai-hematuria": ["URINE-RBC"],
  "sledai-proteinuria": ["UPROT-24H"],
  "sledai-pyuria": ["URINE-WBC"],
  "sledai-low-comp": ["COMP-C3", "COMP-C4"],
  "sledai-dna": ["ANTI-DSDNA"],
  "sledai-thrombocytopenia": ["PLT-COUNT"],
  "sledai-leukopenia": ["WBC-TOTAL"],
};

export function SleScoreTables({
  patient,
  isVi,
  readOnly = false,
  onToggleAnaEntry,
  onToggleEular,
  onToggleSledai,
}: SleScoreTablesProps) {
  const eularSummary = calculateEularAcrSummary(
    patient.eularAcrCriteria,
    patient.anaEntryCriterionMet
  );
  const sledaiSummary = calculateSledai2kSummary(patient.sledai2kCriteria);

  const unresolvedOcrCount =
    patient.ocrFields.filter(
      (f) =>
        f.status === "manual_required" ||
        f.status === "needs_verify" ||
        !f.value.trim()
    ).length +
    patient.antibodyBlots.filter(
      (b) =>
        b.status === "manual_required" ||
        b.status === "needs_verify" ||
        !b.result
    ).length;

  const isApproved = getSubmissionStatus(patient) === "approved";

  const anaField = patient.ocrFields.find((f) => f.code === "ANA-HEP2");

  const getHintBadge = (codes?: string[]) => {
    if (!codes || codes.length === 0) return null;
    const matched = codes
      .map((code) => patient.ocrFields.find((f) => f.code === code))
      .filter((f): f is NonNullable<typeof f> => Boolean(f && f.value.trim()));
    if (matched.length === 0) return null;
    return matched
      .map((f) => `${f.code.replace("-TOTAL", "").replace("-COUNT", "")}: ${f.value}${f.unit && f.unit !== "Titer" && f.unit !== "Qualitative" ? ` ${f.unit}` : ""}`)
      .join(" • ");
  };

  const renderDomainGroups = (
    domainIds: readonly string[],
    items: EularAcrCriterionItem[]
  ) => {
    return domainIds.map((domId) => {
      const group = items.filter((c) => c.domainId === domId);
      if (group.length === 0) return null;
      const domainLabel = isVi ? group[0].domainLabelVi : group[0].domainLabelEn;
      const domainMax = eularSummary.domainMaxMap[domId]?.maxWeight ?? 0;

      return (
        <React.Fragment key={domId}>
          <tr className="bg-slate-100/90">
            <th
              colSpan={2}
              scope="colgroup"
              className="border-y border-slate-200 px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-800"
            >
              <div className="flex items-center justify-between">
                <span>{domainLabel}</span>
                {domainMax > 0 && (
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-900">
                    +{domainMax} {isVi ? "điểm miền" : "domain max"}
                  </span>
                )}
              </div>
            </th>
          </tr>
          {group.map((item) => {
            const isCountedMax = item.checked && item.weight === domainMax;
            const hint = getHintBadge(EULAR_OCR_HINTS[item.id]);
            return (
              <tr
                key={item.id}
                onClick={() => {
                  if (!readOnly && onToggleEular) {
                    onToggleEular(item.id, !item.checked);
                  }
                }}
                className={`border-b border-slate-200/80 text-xs transition ${
                  !readOnly && onToggleEular ? "cursor-pointer" : ""
                } ${
                  isCountedMax
                    ? "bg-teal-50/70"
                    : item.checked
                    ? "bg-slate-50"
                    : "hover:bg-slate-50/60"
                }`}
              >
                <td className="px-3 py-2 align-top">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={readOnly || !onToggleEular}
                      aria-label={isVi ? item.labelVi : item.labelEn}
                      onChange={(e) =>
                        onToggleEular?.(item.id, e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-teal-700 cursor-pointer disabled:cursor-default"
                    />
                    <div className="min-w-0">
                      <span
                        className={`font-medium ${
                          isCountedMax
                            ? "font-semibold text-teal-950"
                            : "text-slate-800"
                        }`}
                      >
                        {isVi ? item.labelVi : item.labelEn}
                      </span>
                      {hint && (
                        <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                          OCR: {hint}
                        </p>
                      )}
                      {item.checked && !isCountedMax && domainMax > 0 && (
                        <p className="mt-0.5 text-[10px] text-slate-500 italic">
                          {isVi
                            ? "Không cộng (đã lấy mức cao hơn trong miền)"
                            : "Superseded by higher weight in domain"}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="w-16 px-3 py-2 text-right align-top font-mono font-bold text-slate-900">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 ${
                      isCountedMax
                        ? "bg-teal-700 text-white"
                        : item.checked
                        ? "bg-slate-200 text-slate-700 line-through"
                        : "text-slate-700"
                    }`}
                  >
                    {item.weight}
                  </span>
                </td>
              </tr>
            );
          })}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Executive Score Summary Strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* EULAR/ACR 2019 Card */}
        <div
          className={`rounded-2xl border p-5 shadow-xs ${
            eularSummary.isClassifiedSle
              ? "border-teal-300 bg-teal-50/60"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-teal-800">
              {isVi ? "Phân loại EULAR/ACR 2019" : "2019 EULAR/ACR Classification"}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                eularSummary.isClassifiedSle
                  ? "bg-teal-700 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {eularSummary.isClassifiedSle
                ? isVi
                  ? "ĐẠT TIÊU CHUẨN SLE"
                  : "CLASSIFIED SLE (≥10)"
                : isVi
                ? "CHƯA ĐẠT (<10)"
                : "BELOW THRESHOLD"}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-slate-900">
              {eularSummary.totalScore}
            </span>
            <span className="text-xs font-medium text-slate-500">
              {isVi ? "điểm tổng" : "points total"} (
              {eularSummary.clinicalScore}{" "}
              {isVi ? "lâm sàng" : "clinical"} +{" "}
              {eularSummary.immunologicalScore}{" "}
              {isVi ? "miễn dịch" : "immunological"})
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {isVi ? "Tiêu chuẩn đầu vào ANA:" : "ANA Entry Criterion:"}{" "}
            <strong
              className={
                patient.anaEntryCriterionMet
                  ? "text-teal-800"
                  : "text-rose-700"
              }
            >
              {patient.anaEntryCriterionMet
                ? isVi
                  ? "Dương tính (Đạt)"
                  : "Positive (Met)"
                : isVi
                ? "Âm tính (Không phân loại SLE)"
                : "Negative (Do not classify)"}
            </strong>
            {anaField?.value ? ` (${anaField.value})` : ""}
          </p>
        </div>

        {/* SLEDAI-2K Card */}
        <div
          className={`rounded-2xl border p-5 shadow-xs ${
            sledaiSummary.badgeTone === "rose"
              ? "border-rose-300 bg-rose-50/50"
              : sledaiSummary.badgeTone === "amber"
              ? "border-amber-300 bg-amber-50/50"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {isVi ? "Hoạt tính bệnh SLEDAI-2K" : "SLEDAI-2K Disease Activity"}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                sledaiSummary.badgeTone === "rose"
                  ? "bg-rose-700 text-white"
                  : sledaiSummary.badgeTone === "amber"
                  ? "bg-amber-600 text-white"
                  : "bg-teal-700 text-white"
              }`}
            >
              {isVi ? sledaiSummary.activityTierVi : sledaiSummary.activityTierEn}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-slate-900">
              {sledaiSummary.totalScore}
            </span>
            <span className="text-xs font-medium text-slate-500">
              / 105 {isVi ? "điểm tối đa" : "max points"} •{" "}
              {patient.sledai2kCriteria.filter((c) => c.checked).length}{" "}
              {isVi ? "tiêu chuẩn dương tính" : "active descriptors"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {isVi
              ? "Đánh giá trên 24 biểu hiện lâm sàng và cận lâm sàng SLE."
              : "Assessed across 24 weighted clinical and laboratory descriptors."}
          </p>
        </div>

        {/* OCR Verification & Approval Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {isVi ? "Trạng thái Xác minh OCR" : "OCR Review & Sign-Off"}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                isApproved
                  ? "bg-teal-700 text-white"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {isApproved
                ? isVi
                  ? "ĐÃ PHÊ DUYỆT"
                  : "APPROVED"
                : isVi
                ? "CHỜ PHÊ DUYỆT"
                : "PENDING APPROVAL"}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold text-slate-900">
              {patient.studyId} • {patient.patientName}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {patient.signedOffBy
                ? isVi
                  ? `Ký duyệt bởi: ${patient.signedOffBy}`
                  : `Signed off by: ${patient.signedOffBy}`
                : unresolvedOcrCount > 0
                ? isVi
                  ? `Còn ${unresolvedOcrCount} trường OCR cần bác sĩ kiểm tra.`
                  : `${unresolvedOcrCount} OCR field(s) still awaiting doctor verification.`
                : isVi
                ? "Tất cả chỉ số OCR đã xác thực, sẵn sàng ký duyệt."
                : "All OCR fields verified and ready for physician sign-off."}
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 font-mono text-[10px]">
            {["COMP-C3", "COMP-C4", "ANTI-DSDNA", "UPROT-24H", "WBC-TOTAL"].map(
              (code) => {
                const f = patient.ocrFields.find((item) => item.code === code);
                if (!f) return null;
                return (
                  <span
                    key={code}
                    className={`rounded border px-1.5 py-0.5 ${
                      f.flag === "Normal"
                        ? "border-slate-200 bg-slate-50 text-slate-700"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    {code.replace("-TOTAL", "").replace("COMP-", "")}:{" "}
                    {f.value || "—"}
                  </span>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* TABLE 1: 2019 EULAR/ACR Classification Criteria (from 261112_EULAR.docx) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                {isVi
                  ? "Bảng 1. Tiêu chuẩn Phân loại Lupus Ban đỏ Hệ thống (SLE) EULAR/ACR 2019"
                  : "Table 1. The 2019 EULAR/ACR Classification Criteria for Systemic Lupus Erythematosus (SLE)"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {isVi
                  ? "Trong mỗi miền, chỉ tiêu chuẩn có điểm cao nhất được cộng vào tổng điểm."
                  : "Within each domain, only the highest-weighted criterion is counted toward the total score."}
              </p>
            </div>
            <div className="rounded-xl bg-slate-900 px-3.5 py-2 text-right font-mono text-white">
              <p className="text-[10px] uppercase text-slate-300">
                {isVi ? "Tổng điểm EULAR/ACR" : "EULAR/ACR Total"}
              </p>
              <p className="text-base font-bold">
                {eularSummary.totalScore}{" "}
                <span className="text-xs font-normal text-slate-300">
                  / ≥10
                </span>
              </p>
            </div>
          </div>

          {/* Obligatory ANA Entry Criterion Banner */}
          <label
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
              patient.anaEntryCriterionMet
                ? "border-teal-300 bg-teal-50/70 text-teal-950"
                : "border-rose-300 bg-rose-50 text-rose-950"
            } ${!readOnly && onToggleAnaEntry ? "cursor-pointer" : ""}`}
          >
            <div>
              <span className="font-bold">
                {isVi
                  ? "Tiêu chuẩn Đầu vào Bắt buộc (ANA): "
                  : "Entry Criterion (ANA): "}
              </span>
              <span>
                {isVi
                  ? "Nếu ANA âm tính, không phân loại là SLE. Nếu dương tính, áp dụng các tiêu chuẩn cộng dồn dưới đây."
                  : "If ANA is negative, do not classify as SLE. If positive, apply the following additive criteria."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {anaField?.value && (
                <span className="rounded bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800 border border-slate-200">
                  ANA: {anaField.value}
                </span>
              )}
              <input
                type="checkbox"
                checked={patient.anaEntryCriterionMet}
                disabled={readOnly || !onToggleAnaEntry}
                onChange={(e) => onToggleAnaEntry?.(e.target.checked)}
                className="h-4 w-4 accent-teal-700 cursor-pointer disabled:cursor-default"
              />
            </div>
          </label>
        </div>

        {/* Two-column Table matching 261112_EULAR.docx */}
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {/* Left Column: Clinical Domains */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
                  <th scope="col" className="px-3 py-2.5">
                    {isVi ? "Miền Lâm sàng (Clinical Domains)" : "Clinical Domains"}
                  </th>
                  <th scope="col" className="w-16 px-3 py-2.5 text-right">
                    {isVi ? "Điểm" : "Score"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {renderDomainGroups(
                  CLINICAL_DOMAIN_ORDER,
                  patient.eularAcrCriteria.filter(
                    (c) => c.domainCategory === "clinical"
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Right Column: Immunological Domains + General Rules */}
          <div className="flex flex-col justify-between">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
                    <th scope="col" className="px-3 py-2.5">
                      {isVi
                        ? "Miền Miễn dịch học (Immunological Domains)"
                        : "Immunological Domains"}
                    </th>
                    <th scope="col" className="w-16 px-3 py-2.5 text-right">
                      {isVi ? "Điểm" : "Score"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renderDomainGroups(
                    IMMUNO_DOMAIN_ORDER,
                    patient.eularAcrCriteria.filter(
                      (c) => c.domainCategory === "immunological"
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* General Rules Box from 261112_EULAR.docx */}
            <div className="m-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <p className="font-bold uppercase tracking-wide text-slate-900">
                {isVi ? "Quy tắc Chung (General Rules):" : "General Rules:"}
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                <li>
                  {isVi
                    ? "Không tính một tiêu chuẩn nếu có nguyên nhân khác hợp lý hơn SLE."
                    : "Do not count a criterion if there is a more likely explanation than SLE."}
                </li>
                <li>
                  {isVi
                    ? "Tiêu chuẩn chỉ cần xuất hiện ít nhất một lần là đủ để tính."
                    : "The occurrence of a criterion on at least one occasion is sufficient."}
                </li>
                <li>
                  {isVi
                    ? "Phải có ít nhất một tiêu chuẩn lâm sàng."
                    : "At least one clinical criterion must be present."}
                </li>
                <li>
                  {isVi
                    ? "Các tiêu chuẩn không cần xuất hiện đồng thời."
                    : "Criteria do not need to occur simultaneously."}
                </li>
                <li>
                  {isVi
                    ? "Trong mỗi miền, chỉ tiêu chuẩn có trọng số cao nhất được tính vào tổng điểm."
                    : "Within each domain, only the highest-weighted criterion is counted toward the total score."}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Threshold & Validation Stats from 261112_EULAR.docx */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-700">
          <p>
            <strong className="text-slate-900">
              {isVi ? "Phân loại:" : "Classification:"}
            </strong>{" "}
            {isVi
              ? "Phân loại là SLE nếu đạt tiêu chuẩn đầu vào và tổng điểm ≥10."
              : "Classify as SLE if the entry criterion is met and the patient has a total score of ≥10."}
          </p>
          <span className="font-mono text-[11px] font-semibold text-slate-600">
            Sensitivity: 0.96, Specificity: 0.93
          </span>
        </div>
      </section>

      {/* TABLE 2: SLEDAI-2K Scoring System (from 261112_SLEDAI-2K.docx) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 sm:text-base">
              {isVi
                ? "Bảng 2: Hệ thống Tính điểm Hoạt tính Bệnh SLEDAI-2K"
                : "Table 2: The SLEDAI-2K Scoring System"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {isVi
                ? "24 tiêu chuẩn đánh giá hoạt tính bệnh SLE có trọng số (8, 4, 2, 1 điểm)."
                : "24 weighted clinical & laboratory descriptors for SLE disease activity (8, 4, 2, 1 pts)."}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-right font-mono">
            <p className="text-[10px] font-bold uppercase text-rose-700">
              {isVi ? sledaiSummary.activityTierVi : sledaiSummary.activityTierEn}
            </p>
            <p className="text-base font-bold text-rose-950">
              SLEDAI-2K = {sledaiSummary.totalScore}
            </p>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label={
            isVi
              ? "Bảng 2: Hệ thống tính điểm SLEDAI-2K"
              : "Table 2: The SLEDAI-2K Scoring System"
          }
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
                <th scope="col" className="w-16 px-4 py-2.5 text-center">
                  {isVi ? "Điểm" : "Score"}
                </th>
                <th scope="col" className="w-52 px-4 py-2.5">
                  {isVi ? "Tiêu chuẩn" : "Criterion"}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {isVi ? "Định nghĩa" : "Definition"}
                </th>
                <th scope="col" className="w-20 px-4 py-2.5 text-center">
                  {isVi ? "Áp dụng" : "Present"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {patient.sledai2kCriteria.map((item) => {
                const hint = getHintBadge(SLEDAI_OCR_HINTS[item.id]);
                return (
                  <tr
                    key={item.id}
                    onClick={() => {
                      if (!readOnly && onToggleSledai) {
                        onToggleSledai(item.id, !item.checked);
                      }
                    }}
                    className={`transition ${
                      !readOnly && onToggleSledai ? "cursor-pointer" : ""
                    } ${
                      item.checked ? "bg-rose-50/60" : "hover:bg-slate-50/70"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-900">
                      <span
                        className={`inline-block rounded px-2 py-0.5 ${
                          item.checked
                            ? "bg-rose-700 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.weight}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">
                      <div>{isVi ? item.criterionVi : item.criterionEn}</div>
                      {hint && (
                        <div className="mt-0.5 font-mono text-[10px] font-medium text-teal-800">
                          OCR: {hint}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 leading-relaxed text-slate-600">
                      {isVi ? item.definitionVi : item.definitionEn}
                    </td>
                    <td
                      className="px-4 py-2.5 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        disabled={readOnly || !onToggleSledai}
                        aria-label={isVi ? item.criterionVi : item.criterionEn}
                        onChange={(e) =>
                          onToggleSledai?.(item.id, e.target.checked)
                        }
                        className="h-4 w-4 accent-teal-700 cursor-pointer disabled:cursor-default"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
