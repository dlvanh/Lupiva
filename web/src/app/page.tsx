"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PatientContactSection, PatientInfoSections } from "@/components/landing/PatientInfoSections";
import { RegistryOverview, RegistryResearchDetails } from "@/components/landing/RegistryOverview";
import { useLupiva } from "@/context/LupivaContext";

export default function LandingPage() {
  const { currentUser } = useLupiva();
  const isSpecialist = currentUser?.role === "specialist";
  const router = useRouter();

  // Doctors have no overview page: their home is the dashboard.
  useEffect(() => {
    if (isSpecialist) router.replace("/upload");
  }, [isSpecialist, router]);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      <RegistryOverview />
      <div className="mx-auto max-w-5xl space-y-9 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <PatientInfoSections />
        <RegistryResearchDetails />
        <PatientContactSection />
      </div>
    </main>
  );
}
