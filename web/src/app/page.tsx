"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RegistryOverview } from "@/components/landing/RegistryOverview";
import { HomeSections } from "@/components/landing/SitePages";
import { useLupiva } from "@/context/LupivaContext";

export default function LandingPage() {
  const { currentUser } = useLupiva();
  const isSpecialist = currentUser?.role === "specialist";
  const router = useRouter();

  // Doctors have no home page: their home is the dashboard.
  useEffect(() => {
    if (isSpecialist) router.replace("/upload");
  }, [isSpecialist, router]);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      <RegistryOverview />
      <HomeSections />
    </main>
  );
}
