"use client";

import React from "react";
import { useLupiva } from "@/context/LupivaContext";
import { DoctorDashboardView } from "@/components/DoctorDashboardView";
import { DoctorSubmissionsView } from "@/components/upload/DoctorSubmissionsView";
import SleCrfManagerPage from "@/app/crf/page";
import { DoctorRedcapView } from "@/components/DoctorRedcapView";

export function DoctorWorkspace() {
  const { doctorActiveTab } = useLupiva();

  switch (doctorActiveTab) {
    case "pending":
      return <DoctorSubmissionsView fixedStatus="pending_doctor_review" />;
    case "approved":
      return <DoctorSubmissionsView fixedStatus="approved" />;
    case "crf":
      return <SleCrfManagerPage />;
    case "redcap":
      return <DoctorRedcapView />;
    case "dashboard":
    default:
      return <DoctorDashboardView />;
  }
}
