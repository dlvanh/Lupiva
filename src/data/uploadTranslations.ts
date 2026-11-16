import type { Language } from "./translations";
import type {
  ClinicalRiskFilter,
  GenderFilter,
  SubmissionReviewFilter,
  SubmissionSortOption,
  UploadedDatePreset,
} from "@/lib/submissionFilters";

export interface UploadPageCopy {
  doctor: {
    eyebrow: string;
    heading: string;
    kpiTotal: string;
    kpiPending: string;
    kpiManual: string;
    kpiApproved: string;
    filterHeading: string;
    searchLabel: string;
    searchPlaceholder: string;
    statusLegend: string;
    statusOptions: Record<SubmissionReviewFilter, string>;
    datePresetLabel: string;
    datePresetOptions: Record<UploadedDatePreset, string>;
    fromDateLabel: string;
    toDateLabel: string;
    clinicalRiskLabel: string;
    clinicalRiskOptions: Record<ClinicalRiskFilter, string>;
    genderLabel: string;
    genderOptions: Record<GenderFilter, string>;
    sortLabel: string;
    sortOptions: Record<SubmissionSortOption, string>;
    resetFilters: string;
    activeFiltersBadge: (count: number) => string;
    resultsAnnouncement: (
      from: number,
      to: number,
      totalMatched: number,
      page: number,
      totalPages: number
    ) => string;
    resultsEmptyAnnouncement: string;
    loadingText: string;
    errorTitle: string;
    retryBtn: string;
    emptyTitle: string;
    emptyHint: string;
    approvedBadge: string;
    pendingBadge: string;
    ageUnit: string;
    female: string;
    male: string;
    submittedAtPrefix: string;
    viewScoresBtn: string;
    reopenCrfBtn: string;
    reviewCrfBtn: string;
    triageHeading: string;
    manualTierLabel: string;
    verifyTierLabel: string;
    approvedTierLabel: string;
    blankUnder80: string;
    scorePreviewHeading: string;
    eularClassified: string;
    eularBelow: string;
    clinicalDetailsSummary: (fileCount: number, medCount: number) => string;
    docsAndTeamHeading: string;
    physicianPrefix: string;
    nursePrefix: string;
    organsHeading: string;
    noOrgansRecorded: string;
    comorbiditiesPrefix: string;
    treatmentsHeading: string;
    noTreatments: string;
    paginationLabel: string;
    perPageLabel: string;
    prevPage: string;
    nextPage: string;
    pageLabel: (page: number) => string;
    pageOfTotal: (page: number, totalPages: number) => string;
  };
  patient: {
    eyebrow: string;
    heading: string;
    subheading: string;
    dropzoneLabel: string;
    dropzonePrompt: string;
    dropzoneHint: string;
    browseBtn: string;
    sampleBtn: string;
    stagedListHeading: (count: number) => string;
    previewImageAction: (name: string) => string;
    removeFileAction: (name: string) => string;
    validationNoticeTitle: string;
    invalidFileType: (name: string) => string;
    fileTooLarge: (name: string, maxMb: number) => string;
    duplicateFile: (name: string) => string;
    stagedAnnouncement: (count: number) => string;
    submitBtn: string;
    submittingBtn: string;
    guestBannerTitle: string;
    guestBannerDesc: string;
    guestSignInCta: string;
    trackerHeading: string;
    trackerSortNote: string;
    trackerCount: (count: number) => string;
    trackerEmpty: string;
    trackerErrorTitle: string;
    stepUploaded: string;
    stepOcrExtracted: string;
    stepApproved: string;
    stepPendingDoctor: string;
    previewDialogTitle: string;
    previewDialogClose: string;
    paginationLabel: string;
    prevPage: string;
    nextPage: string;
    pageOfTotal: (page: number, totalPages: number) => string;
  };
}

