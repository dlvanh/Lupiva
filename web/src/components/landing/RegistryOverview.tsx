"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";

// Draft wording, pending review by the research team.
const COPY = {
  vi: {
    aimTitle: "Mục tiêu và hướng nghiên cứu",
    more: "Xem thêm",
    aimBody:
      "Đây là registry tiến cứu, quan sát dành cho người bệnh lupus ban đỏ hệ thống. Dự án thu thập dữ liệu khám và xét nghiệm theo thời gian, tập trung vào các hướng:",
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
      ["Đồng ý tham gia", "Người bệnh ký điện tử và gửi hồ sơ khám, xét nghiệm."],
      ["Trích xuất và bảo vệ", "Hệ thống đọc tài liệu, che thông tin định danh và đề xuất giá trị cho phiếu CRF."],
      ["Bác sĩ duyệt", "Bác sĩ chuyên khoa đối chiếu với tài liệu gốc và phê duyệt từng giá trị."],
      ["Dữ liệu chuẩn hóa", "Dữ liệu đã duyệt được giả danh hóa, lưu theo phiếu CRF và xuất sang REDCap cho nghiên cứu."],
    ],
  },
  en: {
    aimTitle: "Aim and research directions",
    more: "Read more",
    aimBody: "This prospective, observational registry collects visit and test data over time for people with systemic lupus erythematosus, focusing on:",
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
      ["Consent", "Patients sign electronically and submit their visit and lab records."],
      ["Extraction and protection", "The system reads the documents, masks identifying details and proposes CRF values."],
      ["Specialist review", "A specialist checks each value against the source document and approves it."],
      ["Standardized data", "Approved data is pseudonymized, stored on the CRF and exported to REDCap for research."],
    ],
  },
} as const;

export function RegistryOverview() {
  const { currentUser, t } = useLupiva();
  const copy = t.patientPortal;
  const action = currentUser?.role === "patient"
    ? currentUser.consentSigned
      ? { href: "/upload", label: copy.submitMenuLabel }
      : { href: "/login?consent=1", label: copy.step1Btn }
    : { href: "/login?mode=register", label: copy.startBtn };

  return (
    <section className="bg-teal-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">{copy.overviewTitle}</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-teal-50">{copy.overviewIntro}</p>
        <Link href={action.href} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-400 px-5 py-3 text-base font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          {action.label}
        </Link>
      </div>
    </section>
  );
}

export function RegistryResearchDetails() {
  const { language } = useLupiva();
  const c = COPY[language];

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl p-4 text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
        <span className="text-xl font-bold">{c.aimTitle}</span>
        <span className="inline-flex items-center gap-2 font-semibold text-teal-800">
          {c.more}
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
      </summary>
      <div className="space-y-6 px-4 pb-5 text-base leading-relaxed text-slate-800">
        <div>
          <p>{c.aimBody}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {c.aims.map((aim) => <li key={aim}>{aim}</li>)}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">{c.backgroundTitle}</h2>
          <p className="mt-2">{c.backgroundBody}</p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">{c.howTitle}</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {c.how.map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}
