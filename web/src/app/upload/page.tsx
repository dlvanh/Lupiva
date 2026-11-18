"use client";

import React, { useState } from "react";
import { useLupiva } from "@/context/LupivaContext";
import { TRANSLATIONS } from "@/data/translations";
import { DoctorSubmissionsView } from "@/components/upload/DoctorSubmissionsView";
import { PatientUploadView } from "@/components/upload/PatientUploadView";

export default function PatientUploadPage() {
  const { currentUser, authLoading, language } = useLupiva();
  const [listKey, setListKey] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (authLoading) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy="true"
        className="flex-1 bg-slate-100/80 py-10 focus:outline-none"
      >
        <div className="mx-auto max-w-4xl space-y-4 px-4 sm:px-6">
          <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
          <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
        </div>
      </main>
    );
  }

  if (currentUser?.role === "specialist") {
    const dc = TRANSLATIONS[language].doctor;
    return (
      <DoctorSubmissionsView
        key={listKey}
        headerAction={
          <button
            type="button"
            id="doctor-upload-for-patient"
            aria-expanded={uploadOpen}
            aria-controls="doctor-upload-for-patient-panel"
            onClick={() => setUploadOpen((open) => !open)}
            className={`min-h-9 cursor-pointer rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition ${
              uploadOpen
                ? "border-teal-700 bg-teal-50 text-teal-900"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
          >
            {uploadOpen ? dc.closeUpload : dc.uploadForPatient}
          </button>
        }
        uploadPanel={
          uploadOpen ? (
            <section
              id="doctor-upload-for-patient-panel"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-6"
            >
              <PatientUploadView embedded onSubmitted={() => setListKey((k) => k + 1)} />
            </section>
          ) : null
        }
      />
    );
  }

  return <PatientUploadView />;
}
