"use client";

import React, { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import {
  getSubmissionStatus,
  syncCriteriaFromVerifiedCrf,
} from "@/data/crfData";
import { SleScoreTables } from "@/components/SleScoreTables";

export default function SleScoresPage() {
  const router = useRouter();
  const {
    language,
    currentUser,
    authLoading,
    isSigningOut,
    crfPatients,
    activeCrfPatientId,
    setActiveCrfPatientId,
    updateCrfPatient,
    showToast,
  } = useLupiva();

  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";

  useEffect(() => {
    if (!authLoading && !isSpecialist && !isSigningOut()) {
      router.replace("/login");
    }
  }, [authLoading, isSpecialist, isSigningOut, router]);

  const activePatient = useMemo(
    () =>
      crfPatients.find((p) => p.id === activeCrfPatientId) || crfPatients[0],
    [crfPatients, activeCrfPatientId]
  );

  if (authLoading) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center bg-slate-100/80 py-16"
      >
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-xs font-medium text-slate-600 shadow-2xs">
          {isVi ? "Đang xác thực phiên chuyên khoa..." : "Verifying specialist session..."}
        </div>
      </main>
    );
  }

  if (!isSpecialist) {
    return null;
  }

  const isApproved = getSubmissionStatus(activePatient) === "approved";

  const handleSyncFromOcr = () => {
    updateCrfPatient(activePatient.id, syncCriteriaFromVerifiedCrf);
    showToast(
      isVi
        ? "Đã đồng bộ Điểm từ Kết quả OCR"
        : "Synced Scores from Verified OCR Results",
      isVi
        ? `Đã cập nhật bảng điểm EULAR/ACR 2019 & SLEDAI-2K cho hồ sơ ${activePatient.studyId}.`
        : `Updated 2019 EULAR/ACR & SLEDAI-2K score tables for ${activePatient.studyId}.`,
      "teal"
    );
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 bg-slate-100/80 pb-14 focus:outline-none"
    >
      {/* Top Patient & Action Bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                {isVi
                  ? "Phân loại & Đánh giá Hoạt tính Bệnh SLE"
                  : "SLE Classification & Disease Activity Scoring"}
              </span>
              <h1 className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">
                {isVi
                  ? "Bảng điểm EULAR/ACR 2019 & SLEDAI-2K"
                  : "2019 EULAR/ACR & SLEDAI-2K Scores"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="scores-patient-select" className="sr-only">
                {isVi ? "Chọn hồ sơ bệnh nhân" : "Select patient record"}
              </label>
              <select
                id="scores-patient-select"
                value={activePatient.id}
                onChange={(e) => setActiveCrfPatientId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                {crfPatients.map((pat) => (
                  <option key={pat.id} value={pat.id}>
                    {pat.studyId} • {pat.patientName} —{" "}
                    {getSubmissionStatus(pat) === "approved"
                      ? isVi
                        ? "Đã duyệt"
                        : "Approved"
                      : isVi
                      ? "Chờ duyệt"
                      : "Pending"}
                  </option>
                ))}
              </select>

              <button
                type="button"
                id="scores-btn-sync-ocr"
                onClick={handleSyncFromOcr}
                className="rounded-lg border border-teal-700/40 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 cursor-pointer"
              >
                {isVi
                  ? "Đồng bộ từ OCR đã duyệt"
                  : "Sync from Verified OCR"}
              </button>
              <Link
                href="/ocr"
                id="scores-link-ocr"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                {isVi ? "Mở lại Duyệt OCR" : "Open OCR Review"}
              </Link>

              <button
                type="button"
                id="scores-btn-print"
                onClick={() => window.print()}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
              >
                {isVi ? "In Bảng điểm" : "Print Report"}
              </button>
            </div>
          </div>

          {!isApproved && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">
              <span>
                {isVi
                  ? "Lưu ý: Hồ sơ OCR này chưa được bác sĩ ký phê duyệt chính thức. Điểm số hiện tại đang phản ánh dữ liệu tạm thời."
                  : "Note: This OCR dossier has not yet been formally signed off by a physician. Current scores reflect preliminary extraction values."}
              </span>
                <Link
                  href="/ocr"
                  className="font-semibold text-amber-900 underline hover:text-amber-950"
                >
                  {isVi ? "Đi tới Duyệt OCR →" : "Go to OCR Review →"}
                </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <SleScoreTables
          patient={activePatient}
          isVi={isVi}
          onToggleAnaEntry={(checked) =>
            updateCrfPatient(activePatient.id, (prev) => ({
              ...prev,
              anaEntryCriterionMet: checked,
            }))
          }
          onToggleEular={(criterionId, checked) =>
            updateCrfPatient(activePatient.id, (prev) => ({
              ...prev,
              eularAcrCriteria: prev.eularAcrCriteria.map((c) =>
                c.id === criterionId ? { ...c, checked } : c
              ),
            }))
          }
          onToggleSledai={(criterionId, checked) =>
            updateCrfPatient(activePatient.id, (prev) => ({
              ...prev,
              sledai2kCriteria: prev.sledai2kCriteria.map((c) =>
                c.id === criterionId ? { ...c, checked } : c
              ),
            }))
          }
        />
      </div>
    </main>
  );
}
