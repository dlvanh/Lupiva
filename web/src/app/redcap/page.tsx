"use client";

import Image from "next/image";
import { useLupiva } from "@/context/LupivaContext";

export default function RedcapPage() {
  const { currentUser, language } = useLupiva();
  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";

  if (currentUser && !isSpecialist) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          {isVi ? "Trang Quản lý dữ liệu REDCap chỉ dành cho bác sĩ." : "REDCap Data Management is available to clinical specialists."}
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {isVi ? "Quản lý dữ liệu REDCap" : "REDCap Data Management"}
        </h1>
      </div>

      <section
        aria-label={isVi ? "Giao diện quản lý dữ liệu REDCap" : "REDCap data management view"}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xs sm:p-3"
      >
        <Image
          src="/images/redcap-dashboard.jpg"
          alt={
            isVi
              ? "Bảng điều khiển trạng thái hồ sơ REDCap cho nghiên cứu Lupus ban đỏ hệ thống tại Việt Nam"
              : "REDCap Record Status Dashboard for the Vietnam Systemic Lupus Erythematosus registry"
          }
          width={1813}
          height={1027}
          priority
          unoptimized
          className="h-auto w-full rounded-lg border border-slate-100"
        />
      </section>
    </main>
  );
}
