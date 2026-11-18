"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";

// Draft wording, pending review by the research team.
const COPY = {
  vi: {
    title: "Đăng ký bệnh nhân Lupus",
    subtitle: "Lupus Registry",
    intro:
      "Đăng ký bệnh nhân Lupus là registry tiến cứu, quan sát (không can thiệp) dành cho người bệnh lupus ban đỏ hệ thống (SLE). Hồ sơ khám và xét nghiệm trong quá trình điều trị thường quy được thu thập, chuẩn hóa theo phiếu CRF và được bác sĩ chuyên khoa duyệt, nhằm hiểu rõ hơn về bệnh lupus ở người Việt Nam.",
    forPatients: "Dành cho bệnh nhân",
    forDoctors: "Dành cho bác sĩ",
    aimTitle: "Mục tiêu và hướng nghiên cứu",
    aimBody:
      "Registry thu thập dữ liệu thực tế theo thời gian để cải thiện hiểu biết về bệnh lupus và hỗ trợ chăm sóc người bệnh, tập trung vào các hướng:",
    aims: [
      "Đặc điểm lâm sàng và cận lâm sàng của bệnh nhân SLE, phân loại theo tiêu chuẩn EULAR/ACR 2019.",
      "Mức độ hoạt động bệnh và diễn tiến theo thời gian, đánh giá bằng thang SLEDAI-2K.",
      "Tổn thương cơ quan (thận, máu, da, khớp, thần kinh…) và các yếu tố liên quan.",
      "Hồ sơ kháng thể (ANA, anti-dsDNA…) và bổ thể C3/C4, mối liên hệ với biểu hiện bệnh.",
      "Điều trị, đáp ứng điều trị dài hạn và ảnh hưởng của bệnh trong thực hành thực tế.",
    ],
    backgroundTitle: "Bối cảnh",
    backgroundBody:
      "Lupus ban đỏ hệ thống là bệnh tự miễn mạn tính, có thể ảnh hưởng nhiều cơ quan, diễn tiến từng đợt và khác nhau giữa từng người bệnh. Dữ liệu về dịch tễ, diễn tiến và đáp ứng điều trị của bệnh nhân lupus tại Việt Nam còn phân tán trên nhiều hồ sơ giấy và phiếu xét nghiệm khác nhau. Một registry chuẩn hóa, theo dõi dài hạn và truy ngược được về hồ sơ gốc là công cụ phù hợp để trả lời những câu hỏi này.",
    howTitle: "Registry hoạt động như thế nào",
    how: [
      ["Đồng ý tham gia", "Người bệnh hoàn thiện E-consent và tải hồ sơ khám, xét nghiệm lên hệ thống."],
      ["Trích xuất và bảo vệ", "Hệ thống đọc tài liệu, che thông tin định danh và đề xuất giá trị cho phiếu CRF."],
      ["Bác sĩ duyệt", "Bác sĩ chuyên khoa đối chiếu với tài liệu gốc và phê duyệt từng giá trị."],
      ["Dữ liệu chuẩn hóa", "Dữ liệu đã duyệt được giả danh hóa, lưu theo phiếu CRF và xuất sang REDCap cho nghiên cứu."],
    ],
  },
  en: {
    title: "Lupus Patient Registry",
    subtitle: "Đăng ký bệnh nhân Lupus",
    intro:
      "The Lupus Patient Registry is a prospective, observational (non-interventional) registry for people with systemic lupus erythematosus (SLE). Visit and laboratory records from routine care are collected, standardized on the CRF and reviewed by specialists, to better understand lupus in Vietnamese patients.",
    forPatients: "For patients",
    forDoctors: "For physicians",
    aimTitle: "Aim and research directions",
    aimBody: "The registry collects real-world data over time to improve knowledge of lupus and support patient care, focusing on:",
    aims: [
      "Clinical and laboratory features of SLE patients, classified by the 2019 EULAR/ACR criteria.",
      "Disease activity and its course over time, measured with SLEDAI-2K.",
      "Organ involvement (kidney, blood, skin, joints, nervous system…) and related factors.",
      "Antibody profiles (ANA, anti-dsDNA…) and complement C3/C4, and their link to disease manifestations.",
      "Treatment, long-term treatment response and the impact of the disease in everyday practice.",
    ],
    backgroundTitle: "Background",
    backgroundBody:
      "Systemic lupus erythematosus is a chronic autoimmune disease that can affect many organs, flares over time and differs from one patient to another. Data on the epidemiology, course and treatment response of lupus patients in Vietnam are scattered across paper records and lab reports. A standardized, long-term registry that traces every value back to its source document is the right tool to answer these questions.",
    howTitle: "How the registry works",
    how: [
      ["Consent", "Patients complete the e-consent and upload their visit and lab records."],
      ["Extraction and protection", "The system reads the documents, masks identifying details and proposes CRF values."],
      ["Specialist review", "A specialist checks each value against the source document and approves it."],
      ["Standardized data", "Approved data is pseudonymized, stored on the CRF and exported to REDCap for research."],
    ],
  },
} as const;

/** Overview of the lupus registry, modelled on the CURE registry home page. */
export function RegistryOverview() {
  const { language } = useLupiva();
  const c = COPY[language];

  return (
    <>
      <section className="bg-teal-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-200">{c.subtitle}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{c.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-teal-50">{c.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#patient-join-heading" className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">
              {c.forPatients}
            </a>
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-teal-200/60 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
              {c.forDoctors}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <section aria-labelledby="registry-aim-heading">
          <h2 id="registry-aim-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">{c.aimTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{c.aimBody}</p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {c.aims.map((aim) => (
              <li key={aim} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-2xs">
                <span aria-hidden="true" className="mt-0.5 font-bold text-teal-700">✓</span>
                <span>{aim}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="registry-background-heading">
          <h2 id="registry-background-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">{c.backgroundTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{c.backgroundBody}</p>
        </section>

        <section aria-labelledby="registry-how-heading">
          <h2 id="registry-how-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">{c.howTitle}</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.how.map(([title, body], index) => (
              <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="font-mono text-xs font-bold text-teal-800">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
