"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import { DoctorWorkspace } from "@/components/DoctorWorkspace";

export default function RedcapPage() {
  const router = useRouter();
  const { currentUser, authLoading, isSigningOut, setDoctorActiveTab } =
    useLupiva();

  const isSpecialist = currentUser?.role === "specialist";

  useEffect(() => {
    if (!authLoading && !isSpecialist && !isSigningOut()) {
      router.replace("/login");
    }
  }, [authLoading, isSpecialist, isSigningOut, router]);

  useEffect(() => {
    if (isSpecialist) {
      setDoctorActiveTab("redcap");
    }
  }, [isSpecialist, setDoctorActiveTab]);

  if (authLoading || !isSpecialist) {
    return null;
  }

  return <DoctorWorkspace />;
}