const UPLOAD_COPY: Record<Language, UploadPageCopy> = {
  en: {
    doctor: {
      eyebrow: "Doctor Workspace • Patient Submissions",
      heading: "Submitted Patient Dossiers & Clinical Summary",
      kpiTotal: "Total Cohort",
      kpiPending: "Pending Review",
      kpiManual: "Needs <80% OCR",
      kpiApproved: "Approved",
      filterHeading: "Filter & sort patient dossiers",
      searchLabel: "Search patient, Study ID, doctor, or file",
      searchPlaceholder: "Name, Study ID (VN-...), or filename...",
      statusLegend: "Submission review status",
      statusOptions: {
        all: "All",
        pending_doctor_review: "Pending Review",
        approved: "Approved",
      },
      datePresetLabel: "Uploaded Date",
      datePresetOptions: {
        all: "All upload dates",
        today: "Today",
        last_7_days: "Last 7 days",
        last_30_days: "Last 30 days",
        custom: "Custom range",
      },
      fromDateLabel: "From date",
      toDateLabel: "To date",
      clinicalRiskLabel: "SLE Classification / Activity",
      clinicalRiskOptions: {
        all: "All scores",
        eular_classified: "EULAR/ACR ≥10 (SLE)",
        eular_below: "EULAR/ACR <10 (Pre/Incomplete)",
        sledai_high: "SLEDAI-2K High / Very High (≥11)",
        sledai_low_mod: "SLEDAI-2K Mild / Moderate (<11)",
      },
      genderLabel: "Sex",
      genderOptions: {
        all: "All",
        Female: "Female",
        Male: "Male",
      },
      sortLabel: "Sort by",
      sortOptions: {
        newest: "Uploaded Date (Newest)",
        oldest: "Uploaded Date (Oldest)",
      },
      resetFilters: "Reset filters",
      activeFiltersBadge: (count) => `${count} active`,
      resultsAnnouncement: (from, to, totalMatched, page, totalPages) =>
        `Showing ${from}–${to} of ${totalMatched} patient dossiers (Page ${page} of ${totalPages}).`,
      resultsEmptyAnnouncement: "Showing 0 matching patient dossiers.",
      loadingText: "Loading patient dossiers...",
      errorTitle: "Unable to load patient dossiers from the API.",
      retryBtn: "Retry query",
      emptyTitle: "No matching patient dossiers found.",
      emptyHint:
        "Adjust uploaded date, clinical filters, or search terms to view other dossiers.",
      approvedBadge: "Approved & Signed Off",
      pendingBadge: "Pending OCR Review",
      ageUnit: "yrs",
      female: "Female",
      male: "Male",
      submittedAtPrefix: "Uploaded:",
      viewScoresBtn: "View SLE Scores",
      reopenCrfBtn: "Open OCR & e-CRF →",
      reviewCrfBtn: "Review OCR & e-CRF →",
      triageHeading: "AI OCR 3-Tier Triage & Key Biomarkers",
      manualTierLabel: "<80% Manual",
      verifyTierLabel: "80–90% Verify",
      approvedTierLabel: ">90% Auto/OK",
      blankUnder80: "[Blank <80%]",
      scorePreviewHeading: "SLE Score Preview",
      eularClassified: "Classified SLE (≥10)",
      eularBelow: "Below threshold (<10)",
      clinicalDetailsSummary: (fileCount, medCount) =>
        `Documents (${fileCount}), Care Team, Organs & Treatments (${medCount})`,
      docsAndTeamHeading: "Attached Documents & Care Team",
      physicianPrefix: "Physician:",
      nursePrefix: "Nurse:",
      organsHeading: "Clinical Presentation & Organ Involvement",
      noOrgansRecorded: "No active organ damage recorded",
      comorbiditiesPrefix: "Comorbidities:",
      treatmentsHeading: "Current Treatments",
      noTreatments: "None listed",
      paginationLabel: "Patient dossiers pagination",
      perPageLabel: "Per page",
      prevPage: "Previous",
      nextPage: "Next",
      pageLabel: (page) => `Page ${page}`,
      pageOfTotal: (page, totalPages) => `Page ${page} of ${totalPages}`,
    },
    patient: {
      eyebrow: "Patient Portal",
      heading: "Upload your document",
      subheading:
        "Upload your hospital lab report or medical record. Our AI extracts structured biomarkers and a Vinmec doctor verifies the result.",
      dropzoneLabel: "Select or drop lab images and PDF documents",
      dropzonePrompt: "Drag & drop images / PDFs here, or click to select",
      dropzoneHint: "Accepted: PNG, JPG, WEBP, PDF • Max 15 MB per file",
      browseBtn: "Browse files",
      sampleBtn: "Use sample hospital dossier",
      stagedListHeading: (count) => `Files ready to submit (${count})`,
      previewImageAction: (name) => `Preview ${name}`,
      removeFileAction: (name) => `Remove ${name}`,
      validationNoticeTitle: "File check",
      invalidFileType: (name) =>
        `Skipped "${name}": only PNG, JPG, WEBP, or PDF files are accepted.`,
      fileTooLarge: (name, maxMb) =>
        `Skipped "${name}": exceeds the ${maxMb} MB per-file limit.`,
      duplicateFile: (name) => `"${name}" is already in your upload list.`,
      stagedAnnouncement: (count) =>
        count === 0
          ? "Upload queue cleared."
          : `${count} file(s) staged for submission.`,
      submitBtn: "Upload & send to doctor",
      submittingBtn: "Sending to clinical registry...",
      guestBannerTitle: "Sign in required to submit to the encrypted registry",
      guestBannerDesc:
        "Sign in with your Patient account (or Doctor demo account) so your documents persist to PostgreSQL and appear in the review queue.",
      guestSignInCta: "Sign in to continue →",
      trackerHeading: "Your submissions",
      trackerSortNote: "Ordered by upload date (newest first)",
      trackerCount: (count) => `${count} dossier(s)`,
      trackerEmpty: "You have no submitted documents yet.",
      trackerErrorTitle: "Unable to load your submission history.",
      stepUploaded: "1. Uploaded",
      stepOcrExtracted: "2. AI OCR extracted",
      stepApproved: "3. Approved by doctor",
      stepPendingDoctor: "3. Pending doctor review",
      previewDialogTitle: "Uploaded document preview",
      previewDialogClose: "Close preview",
      paginationLabel: "Your submissions pagination",
      prevPage: "Previous",
      nextPage: "Next",
      pageOfTotal: (page, totalPages) => `Page ${page} of ${totalPages}`,
    },
  },
  vi: {
    doctor: {
      eyebrow: "Cổng Bác sĩ • Tiếp nhận Hồ sơ Bệnh nhân",
      heading: "Hồ sơ Xét nghiệm Bệnh nhân Đã gửi",
      kpiTotal: "Tổng hồ sơ",
      kpiPending: "Chờ bác sĩ duyệt",
      kpiManual: "Cần nhập tay <80%",
      kpiApproved: "Đã phê duyệt",
      filterHeading: "Bộ lọc & sắp xếp hồ sơ bệnh nhân",
      searchLabel: "Tìm tên bệnh nhân, Study ID, bác sĩ hoặc tệp",
      searchPlaceholder: "Tên, Study ID (VN-...), hoặc tên tệp...",
      statusLegend: "Trạng thái duyệt hồ sơ",
      statusOptions: {
        all: "Tất cả",
        pending_doctor_review: "Chờ bác sĩ duyệt",
        approved: "Đã duyệt & ký",
      },
      datePresetLabel: "Ngày tải lên",
      datePresetOptions: {
        all: "Mọi ngày",
        today: "Hôm nay",
        last_7_days: "7 ngày qua",
        last_30_days: "30 ngày qua",
        custom: "Khoảng ngày tùy chọn",
      },
      fromDateLabel: "Từ ngày",
      toDateLabel: "Đến ngày",
      clinicalRiskLabel: "Phân loại & Hoạt tính SLE",
      clinicalRiskOptions: {
        all: "Tất cả mức điểm",
        eular_classified: "EULAR/ACR ≥10 (Đạt chuẩn SLE)",
        eular_below: "EULAR/ACR <10 (Chưa đạt ngưỡng)",
        sledai_high: "SLEDAI-2K Cao / Rất cao (≥11)",
        sledai_low_mod: "SLEDAI-2K Nhẹ / Trung bình (<11)",
      },
      genderLabel: "Giới tính",
      genderOptions: {
        all: "Tất cả",
        Female: "Nữ",
        Male: "Nam",
      },
      sortLabel: "Sắp xếp theo",
      sortOptions: {
        newest: "Ngày tải lên (Mới nhất)",
        oldest: "Ngày tải lên (Cũ nhất)",
      },
      resetFilters: "Xóa bộ lọc",
      activeFiltersBadge: (count) => `Đang lọc (${count})`,
      resultsAnnouncement: (from, to, totalMatched, page, totalPages) =>
        `Hiển thị ${from}–${to} / ${totalMatched} hồ sơ bệnh nhân (Trang ${page} / ${totalPages}).`,
      resultsEmptyAnnouncement: "Không có hồ sơ bệnh nhân phù hợp.",
      loadingText: "Đang tải hồ sơ bệnh nhân...",
      errorTitle: "Không thể tải danh sách hồ sơ từ API.",
      retryBtn: "Thử lại",
      emptyTitle: "Không tìm thấy hồ sơ bệnh nhân phù hợp.",
      emptyHint:
        "Hãy điều chỉnh ngày tải lên, bộ lọc lâm sàng hoặc từ khóa tìm kiếm.",
      approvedBadge: "Đã duyệt & Ký CRF",
      pendingBadge: "Chờ bác sĩ duyệt OCR",
      ageUnit: "tuổi",
      female: "Nữ",
      male: "Nam",
      submittedAtPrefix: "Tải lên lúc:",
      viewScoresBtn: "Xem Bảng điểm SLE",
      reopenCrfBtn: "Mở lại OCR & e-CRF →",
      reviewCrfBtn: "Duyệt OCR & e-CRF →",
      triageHeading: "Phân tầng AI OCR (3 Mức) & Xét nghiệm Nổi bật",
      manualTierLabel: "<80% Nhập tay",
      verifyTierLabel: "80–90% Xác nhận",
      approvedTierLabel: ">90% Đã duyệt",
      blankUnder80: "[Trống <80%]",
      scorePreviewHeading: "Điểm Phân loại & Hoạt tính",
      eularClassified: "Đạt tiêu chuẩn SLE (≥10)",
      eularBelow: "Chưa đạt ngưỡng (<10)",
      clinicalDetailsSummary: (fileCount, medCount) =>
        `Tài liệu (${fileCount}), Đội ngũ, Cơ quan & Thuốc điều trị (${medCount})`,
      docsAndTeamHeading: "Tài liệu đính kèm & Đội ngũ phụ trách",
      physicianPrefix: "Bác sĩ:",
      nursePrefix: "Điều dưỡng:",
      organsHeading: "Biểu hiện Lâm sàng & Cơ quan Tổn thương",
      noOrgansRecorded: "Chưa ghi nhận tổn thương cơ quan",
      comorbiditiesPrefix: "Bệnh đồng mắc:",
      treatmentsHeading: "Thuốc điều trị hiện tại",
      noTreatments: "Không có",
      paginationLabel: "Phân trang hồ sơ bệnh nhân",
      perPageLabel: "Mỗi trang",
      prevPage: "Trang trước",
      nextPage: "Trang sau",
      pageLabel: (page) => `Trang ${page}`,
      pageOfTotal: (page, totalPages) => `Trang ${page} / ${totalPages}`,
    },
    patient: {
      eyebrow: "Cổng Bệnh nhân",
      heading: "Tải lên tài liệu của bạn",
      subheading:
        "Bạn chỉ cần tải lên phiếu xét nghiệm hoặc hồ sơ y tế. AI sẽ đọc tài liệu và bác sĩ Vinmec sẽ xác minh kết quả.",
      dropzoneLabel: "Chọn hoặc thả ảnh và tài liệu PDF xét nghiệm",
      dropzonePrompt: "Kéo thả ảnh / PDF vào đây, hoặc nhấp để chọn tệp",
      dropzoneHint: "Chấp nhận: PNG, JPG, WEBP, PDF • Tối đa 15 MB mỗi tệp",
      browseBtn: "Chọn tệp",
      sampleBtn: "Dùng hồ sơ mẫu",
      stagedListHeading: (count) => `Tệp sẵn sàng gửi (${count})`,
      previewImageAction: (name) => `Xem trước ${name}`,
      removeFileAction: (name) => `Xóa ${name}`,
      validationNoticeTitle: "Kiểm tra tệp",
      invalidFileType: (name) =>
        `Đã bỏ qua "${name}": chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc PDF.`,
      fileTooLarge: (name, maxMb) =>
        `Đã bỏ qua "${name}": vượt quá giới hạn ${maxMb} MB mỗi tệp.`,
      duplicateFile: (name) => `Tệp "${name}" đã có trong danh sách tải lên.`,
      stagedAnnouncement: (count) =>
        count === 0
          ? "Đã xóa hết tệp chờ gửi."
          : `Có ${count} tệp sẵn sàng gửi bác sĩ.`,
      submitBtn: "Tải lên & Gửi cho Bác sĩ",
      submittingBtn: "Đang gửi hồ sơ lên hệ thống...",
      guestBannerTitle: "Cần đăng nhập để gửi hồ sơ vào hệ thống bảo mật",
      guestBannerDesc:
        "Vui lòng đăng nhập bằng tài khoản Bệnh nhân (hoặc tài khoản Bác sĩ mẫu) để lưu hồ sơ vào PostgreSQL và theo dõi tiến độ duyệt.",
      guestSignInCta: "Đăng nhập ngay →",
      trackerHeading: "Trạng thái tài liệu đã gửi",
      trackerSortNote: "Mặc định sắp xếp theo ngày tải lên (mới nhất trước)",
      trackerCount: (count) => `${count} hồ sơ`,
      trackerEmpty: "Bạn chưa có tài liệu nào được gửi.",
      trackerErrorTitle: "Không thể tải lịch sử tài liệu đã gửi.",
      stepUploaded: "1. Đã tải lên",
      stepOcrExtracted: "2. AI đã trích xuất",
      stepApproved: "3. Bác sĩ đã duyệt",
      stepPendingDoctor: "3. Chờ bác sĩ xác minh",
      previewDialogTitle: "Xem trước ảnh tài liệu tải lên",
      previewDialogClose: "Đóng xem trước",
      paginationLabel: "Phân trang lịch sử gửi tài liệu",
      prevPage: "Trang trước",
      nextPage: "Trang sau",
      pageOfTotal: (page, totalPages) => `Trang ${page} / ${totalPages}`,
    },
  },
};

export function getUploadPageCopy(language: Language): UploadPageCopy {
  return UPLOAD_COPY[language];
}
