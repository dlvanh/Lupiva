"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import {
  SleCrfPatientRecord,
  UploadedDocFile,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getSubmissionStatus,
} from "@/data/crfData";

type DoctorSubmissionFilter = "all" | "pending" | "approved";

export default function PatientUploadPage() {
  const router = useRouter();
  const {
    language,
    currentUser,
    crfPatients,
    submitPatientUpload,
    setActiveCrfPatientId,
  } = useLupiva();
  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<UploadedDocFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [docFilter, setDocFilter] = useState<DoctorSubmissionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const patientName =
    currentUser?.role === "patient" ? currentUser.name : "Tran Thi Mai";

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added: UploadedDocFile[] = Array.from(list).map((f, i) => {
      const isImage = f.type.startsWith("image/");
      return {
        id: `up-${Date.now()}-${i}`,
        name: f.name,
        url: isImage ? URL.createObjectURL(f) : null,
        isImage,
      };
    });
    setFiles((prev) => [...prev, ...added]);
  };

  const loadSample = () => {
    setFiles([
      {
        id: `sample-${Date.now()}`,
        name: "Sample_Hospital_Lab_Dossier.pdf",
        url: null,
        isImage: false,
      },
    ]);
  };

  const handleSubmit = () => {
    if (files.length === 0) return;
    submitPatientUpload(patientName, files);
    setFiles([]);
  };

  const submissions = useMemo(
    () =>
      crfPatients.filter((p) => p.uploadedFiles && p.uploadedFiles.length > 0),
    [crfPatients]
  );

  const patientSubmissions = useMemo(() => {
    if (currentUser?.role !== "patient") return [];
    const targetName = currentUser.name.trim().toLowerCase();
    return submissions.filter(
      (p) => p.patientName.trim().toLowerCase() === targetName
    );
  }, [currentUser, submissions]);

  const doctorQueueStats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    for (const p of submissions) {
      if (getSubmissionStatus(p) === "approved") approved++;
      else pending++;
    }
    return { total: submissions.length, pending, approved };
  }, [submissions]);

  const filteredDoctorSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return submissions.filter((p) => {
      const status = getSubmissionStatus(p);
      if (docFilter === "pending" && status !== "pending_doctor_review") {
        return false;
      }
      if (docFilter === "approved" && status !== "approved") {
        return false;
      }
      if (!q) return true;
      return (
        p.patientName.toLowerCase().includes(q) ||
        p.studyId.toLowerCase().includes(q)
      );
    });
  }, [submissions, docFilter, searchQuery]);

  const openDoctorRoute = (patientId: string, route: "/ocr" | "/scores") => {
    setActiveCrfPatientId(patientId);
    router.push(route);
  };

  const getPatientClinicalOverview = (p: SleCrfPatientRecord) => {
    const h = parseFloat(p.heightCm);
    const w = parseFloat(p.weightKg);
    const bmi =
      h > 0 && w > 0 ? (w / Math.pow(h / 100, 2)).toFixed(1) : "—";

    let manualCount = 0;
    let verifyCount = 0;
    let approvedCount = 0;
    for (const f of p.ocrFields) {
      if (f.status === "manual_required" || !f.value.trim()) manualCount++;
      else if (f.status === "needs_verify") verifyCount++;
      else approvedCount++;
    }
    for (const b of p.antibodyBlots) {
      if (b.status === "manual_required" || !b.result) manualCount++;
      else if (b.status === "needs_verify") verifyCount++;
      else approvedCount++;
    }

    const organs: string[] = [];
    if (p.fever === "YES") {
      organs.push(
        isVi
          ? `Sốt (${p.feverTempC || ">38"}°C)`
          : `Fever (${p.feverTempC || ">38"}°C)`
      );
    }
    if (p.skinMucosaAbnormality === "YES") {
      const count = p.skinMucosaItems.filter((i) => i.checked).length;
      organs.push(
        isVi ? `Da/Niêm mạc (${count})` : `Skin/Mucosa (${count})`
      );
    }
    if (p.jointsDamage === "YES") {
      organs.push(
        isVi
          ? `Khớp (Sưng ${p.swollenJointsCount}, Đau ${p.tenderJointsCount}, VAS ${p.vasScore})`
          : `Joints (${p.swollenJointsCount}S / ${p.tenderJointsCount}T, VAS ${p.vasScore})`
      );
    }
    if (p.kidneysDamage === "YES") {
      const cls =
        p.renalBiopsyClasses.length > 0
          ? p.renalBiopsyClasses.join(", ")
          : isVi
          ? "Có tổn thương"
          : "Active";
      organs.push(isVi ? `Thận (${cls})` : `Renal (${cls})`);
    }
    if (p.haematologicalDisorders === "YES") {
      organs.push(isVi ? "Huyết học" : "Hematologic");
    }
    if (p.cardiovascularAbnormality === "YES") {
      organs.push(isVi ? "Tim mạch" : "Cardiovascular");
    }
    if (p.lungDamage === "YES") {
      organs.push(
        p.lungIldPatterns.length > 0
          ? `${isVi ? "Phổi" : "Lung"} (${p.lungIldPatterns.join(", ")})`
          : isVi
          ? "Phổi"
          : "Lung"
      );
    }
    if (p.neuropsychiatricDisorders === "YES") {
      organs.push(isVi ? "Tâm thần kinh" : "Neuropsychiatric");
    }

    const highlightCodes = [
      "ANA-HEP2",
      "ANTI-DSDNA",
      "COMP-C3",
      "COMP-C4",
      "UPROT-24H",
      "WBC-TOTAL",
      "PLT-COUNT",
    ];
    const keyLabs = highlightCodes
      .map((code) => p.ocrFields.find((f) => f.code === code))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));

    const eular = calculateEularAcrSummary(
      p.eularAcrCriteria,
      p.anaEntryCriterionMet
    );
    const sledai = calculateSledai2kSummary(p.sledai2kCriteria);

    return {
      bmi,
      manualCount,
      verifyCount,
      approvedCount,
      organs,
      keyLabs,
      eular,
      sledai,
    };
  };

  /* --------------------------------------------------------------------------
   * DOCTOR VIEW: Patient Submissions & Clinical Information Dashboard
   * -------------------------------------------------------------------------- */
  if (isSpecialist) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 bg-slate-100/80 py-8 focus:outline-none"
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
          {/* Header & Queue KPIs */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
                  {isVi
                    ? "Cổng Bác sĩ • Tiếp nhận Hồ sơ Bệnh nhân"
                    : "Doctor Workspace • Patient Submissions"}
                </span>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                  {isVi
                    ? "Hồ sơ Xét nghiệm Bệnh nhân Đã gửi"
                    : "Submitted Patient Dossiers & Clinical Summary"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {isVi
                    ? "Xem trước thông tin hành chính, tiền sử tổn thương cơ quan, thuốc đang dùng và kết quả phân tầng OCR trước khi duyệt bệnh án."
                    : "Review patient demographics, organ involvement, current therapies, and AI OCR triage flags before opening OCR & e-CRF review."}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <dt className="text-[11px] font-medium text-slate-500">
                    {isVi ? "Tổng hồ sơ" : "Total"}
                  </dt>
                  <dd className="mt-0.5 font-mono text-xl font-bold text-slate-900">
                    {doctorQueueStats.total}
                  </dd>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5">
                  <dt className="text-[11px] font-medium text-amber-800">
                    {isVi ? "Chờ duyệt OCR" : "Pending OCR"}
                  </dt>
                  <dd className="mt-0.5 font-mono text-xl font-bold text-amber-900">
                    {doctorQueueStats.pending}
                  </dd>
                </div>
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5">
                  <dt className="text-[11px] font-medium text-teal-800">
                    {isVi ? "Đã phê duyệt" : "Approved"}
                  </dt>
                  <dd className="mt-0.5 font-mono text-xl font-bold text-teal-900">
                    {doctorQueueStats.approved}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Filter & Search Bar */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div
                role="group"
                aria-label={isVi ? "Lọc trạng thái hồ sơ" : "Filter submissions"}
                className="flex flex-wrap items-center gap-1.5"
              >
                {(
                  [
                    ["all", isVi ? "Tất cả" : "All", doctorQueueStats.total],
                    [
                      "pending",
                      isVi ? "Chờ bác sĩ duyệt" : "Pending Review",
                      doctorQueueStats.pending,
                    ],
                    [
                      "approved",
                      isVi ? "Đã duyệt & ký" : "Approved",
                      doctorQueueStats.approved,
                    ],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDocFilter(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      docFilter === key
                        ? "bg-teal-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-72">
                <label htmlFor="doctor-submissions-search" className="sr-only">
                  {isVi
                    ? "Tìm theo tên bệnh nhân hoặc Study ID"
                    : "Search by patient name or Study ID"}
                </label>
                <input
                  id="doctor-submissions-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isVi
                      ? "Tìm tên bệnh nhân hoặc Study ID..."
                      : "Search patient name or Study ID..."
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700"
                />
              </div>
            </div>
          </section>

          {/* Patient Submission Cards */}
          <div className="space-y-4">
            {filteredDoctorSubmissions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                {isVi
                  ? "Không tìm thấy hồ sơ bệnh nhân phù hợp."
                  : "No matching patient submissions found."}
              </div>
            ) : (
              filteredDoctorSubmissions.map((p) => {
                const approved = getSubmissionStatus(p) === "approved";
                const info = getPatientClinicalOverview(p);

                return (
                  <article
                    key={p.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                  >
                    {/* Card Top Header: Identity, Demographics & Primary Actions */}
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/70 px-6 py-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                            {p.studyId}
                          </span>
                          <h2 className="text-lg font-bold text-slate-900">
                            {p.patientName}
                          </h2>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                              approved
                                ? "bg-teal-100 text-teal-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {approved
                              ? isVi
                                ? "Đã duyệt & Ký CRF"
                                : "Approved & Signed Off"
                              : isVi
                              ? "Chờ bác sĩ duyệt OCR"
                              : "Pending OCR Review"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600">
                          {p.age} {isVi ? "tuổi" : "yrs"} •{" "}
                          {isVi
                            ? p.gender === "Female"
                              ? "Nữ"
                              : "Nam"
                            : p.gender}{" "}
                          • {p.heightCm} cm / {p.weightKg} kg (BMI{" "}
                          <span className="font-mono font-semibold text-slate-800">
                            {info.bmi}
                          </span>
                          ) • ICF:{" "}
                          <span className="font-mono">{p.icfSignedDate}</span>
                          {p.submittedAt ? (
                            <>
                              {" "}
                              • {isVi ? "Gửi lúc:" : "Submitted:"}{" "}
                              <span className="font-mono">{p.submittedAt}</span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDoctorRoute(p.id, "/scores")}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
                        >
                          {isVi ? "Xem Bảng điểm SLE" : "View SLE Scores"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDoctorRoute(p.id, "/ocr")}
                          className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800 cursor-pointer"
                        >
                          {approved
                            ? isVi
                              ? "Mở lại OCR & e-CRF →"
                              : "Open OCR & e-CRF →"
                            : isVi
                            ? "Duyệt OCR & e-CRF →"
                            : "Review OCR & e-CRF →"}
                        </button>
                      </div>
                    </div>

                    {/* Card Body: 3-Column Clinical Breakdown */}
                    <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-12">
                      {/* Column 1: Documents, Care Team & Clinical Presentation */}
                      <div className="space-y-4 lg:col-span-5">
                        <div>
                          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            {isVi
                              ? "Tài liệu đính kèm & Đội ngũ phụ trách"
                              : "Attached Documents & Care Team"}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.uploadedFiles?.map((f) => (
                              <span
                                key={f.id}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-800"
                              >
                                {f.isImage ? "IMG" : "PDF"}: {f.name}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600">
                            {isVi ? "Bác sĩ:" : "Physician:"}{" "}
                            <strong className="text-slate-800">
                              {p.physician}
                            </strong>{" "}
                            • {isVi ? "Điều dưỡng:" : "Nurse:"}{" "}
                            <span className="text-slate-700">{p.nurse}</span>
                          </p>
                        </div>

                        <div>
                          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            {isVi
                              ? "Biểu hiện Lâm sàng & Cơ quan Tổn thương"
                              : "Clinical Presentation & Organ Involvement"}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {info.organs.length > 0 ? (
                              info.organs.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800"
                                >
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">
                                {isVi
                                  ? "Chưa ghi nhận tổn thương cơ quan"
                                  : "No active organ damage recorded"}
                              </span>
                            )}
                          </div>
                          {p.otherComorbidities === "YES" &&
                            p.otherComorbiditiesSpecify && (
                              <p className="mt-1.5 text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">
                                  {isVi ? "Bệnh đồng mắc:" : "Comorbidities:"}
                                </span>{" "}
                                {p.otherComorbiditiesSpecify}
                              </p>
                            )}
                        </div>

                        <div>
                          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            {isVi
                              ? "Thuốc điều trị hiện tại"
                              : "Current Treatments"}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.treatments.length > 0 ? (
                              p.treatments.map((trt) => (
                                <span
                                  key={trt.id}
                                  className="rounded-md border border-teal-200 bg-teal-50/70 px-2 py-0.5 text-[11px] font-medium text-teal-950"
                                >
                                  {trt.name} ({trt.dose})
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">
                                {isVi ? "Không có" : "None listed"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Column 2: AI OCR 3-Tier Triage & Key Biomarker Flags */}
                      <div className="space-y-3 border-t border-slate-200 pt-4 lg:col-span-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {isVi
                            ? "Phân tầng AI OCR (3 Mức) & Xét nghiệm Nổi bật"
                            : "AI OCR 3-Tier Triage & Key Biomarkers"}
                        </h3>

                        <div className="grid grid-cols-3 gap-2 font-mono text-center text-[11px]">
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-900">
                            <p className="text-sm font-bold">
                              {info.manualCount}
                            </p>
                            <p className="text-[10px]">
                              &lt;80% {isVi ? "Nhập tay" : "Manual"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                            <p className="text-sm font-bold">
                              {info.verifyCount}
                            </p>
                            <p className="text-[10px]">
                              80–90% {isVi ? "Xác nhận" : "Verify"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-teal-900">
                            <p className="text-sm font-bold">
                              {info.approvedCount}
                            </p>
                            <p className="text-[10px]">
                              &gt;90% {isVi ? "Đã duyệt" : "Auto/OK"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                          {info.keyLabs.map((f) => {
                            const isBlank = !f.value.trim();
                            return (
                              <span
                                key={f.id}
                                className={`rounded border px-2 py-0.5 ${
                                  isBlank
                                    ? "border-rose-300 bg-rose-50 text-rose-900"
                                    : f.flag === "Normal"
                                    ? "border-slate-200 bg-slate-50 text-slate-700"
                                    : "border-rose-200 bg-rose-50/70 font-semibold text-rose-900"
                                }`}
                              >
                                {f.code
                                  .replace("-TOTAL", "")
                                  .replace("-COUNT", "")
                                  .replace("COMP-", "")}
                                :{" "}
                                {isBlank
                                  ? isVi
                                    ? "[Trống <80%]"
                                    : "[Blank <80%]"
                                  : `${f.value}${
                                      f.unit && f.unit !== "Titer"
                                        ? ` ${f.unit}`
                                        : ""
                                    }`}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Column 3: EULAR/ACR 2019 & SLEDAI-2K Score Preview */}
                      <div className="space-y-3 border-t border-slate-200 pt-4 lg:col-span-3 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {isVi
                            ? "Điểm Phân loại & Hoạt tính"
                            : "SLE Score Preview"}
                        </h3>

                        <div
                          className={`rounded-xl border p-3 ${
                            info.eular.isClassifiedSle
                              ? "border-teal-200 bg-teal-50/60"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">
                              EULAR/ACR 2019
                            </span>
                            <span className="font-mono text-base font-bold text-slate-900">
                              {info.eular.totalScore} pts
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] font-semibold text-teal-900">
                            {info.eular.isClassifiedSle
                              ? isVi
                                ? "Đạt tiêu chuẩn SLE (≥10)"
                                : "Classified SLE (≥10)"
                              : isVi
                              ? "Chưa đạt ngưỡng (<10)"
                              : "Below threshold (<10)"}
                          </p>
                        </div>

                        <div
                          className={`rounded-xl border p-3 ${
                            info.sledai.badgeTone === "rose"
                              ? "border-rose-200 bg-rose-50/60"
                              : info.sledai.badgeTone === "amber"
                              ? "border-amber-200 bg-amber-50/60"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">
                              SLEDAI-2K
                            </span>
                            <span className="font-mono text-base font-bold text-slate-900">
                              {info.sledai.totalScore} pts
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] font-semibold text-rose-900">
                            {isVi
                              ? info.sledai.activityTierVi
                              : info.sledai.activityTierEn}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </main>
    );
  }

  /* --------------------------------------------------------------------------
   * PATIENT / GUEST VIEW: Upload Your Document + Submission Tracker
   * -------------------------------------------------------------------------- */
  return (
    <main id="main-content" tabIndex={-1} className="flex-1 py-10 focus:outline-none">
      <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
            {isVi ? "Cổng Bệnh nhân" : "Patient Portal"}
          </span>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {isVi ? "Tải lên tài liệu của bạn" : "Upload your document"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isVi
              ? "Bạn chỉ cần tải lên phiếu xét nghiệm hoặc hồ sơ y tế. AI sẽ đọc tài liệu và bác sĩ Vinmec sẽ xác minh kết quả."
              : "All you need to do is upload your lab report or medical record. Our AI reads it and a Vinmec doctor verifies the result."}
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
              isDragging
                ? "border-teal-600 bg-teal-50"
                : "border-slate-300 bg-slate-50"
            }`}
          >
            <div
              aria-hidden="true"
              className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-teal-700 shadow-2xs"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {isVi
                ? "Kéo thả ảnh / PDF vào đây"
                : "Drag & drop images / PDFs here"}
            </p>
            <input
              ref={inputRef}
              id="upload-file-input"
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                id="upload-btn-browse"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                {isVi ? "Chọn tệp" : "Browse files"}
              </button>
              <button
                type="button"
                id="upload-btn-sample"
                onClick={loadSample}
                className="rounded-lg border border-teal-700/30 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
              >
                {isVi ? "Dùng hồ sơ mẫu" : "Use sample hospital dossier"}
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {f.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.url}
                        alt={f.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
                        PDF
                      </span>
                    )}
                    <span className="font-medium text-slate-800">{f.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((x) => x.id !== f.id))
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                    aria-label={`Remove ${f.name}`}
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            id="upload-btn-submit"
            disabled={files.length === 0}
            onClick={handleSubmit}
            className="mt-5 w-full rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-2xs hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {isVi ? "Tải lên & Gửi cho Bác sĩ" : "Upload & send to doctor"}
          </button>
        </section>

        {currentUser?.role === "patient" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900">
              {isVi ? "Trạng thái tài liệu đã gửi" : "Your submissions"}
            </h2>
            <div className="mt-4 space-y-3">
              {patientSubmissions.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {isVi
                    ? "Bạn chưa có tài liệu nào được gửi."
                    : "You have no submitted documents yet."}
                </p>
              ) : (
                patientSubmissions.map((p) => {
                  const approved = getSubmissionStatus(p) === "approved";
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-slate-200 p-4 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {p.patientName} • {p.studyId}
                        </p>
                        <p className="text-slate-500">
                          {p.uploadedFiles?.map((f) => f.name).join(", ")}
                          {p.submittedAt ? ` • ${p.submittedAt}` : ""}
                        </p>
                      </div>
                      <ol className="mt-3 grid grid-cols-3 gap-2 font-semibold">
                        <li className="flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-teal-900">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
                          />
                          <span>{isVi ? "1. Đã tải lên" : "1. Uploaded"}</span>
                        </li>
                        <li className="flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-teal-900">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
                          />
                          <span>
                            {isVi ? "2. AI đã trích xuất" : "2. AI OCR extracted"}
                          </span>
                        </li>
                        <li
                          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 ${
                            approved
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              approved ? "bg-white" : "bg-amber-500"
                            }`}
                          />
                          <span>
                            {approved
                              ? isVi
                                ? "3. Bác sĩ đã duyệt"
                                : "3. Approved by doctor"
                              : isVi
                              ? "3. Chờ bác sĩ xác minh"
                              : "3. Pending doctor review"}
                          </span>
                        </li>
                      </ol>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
