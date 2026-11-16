"use client";

import React from "react";
import { useLupiva } from "@/context/LupivaContext";
import { DoctorSubmissionsView } from "@/components/upload/DoctorSubmissionsView";
import { PatientUploadView } from "@/components/upload/PatientUploadView";

export default function PatientUploadPage() {
  const { currentUser, authLoading } = useLupiva();

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
    return <DoctorSubmissionsView />;
  }

  return <PatientUploadView />;
}
