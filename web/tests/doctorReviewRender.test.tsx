import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CrfField } from "@/lib/crfApproval";
import { buildBlankCrfRecord } from "@/data/crfData";
import { getUploadPageCopy } from "@/data/uploadTranslations";
import { getOcrTierCounts } from "@/lib/submissionFilters";

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({
    language: "vi",
    currentUser: { role: "specialist", name: "BS Test" },
    authLoading: false,
    mergeCrfPatientsFromApi: () => {},
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AdminFactsList, type Fact } from "@/components/upload/CrfAdminFacts";
import { EvidencePanel, FieldRow } from "@/app/registry/page";
import CrfFormPage from "@/app/crf-form/page";
import { CrfFormTitle, DossierApprovalNotice } from "@/components/CrfDossierStatus";
import { DoctorSubmissionsView, SubmissionRow, SubmissionTable } from "@/components/upload/DoctorSubmissionsView";
import PatientUploadPage from "@/app/upload/page";

const field = (over: Partial<CrfField>): CrfField => ({
  slot: "ADM02/result",
  label: "Age",
  section: "Administrative",
  component: "result",
  choices: [],
  options: [],
  ...over,
});

const fact = (id: string, label: string, text: string, kind: "approved" | "source"): Fact => ({
  id,
  label,
  slot: `${id}/result`,
  shown: { value: text, text, kind },
});

const row = (over: Partial<React.ComponentProps<typeof FieldRow>> = {}) =>
  renderToStaticMarkup(
    <FieldRow
      field={field({ options: [{ id: "a", value: "20 years" }] })}
      sources={undefined}
      canApprove
      active={false}
      selected=""
      onActivate={() => {}}
      onSelect={() => {}}
      typed=""
      onType={() => {}}
      {...over}
    />,
  );

describe("AdminFactsList localization", () => {
  const facts = [fact("ADM02", "Tuổi", "20 years", "source"), fact("ADM03", "Giới", "Female", "approved")];

  it("shows Vietnamese age and gender values by default", () => {
    const html = renderToStaticMarkup(<AdminFactsList facts={facts} caseId="case-1" />);
    expect(html).toContain("20 tuổi");
    expect(html).toContain("Nữ");
    expect(html).not.toContain("20 years");
    expect(html).not.toContain("Female");
  });

  it("keeps the backend English values when isVi is false", () => {
    const html = renderToStaticMarkup(<AdminFactsList facts={facts} caseId="case-1" isVi={false} />);
    expect(html).toContain("20 years");
    expect(html).toContain("Female");
  });

  it("links each fact to its cell on the review page", () => {
    const html = renderToStaticMarkup(<AdminFactsList facts={facts} caseId="case-1" />);
    expect(html).toContain("/registry?case=case-1&amp;slot=ADM02%2Fresult");
  });
});

describe("FieldRow Vietnamese labels and origin badges", () => {
  it("adds the short Vietnamese label next to the English CRF label", () => {
    const html = row();
    expect(html).toContain("Age");
    expect(html).toContain("Tuổi");
  });

  it("falls back to the English label when no mapping exists", () => {
    const html = row({ field: field({ slot: "XYZ01/result", label: "Some Unmapped Assay", options: [{ id: "a", value: "1" }] }) });
    expect(html).toContain("Some Unmapped Assay");
  });

  it("marks an unapproved source value as read from the image", () => {
    expect(row()).toMatch(/<svg aria-hidden="true"[^>]*>.*<\/svg>.*đọc từ ảnh/);
    expect(row()).not.toContain("📄");
  });

  it("marks an approved value, a typed value and an LLM proposal distinctly", () => {
    expect(row({ approved: { id: "a", value: "20 years", origin: "source" } })).toContain("đã duyệt");
    expect(row({ typed: "21" })).toContain("sửa tay");
    expect(
      row({ field: field({ slot: "CLI01/result", label: "Arthritis", proposal: { id: "p", value: "no", origin: "llm" } }) }),
    ).toContain("LLM đề xuất");
  });

  it("uses English badges when isVi is false", () => {
    const html = row({ isVi: false });
    expect(html).toContain("read from image");
    expect(html).not.toContain("Tuổi");
  });

  it("shows a proposal beside an empty decision control", () => {
    const html = row({ field: field({
      choices: [{ code: "no", label: "Không" }],
      proposal: { id: "proposal", value: "no", origin: "llm" },
    }) });
    expect(html).toContain("LLM đề xuất");
    expect(html).toContain('<option value="" selected="">');
    expect(html).not.toContain('<option value="proposal" selected="">');
  });

  const ageOptions = field({ options: [{ id: "a", value: "64 years" }, { id: "b", value: "65 years" }] });

  it("displays the specific approved option without a staged choice", () => {
    const html = row({ field: ageOptions, approved: { id: "b", value: "65 years", origin: "source" } });
    expect(html).toContain('<option value="b" selected="">Từ nguồn: 65 tuổi</option>');
    expect(html).not.toContain("years");
  });

  it("displays an approved manual value even when its id is absent from the draft", () => {
    const html = row({ field: ageOptions, approved: { id: "manual", value: "66 years", origin: "manual" } });
    expect(html).toContain('<option value="" selected="">đã duyệt · 66 tuổi</option>');
    expect(html).toContain('<option value="b">Từ nguồn: 65 tuổi</option>');
  });

  it("lets a pending change take precedence over the displayed approval", () => {
    const html = row({ field: ageOptions, selected: "a", approved: { id: "b", value: "65 years", origin: "source" } });
    expect(html).toContain('<option value="a" selected="">Từ nguồn: 64 tuổi</option>');
  });

  it("localizes source, draft and proposal values while leaving choice ids intact", () => {
    const gender = field({
      slot: "ADM03/result#2",
      label: "Gender",
      choices: [{ code: "female", label: "Female" }, { code: "male", label: "Male" }],
      options: [{ id: "source-id", value: "female", sources: ["first"] }],
      proposal: { id: "proposal-id", value: "male", origin: "llm" },
    });
    const sources = { first: { label: "Gender", value: "Female (2026-11-18; report_date)" } };
    const markup = (isVi: boolean) => row({ field: gender, sources, isVi }) +
      renderToStaticMarkup(<EvidencePanel field={gender} sources={sources} isVi={isVi} />);
    expect(markup(true)).toContain('<option value="source-id">Từ nguồn: Nữ · 18/11/2026</option>');
    expect(markup(true)).toContain('<option value="proposal-id">Đề xuất: Nam</option>');
    expect(markup(true)).toContain('<span class="font-mono">Nữ</span>');
    expect(markup(true)).not.toMatch(/Female|Male/);
    expect(markup(false)).toContain('<span class="font-mono">Female</span>');
    expect(markup(false)).toContain('Proposal: Male');
  });
});

describe("FieldRow manual edit box", () => {
  const freeText = field({ slot: "ADM08/result", label: "Physician" });

  it("hides the free-text box until the doctor clicks the edit icon", () => {
    const html = row({ field: freeText });
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*>.*<\/svg>.*Sửa tay/);
    expect(html).not.toContain("Nhập tay Physician");
  });

  it("shows the box once editing is opened", () => {
    const html = row({ field: freeText, editing: true, onEdit: () => {} });
    expect(html).toContain("Nhập tay Physician");
  });

  it("keeps the box visible while a typed value is present", () => {
    const html = row({ field: freeText, typed: "BS Nguyễn" });
    expect(html).toContain("Nhập tay Physician");
    expect(html).toContain("BS Nguyễn");
  });

  it("offers no edit control to non-specialists", () => {
    const html = row({ field: freeText, canApprove: false });
    expect(html).not.toContain("Sửa tay");
    expect(html).not.toContain("Nhập tay Physician");
  });
});

