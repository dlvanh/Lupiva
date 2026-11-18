"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import { DoctorWorkspace } from "@/components/DoctorWorkspace";

export default function SleScoresPage() {
  const router = useRouter();
  const { language, currentUser, authLoading, isSigningOut } = useLupiva();

  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";

  useEffect(() => {
    if (!authLoading && !isSpecialist && !isSigningOut()) {
      router.replace("/login");
    }
  }, [authLoading, isSpecialist, isSigningOut, router]);

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

  return <DoctorWorkspace />;
}
