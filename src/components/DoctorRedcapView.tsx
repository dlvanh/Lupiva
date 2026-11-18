"use client";

import React, { useMemo } from "react";
import { useLupiva } from "@/context/LupivaContext";
import {
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

export function DoctorRedcapView() {
  const { language, crfPatients, openDoctorPatientCrf, showToast } = useLupiva();
  const isVi = language === "vi";

  const approvedPatients = useMemo(
    () => crfPatients.filter((p) => getSubmissionStatus(p) === "approved"),
    [crfPatients]
  );

  const handleExportCsv = () => {
    if (approvedPatients.length === 0) return;

    const header = [
      "record_id",
      "demog_age",
      "demog_gender",
      "icf_signed_date",
      "height_cm",
      "weight_kg",
      "eular_total_score",
      "eular_classified_sle",
      "sledai_total_score",
      "crf_signed_by",
      "sle_crf_complete",
    ];

    const rows = approvedPatients.map((p) => {
      const eular = calculateEularAcrSummary(
        p.eularAcrCriteria,
        p.anaEntryCriterionMet
      );
      const sledai = calculateSledai2kSummary(p.sledai2kCriteria);
      return [
        p.studyId,
        p.age,
        p.gender === "Female" ? 1 : 2,
        p.icfSignedDate,
        p.heightCm,
        p.weightKg,
        eular.totalScore,
        eular.isClassifiedSle ? 1 : 0,
        sledai.totalScore,
        p.signedOffBy ?? "",
        2,
      ]
        .map(escapeCsvCell)
        .join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lupiva-redcap-export.csv";
    a.click();
    URL.revokeObjectURL(url);

    showToast(
      isVi ? "Đã xuất CSV chuẩn REDCap" : "Exported REDCap CSV",
      isVi
        ? `Đã tải xuống ${approvedPatients.length} hồ sơ đã phê duyệt.`
        : `Downloaded ${approvedPatients.length} approved record(s).`,
      "teal"
    );
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 py-6 focus:outline-none"
    >
      <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
        {/* Minimal REDCap Status Banner */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">REDCap</h1>
              <p className="mt-1 text-xs text-slate-600">
                {isVi
                  ? "Chưa có quyền truy cập trực tiếp lên máy chủ REDCap. Tài liệu tích hợp nằm tại src/app/redcap/README.md."
                  : "Direct REDCap server access is not yet configured. See src/app/redcap/README.md for integration notes."}
              </p>
            </div>
            <button
              type="button"
              id="redcap-btn-export-csv"
              disabled={approvedPatients.length === 0}
              onClick={handleExportCsv}
              className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isVi ? "Xuất CSV chuẩn REDCap" : "Export REDCap CSV"}
            </button>
          </div>
        </section>

        {/* Minimal Table of Approved Records Ready for REDCap */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              {isVi
                ? `Hồ sơ đã phê duyệt (${approvedPatients.length})`
                : `Approved Records (${approvedPatients.length})`}
            </h2>
          </div>

          {approvedPatients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {isVi
                ? "Chưa có hồ sơ nào được phê duyệt để xuất sang REDCap."
                : "No approved dossiers ready for REDCap yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Study ID
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {isVi ? "Bệnh nhân" : "Patient"}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      EULAR/ACR 2019
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      SLEDAI-2K
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {isVi ? "Trạng thái REDCap" : "REDCap Status"}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {isVi ? "Thao tác" : "Action"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {approvedPatients.map((p) => {
                    const eular = calculateEularAcrSummary(
                      p.eularAcrCriteria,
                      p.anaEntryCriterionMet
                    );
                    const sledai = calculateSledai2kSummary(p.sledai2kCriteria);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                          {p.studyId}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {p.patientName}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-800">
                          {eular.totalScore}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-800">
                          {sledai.totalScore}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {isVi ? "Chờ kết nối REDCap" : "Awaiting REDCap access"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openDoctorPatientCrf(p.id)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            {isVi ? "Xem CRF" : "Open CRF"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