describe("doctor dashboard default layout", () => {
  const html = () => renderToStaticMarkup(<DoctorSubmissionsView />);

  it("shows search plus the three status buttons by default", () => {
    const markup = html();
    expect(markup).toContain('id="doctor-submissions-search"');
    expect(markup).toContain('id="doctor-filter-status-new"');
    expect(markup).toContain('id="doctor-filter-status-pending_doctor_review"');
    expect(markup).toContain('id="doctor-filter-status-approved"');
    expect(markup).toContain("Hồ sơ mới");
    expect(markup).toContain("Chưa duyệt");
    expect(markup).toContain("Đã duyệt");
  });

  it("keeps date, risk, gender and sort filters behind Lọc thêm", () => {
    const markup = html();
    expect(markup).toContain("Lọc thêm");
    expect(markup).not.toContain('id="doctor-filter-date-preset"');
    expect(markup).not.toContain('id="doctor-filter-risk"');
    expect(markup).not.toContain('id="doctor-filter-gender"');
    expect(markup).not.toContain('id="doctor-filter-sort"');
  });

  it("offers Phiếu CRF and REDCap as actions, not counters", () => {
    const markup = html();
    expect(markup).toContain('id="doctor-dashboard-crf"');
    expect(markup).toContain('id="doctor-dashboard-redcap"');
    expect(markup).toContain("Phiếu CRF");
    expect(markup).toContain("REDCap");
  });

  it("drops the grid/list toggle and the backend pointer sentence", () => {
    const markup = html();
    expect(markup).not.toContain("Dữ liệu đọc từ ảnh nằm ở phiếu CRF backend");
    expect(markup).not.toContain("doctor-view-grid");
    expect(markup).not.toContain("doctor-view-list");
  });
});

