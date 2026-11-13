"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import {
  UploadedDocFile,
  getSubmissionStatus,
} from "@/data/crfData";

export default function PatientUploadPage() {
  const router = useRouter();
  const {
    language,
    currentUser,
    crfPatients,
    submitPatientUpload,
    setActiveCrfPatientId,
    loginAsRole,
  } = useLupiva();
  const isVi = language === "vi";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<UploadedDocFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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

  const submissions = crfPatients.filter(
    (p) => p.uploadedFiles && p.uploadedFiles.length > 0
  );

  const openAsDoctor = (patientId: string) => {
    loginAsRole("specialist");
    setActiveCrfPatientId(patientId);
    router.push("/ocr");
  };

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

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h2 className="text-base font-bold text-slate-900">
            {isVi ? "Trạng thái tài liệu đã gửi" : "Your submissions"}
          </h2>
          <div className="mt-4 space-y-3">
            {submissions.map((p) => {
              const approved = getSubmissionStatus(p) === "approved";
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-200 p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {p.patientName} • {p.studyId}
                      </p>
                      <p className="text-slate-500">
                        {p.uploadedFiles?.map((f) => f.name).join(", ")}
                        {p.submittedAt ? ` • ${p.submittedAt}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAsDoctor(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <span>
                        {isVi
                          ? "Chuyển sang góc nhìn Bác sĩ"
                          : "Switch to Doctor view"}
                      </span>
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
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
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
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
