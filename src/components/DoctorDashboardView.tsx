"use client";

import React, { useMemo } from "react";
import { useLupiva } from "@/context/LupivaContext";
import { getSubmissionStatus } from "@/data/crfData";

export function DoctorDashboardView() {
  const {
    language,
    crfPatients,
    setDoctorActiveTab,
    openDoctorPatientCrf,
    createNewCrfPatient,
  } = useLupiva();
  const isVi = language === "vi";

  const { pendingCount, approvedCount } = useMemo(() => {
    let pending = 0;
    let approved = 0;
    for (const p of crfPatients) {
      if (getSubmissionStatus(p) === "approved") approved += 1;
      else pending += 1;
    }
    return { pendingCount: pending, approvedCount: approved };
  }, [crfPatients]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 py-6 focus:outline-none"
    >
      <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
        {/* Minimal Dashboard Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            {isVi ? "Tổng quan Bác sĩ" : "Doctor Dashboard"}
          </h1>
          <button
            type="button"
            id="dashboard-btn-new-crf"
            onClick={() => createNewCrfPatient("", "")}
            className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 cursor-pointer"
          >
            {isVi ? "+ Tạo hồ sơ CRF" : "+ New CRF"}
          </button>
        </div>

        {/* 3 Basic KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">
              {isVi ? "Tổng số hồ sơ" : "Total Dossiers"}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {crfPatients.length}
            </p>
          </div>

          <button
            type="button"
            id="dashboard-card-pending"
            onClick={() => setDoctorActiveTab("pending")}
            className="rounded-xl border border-amber-200 bg-white p-5 text-left shadow-2xs transition hover:border-amber-400 cursor-pointer"
          >
            <p className="text-xs font-semibold text-amber-800">
              {isVi ? "Hồ sơ chưa duyệt" : "Pending Review"}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-950">
              {pendingCount}
            </p>
          </button>

          <button
            type="button"
            id="dashboard-card-approved"
            onClick={() => setDoctorActiveTab("approved")}
            className="rounded-xl border border-teal-200 bg-white p-5 text-left shadow-2xs transition hover:border-teal-400 cursor-pointer"
          >
            <p className="text-xs font-semibold text-teal-800">
              {isVi ? "Hồ sơ đã phê duyệt" : "Approved"}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-teal-950">
              {approvedCount}
            </p>
          </button>
        </div>

        {/* Simple Recent Dossiers Table */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              {isVi ? "Danh sách hồ sơ gần đây" : "Recent Dossiers"}
            </h2>
          </div>

          {crfPatients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {isVi
                ? "Chưa có hồ sơ bệnh nhân nào trong hệ thống."
                : "No patient dossiers in the registry yet."}
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
                      {isVi ? "Ngày tải lên" : "Uploaded"}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {isVi ? "Tệp đính kèm" : "Files"}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      {isVi ? "Trạng thái" : "Status"}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {isVi ? "Thao tác" : "Action"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {crfPatients.slice(0, 10).map((p) => {
                    const approved = getSubmissionStatus(p) === "approved";
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                          {p.studyId}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {p.patientName}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">
                          {p.submittedAt || "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">
                          {p.uploadedFiles?.length ?? 0}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              approved
                                ? "bg-teal-100 text-teal-900"
                                : "bg-amber-100 text-amber-950"
                            }`}
                          >
                            {approved
                              ? isVi
                                ? "Đã phê duyệt"
                                : "Approved"
                              : isVi
                              ? "Chờ duyệt"
                              : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openDoctorPatientCrf(p.id)}
                            className="rounded-md bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
                          >
                            {isVi ? "Mở CRF" : "Open CRF"}
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