describe("compact submission rows", () => {
  const record = {
    ...buildBlankCrfRecord({ id: "web-id", studyId: "VN-1234-26", patientName: "Nguyễn Văn Minh" }),
    submittedAt: "19/11/2026",
    uploadedFiles: [{ id: "image", name: "results.jpg", url: null, isImage: true }],
    submissionStatus: "approved" as const,
  };

  const markup = (expanded: boolean, redcapExported = false, crf: React.ComponentProps<typeof SubmissionRow>["crf"] = { error: true, caseId: "backend/case" }) => renderToStaticMarkup(
    <SubmissionRow
      item={{
        dbSubmissionId: "web-id",
        record,
        submittedAtIso: "2026-11-19T00:00:00Z",
        ocrSummary: getOcrTierCounts(record),
        pipelineStatus: "completed",
        pipelineIntakeId: "intake-id",
      }}
      copy={getUploadPageCopy("vi").doctor}
      isVi
      expanded={expanded}
      inApprovedGroup
      crf={crf}
      redcapExported={redcapExported}
      onToggle={() => {}}
      onOpenRegistry={() => {}}
      onOpenDocument={() => {}}
      onRetried={() => {}}
    />,
  );

  it("links the approved dossier to its backend CRF while details are collapsed", () => {
    const html = markup(false);
    for (const value of ["VN-1234-26", "Nguyễn Văn Minh", "19/11/2026", "1 ảnh", "Đã duyệt", 'href="/crf-form?case=backend%2Fcase"', ">Xem phiếu CRF</a>"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain(">Duyệt</button>");
    expect(html).not.toContain("hành chính");
    expect(html).not.toContain("Tài liệu đính kèm");
  });

  it("shows the CRF action as unavailable when there is no backend case", () => {
    const html = markup(false, false, { error: true });
    expect(html).toMatch(/<button[^>]+disabled[^>]*>Xem phiếu CRF<\/button>/);
    expect(html).not.toContain("/crf-form?case=");
  });

  it("shows documents and administrative details on expansion, and only marks known exports", () => {
    const html = markup(true, true);
    expect(html).toContain("hành chính");
    expect(html).toContain("Tài liệu đính kèm");
    expect(html).toContain(">results</span>");
    expect(html).toContain("Đã xuất REDCap");
    expect(markup(false)).not.toContain("Đã xuất REDCap");
  });
});

describe("dossier approval in the CRF workflow", () => {
  it("links to the approved case from the registry success notice in both languages", () => {
    for (const [language, label] of [["vi", "Xem phiếu CRF"], ["en", "View CRF form"]] as const) {
      const html = renderToStaticMarkup(<DossierApprovalNotice caseId="approved/case" language={language} />);
      expect(html).toContain('href="/crf-form?case=approved%2Fcase"');
      expect(html).toContain(`>${label}</a>`);
    }
  });

  it("shows the dossier approval state in the CRF header only after web sign-off", () => {
    expect(renderToStaticMarkup(<CrfFormTitle language="vi" webApproved />)).toContain("Đã phê duyệt hồ sơ");
    expect(renderToStaticMarkup(<CrfFormTitle language="vi" webApproved={false} />)).not.toContain("Đã phê duyệt hồ sơ");
    expect(renderToStaticMarkup(<CrfFormTitle language="en" webApproved />)).toContain("Dossier approved");
  });

  it("starts with the patient prompt and no dossier selected", () => {
    const html = renderToStaticMarkup(<CrfFormPage />);
    expect(html).toContain('<option value="" selected="">Chọn bệnh nhân…</option>');
    expect(html).not.toContain("Đã phê duyệt hồ sơ");
  });
});

describe("upload page doctor header", () => {
  it("puts the patient-upload toggle next to the title instead of a details block", () => {
    const markup = renderToStaticMarkup(<PatientUploadPage />);
    expect(markup).toContain("+ Tải ảnh lên cho bệnh nhân");
    expect(markup).toContain('id="doctor-upload-for-patient"');
    expect(markup).toContain(">Hồ sơ bệnh nhân</h1>");
    expect(markup).not.toContain("Tiếp nhận Hồ sơ Bệnh nhân");
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain('id="doctor-upload-for-patient-panel"');
  });
});

describe("grouped dossier table", () => {
  const item = (id: string, overrides: Partial<React.ComponentProps<typeof SubmissionRow>["item"]> = {}) => {
    const record = buildBlankCrfRecord({ id, studyId: `VN-${id}`, patientName: "Chưa nhập tên" });
    return { dbSubmissionId: id, record, submittedAtIso: "2026-11-19T00:00:00Z", ocrSummary: getOcrTierCounts(record), ...overrides };
  };
  const crf = {
    caseId: "case-id",
    intakeId: "intake-id",
    view: {
      fields: [
        field({ options: [{ id: "a", value: "64 years" }] }),
        field({ slot: "ADM03/result", options: [{ id: "f", value: "Female" }] }),
        field({ slot: "CBC01/result", section: "Haematology", options: [{ id: "b", value: "8" }] }),
      ],
      review: { reviewer: { name: "Nguyễn An" }, reviewed_at: "2026-11-19T14:05:00", values: {} },
      source_snapshot: "snapshot",
      draft_sha256: "draft",
    },
  };
  const copy = getUploadPageCopy("vi").doctor;
  const table = (isVi = true, workingCrf = crf) => renderToStaticMarkup(<SubmissionTable
    items={[
      item("awaiting", { firstOpenedAt: "opened" }),
      item("fresh"),
      item("working", { pipelineStatus: "completed", pipelineIntakeId: "intake-id", firstOpenedAt: "opened" }),
      item("failed", { pipelineStatus: "failed", pipelineError: "This exact source image is already linked to another patient." }),
    ]}
    crfCases={{ "intake-id": workingCrf }}
    copy={getUploadPageCopy(isVi ? "vi" : "en").doctor}
    isVi={isVi}
    expandedId="working"
    exportedIds={new Set()}
    onToggle={() => {}}
    onOpenRegistry={() => {}}
    onOpenDocument={() => {}}
    onRetried={() => {}}
  />);

  it("renders aligned column headers, ordered nonempty groups, readable progress links and details", () => {
    const markup = table();
    for (const label of ["Study ID", "Bệnh nhân", "Ngày nộp", "Ảnh", "Tiến độ CRF", "Trạng thái", "Thao tác"]) {
      expect(markup).toContain(`>${label}</th>`);
    }
    expect(markup).toMatch(/Cần xử lý.*VN-failed.*Hồ sơ mới.*VN-fresh.*Đang duyệt.*VN-working.*Chờ duyệt.*VN-awaiting/);
    expect(markup.match(/scope="rowgroup"/g)).toHaveLength(4);
    expect(markup).toMatch(/<tr[^>]*font-bold[^>]*>.*?VN-fresh/);
    expect(markup).toContain("Nữ, 64 tuổi");
    expect(markup).toContain("chưa nhập tên");
    expect(markup).toContain('aria-label="Huyết học: 0/1 đã duyệt"');
    expect(markup).toContain("/registry?case=case-id&amp;intake=intake-id&amp;section=blood");
    expect(markup).toContain("còn 3 ô cần quyết định");
    expect(markup).toContain(">Duyệt</button>");
    expect(markup).not.toContain("Xem phiếu CRF");
    expect(markup).toContain("BS. Nguyễn An · 14:05 19/11");
    expect(markup).toContain("Ảnh trùng với hồ sơ khác đã có trong hệ thống");
    expect(markup).not.toContain("Gửi lại");
    expect(markup).not.toContain("Điều dưỡng:");
    expect(markup).not.toContain("Bác sĩ:");
  });

  it("localizes the same dashboard data in English", () => {
    const markup = table(false);
    expect(markup).toContain(">CRF progress</th>");
    expect(markup).toContain("Female, 64 years");
    expect(markup).toContain('aria-label="Haematology: 0/1 approved"');
    expect(markup).toContain("3 cells need a decision");
    expect(markup).toContain("Dr Nguyễn An · 14:05 19/11");
  });

  it("offers both CRF and review actions on a dossier ready for final sign-off", () => {
    const ready = { ...crf, view: { ...crf.view, fields: [] } };
    const markup = table(true, ready);
    expect(markup).toMatch(/scope="rowgroup"[^>]*>Đã duyệt.*?VN-working.*?href="\/crf-form\?case=case-id"[^>]*>Xem phiếu CRF<\/a>.*?>Duyệt<\/button>/);
  });

  it("offers a retry on transient failures and shows unknown details only on demand", () => {
    const row = (pipelineError: string) => renderToStaticMarkup(<SubmissionRow
      item={item("failed", { pipelineStatus: "failed", pipelineError })}
      copy={copy}
      isVi
      expanded
      inApprovedGroup={false}
      redcapExported={false}
      onToggle={() => {}}
      onOpenRegistry={() => {}}
      onOpenDocument={() => {}}
      onRetried={() => {}}
    />);
    expect(row("fetch failed")).toContain(">Gửi lại</button>");
    const unknown = row("Unexpected failure code ABC");
    expect(unknown).toContain("Có lỗi khi xử lý ảnh.");
    expect(unknown).toMatch(/<details[^>]*><summary[^>]*>Chi tiết kỹ thuật<\/summary>.*Unexpected failure code ABC.*<\/details>/);
    expect(unknown).toContain("Chưa ghi nhận");
    expect(unknown).not.toMatch(/Gửi lại|Phân tầng OCR|Điều dưỡng:|Bác sĩ:/);
  });
});
