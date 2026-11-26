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
    pidPrefix: string;
    approvedBadge: string;
    pendingBadge: string;
    ageUnit: string;
    female: string;
    male: string;
    submittedAtPrefix: string;
    viewScoresBtn: string;
    reopenCrfBtn: string;
    reviewCrfBtn: string;
    scorePreviewHeading: string;
    eularClassified: string;
    eularBelow: string;
    clinicalDetailsSummary: (fileCount: number, medCount: number) => string;
    attachedDocsHeading: string;
    openDocHint: string;
    noAttachedDocs: string;
    physicianPrefix: string;
    nursePrefix: string;
    treatmentsHeading: string;
    noTreatments: string;
    docViewer: {
      dialogTitle: string;
      closeBtn: string;
      zoomOut: string;
      zoomIn: string;
      resetZoom: string;
      rotateLeft: string;
      rotateRight: string;
      downloadBtn: string;
      prevPage: string;
      nextPage: string;
      pageIndicator: (page: number, totalPages: number) => string;
      filesLabel: string;
      labSheetTitle: string;
      blotAndTxSheetTitle: string;
      testCol: string;
      resultCol: string;
      unitCol: string;
      refCol: string;
      flagCol: string;
      confCol: string;
      blotHeading: string;
      txHeading: string;
      careTeamHeading: string;
      signedByLabel: string;
      pendingSignOff: string;
    };
    paginationLabel: string;
    perPageLabel: string;
    prevPage: string;
    nextPage: string;
    pageLabel: (page: number) => string;
    pageOfTotal: (page: number, totalPages: number) => string;
    viewModeLabel: string;
    viewToolbarLabel: string;
    viewGridLabel: string;
    viewListLabel: string;
  };
  patient: {
    heading: string;
    subheading: string;
    dropzonePrompt: string;
    dropzoneHint: (maxMb: number) => string;
    browseBtn: string;
    cameraBtn: string;
    photoTipsHeading: string;
    photoTips: readonly string[];
    suggestedRecordsHeading: string;
    suggestedRecords: string;
    stagedListHeading: (count: number) => string;
    imageLabel: (n: number) => string;
    previewImageAction: (name: string) => string;
    removeFileAction: (name: string) => string;
    validationNoticeTitle: string;
    invalidFileType: (name: string) => string;
    fileTooLarge: (name: string, maxMb: number) => string;
    duplicateFile: (name: string) => string;
    stagedAnnouncement: (count: number) => string;
    submitBtn: string;
    submittingBtn: string;
    submitEmptyHint: string;
    submitSignInHint: string;
    guestBannerTitle: string;
    guestBannerDesc: string;
    guestSignInCta: string;
    trackerHeading: string;
    trackerCount: (count: number) => string;
    trackerEmpty: string;
    trackerErrorTitle: string;
    stepReceived: string;
    stepProcessing: string;
    stepDoctorReview: string;
    stepApproved: string;
    waitingNote: string;
    processingFailed: string;
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
      heading: "Patient dossiers",
      kpiTotal: "Total Cohort",
      kpiPending: "Pending Review",
      kpiManual: "Needs <80% OCR",
      kpiApproved: "Approved",
      filterHeading: "Filter & sort patient dossiers",
      searchLabel: "Search patient, Study ID, doctor, or file",
      searchPlaceholder: "Name, Study ID (SLER-...), or filename...",
      statusLegend: "Submission review status",
      statusOptions: {
        all: "All",
        new: "New",
        pending_doctor_review: "Not yet approved",
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
      pidPrefix: "PID:",
      approvedBadge: "Approved & Signed Off",
      pendingBadge: "Pending OCR Review",
      ageUnit: "yrs",
      female: "Female",
      male: "Male",
      submittedAtPrefix: "Uploaded:",
      viewScoresBtn: "View SLE Scores",
      reopenCrfBtn: "View Details",
      reviewCrfBtn: "Verify & Approve",
      scorePreviewHeading: "SLE Score Preview",
      eularClassified: "Classified SLE (≥10)",
      eularBelow: "Below threshold (<10)",
      clinicalDetailsSummary: (fileCount, medCount) =>
        `Attached Documents (${fileCount}) & Current Treatments (${medCount})`,
      attachedDocsHeading: "Attached Documents",
      openDocHint: "Click to view document",
      noAttachedDocs: "No documents attached",
      physicianPrefix: "Physician:",
      nursePrefix: "Nurse:",
      treatmentsHeading: "Current Treatments",
      noTreatments: "Not recorded",
      docViewer: {
        dialogTitle: "Attached Clinical Document Viewer",
        closeBtn: "Close",
        zoomOut: "Zoom out",
        zoomIn: "Zoom in",
        resetZoom: "Reset zoom",
        rotateLeft: "Rotate -90°",
        rotateRight: "Rotate +90°",
        downloadBtn: "Download",
        prevPage: "Prev",
        nextPage: "Next",
        pageIndicator: (page, totalPages) => `Page ${page} of ${totalPages}`,
        filesLabel: "Attachments:",
        labSheetTitle: "Page 1 — Clinical Laboratory & Serology Report",
        blotAndTxSheetTitle:
          "Page 2 — Immunoblot Panel, Current Treatments & Sign-Off",
        testCol: "Biomarker / Assay",
        resultCol: "Result",
        unitCol: "Unit",
        refCol: "Reference Range",
        flagCol: "Flag",
        confCol: "OCR",
        blotHeading: "Immunoblot Strip Summary (ANA Profile 23 / Myositis 16)",
        txHeading: "Current Treatments on Record",
        careTeamHeading: "Care Team & Registry Verification Status",
        signedByLabel: "Approved & Signed by:",
        pendingSignOff: "Pending Specialist OCR Verification",
      },
      paginationLabel: "Patient dossiers pagination",
      perPageLabel: "Per page",
      prevPage: "Previous",
      nextPage: "Next",
      pageLabel: (page) => `Page ${page}`,
      pageOfTotal: (page, totalPages) => `Page ${page} of ${totalPages}`,
      viewModeLabel: "Display",
      viewToolbarLabel: "Dossier display layout",
      viewGridLabel: "Grid",
      viewListLabel: "List",
    },
    patient: {
      heading: "Submit your records",
      subheading: "Send photos of your visit or test results for the project’s specialists to review.",
      dropzonePrompt: "Drag photos here to add them",
      dropzoneHint: (maxMb) => `PNG, JPG or WEBP images, up to ${maxMb} MB each.`,
      browseBtn: "Choose existing photos",
      cameraBtn: "Take a photo",
      photoTipsHeading: "How to take a clear photo",
      photoTips: [
        "Hold the camera straight above the page. Use good light and fit the whole sheet in the photo.",
        "Take one photo per page.",
        "Include the sample collection date if it’s on the page.",
      ],
      suggestedRecordsHeading: "Which records to send",
      suggestedRecords: "Lupus-related results such as blood tests, urine tests, antibody tests (ANA, anti-dsDNA), complement tests, lung function tests or ultrasound reports.",
      stagedListHeading: (count) => `Review your photos (${count})`,
      imageLabel: (n) => `Image ${n}`,
      previewImageAction: (name) => `Preview ${name}`,
      removeFileAction: (name) => `Remove ${name}`,
      validationNoticeTitle: "File check",
      invalidFileType: (name) =>
        `Skipped "${name}" because only PNG, JPG and WEBP images are accepted.`,
      fileTooLarge: (name, maxMb) =>
        `Skipped "${name}": exceeds the ${maxMb} MB per-file limit.`,
      duplicateFile: (name) => `"${name}" is already in your upload list.`,
      stagedAnnouncement: (count) =>
        count === 0
          ? "No photos selected."
          : `${count} ${count === 1 ? "photo is" : "photos are"} ready to send.`,
      submitBtn: "Send records",
      submittingBtn: "Uploading images… please keep this page open",
      submitEmptyHint: "Choose at least 1 photo to send",
      submitSignInHint: "Sign in before you send your photos",
      guestBannerTitle: "Sign in to send your records",
      guestBannerDesc: "Use your patient account to send photos and track their status.",
      guestSignInCta: "Sign in",
      trackerHeading: "Your submissions",
      trackerCount: (count) => `${count} ${count === 1 ? "submission" : "submissions"}`,
      trackerEmpty: "You haven’t sent any records yet.",
      trackerErrorTitle: "Unable to load your submission history.",
      stepReceived: "Received",
      stepProcessing: "Processing",
      stepDoctorReview: "Doctor reviewing",
      stepApproved: "Approved by doctor",
      waitingNote: "This usually takes a few working days. You don’t need to do anything else.",
      processingFailed: "There was a problem with the images you sent. The project team will contact you.",
      previewDialogTitle: "Photo preview",
      previewDialogClose: "Close",
      paginationLabel: "Your submissions pagination",
      prevPage: "Previous",
      nextPage: "Next",
      pageOfTotal: (page, totalPages) => `Page ${page} of ${totalPages}`,
    },
  },
  vi: {
    doctor: {
      heading: "Hồ sơ bệnh nhân",
      kpiTotal: "Tổng hồ sơ",
      kpiPending: "Chờ bác sĩ duyệt",
      kpiManual: "Cần nhập tay <80%",
      kpiApproved: "Đã phê duyệt",
      filterHeading: "Bộ lọc & sắp xếp hồ sơ bệnh nhân",
      searchLabel: "Tìm tên bệnh nhân, Study ID, bác sĩ hoặc tệp",
      searchPlaceholder: "Tên, Study ID (SLER-...), hoặc tên tệp...",
      statusLegend: "Trạng thái duyệt hồ sơ",
      statusOptions: {
        all: "Tất cả",
        new: "Hồ sơ mới",
        pending_doctor_review: "Chưa phê duyệt",
        approved: "Đã phê duyệt",
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
      pidPrefix: "PID:",
      approvedBadge: "Đã duyệt & Ký CRF",
      pendingBadge: "Chờ bác sĩ duyệt OCR",
      ageUnit: "tuổi",
      female: "Nữ",
      male: "Nam",
      submittedAtPrefix: "Tải lên lúc:",
      viewScoresBtn: "Xem Bảng điểm SLE",
      reopenCrfBtn: "Xem Chi tiết",
      reviewCrfBtn: "Xác minh & Duyệt",
      scorePreviewHeading: "Điểm Phân loại & Hoạt tính",
      eularClassified: "Đạt tiêu chuẩn SLE (≥10)",
      eularBelow: "Chưa đạt ngưỡng (<10)",
      clinicalDetailsSummary: (fileCount, medCount) =>
        `Tài liệu đính kèm (${fileCount}) & Thuốc điều trị (${medCount})`,
      attachedDocsHeading: "Tài liệu đính kèm",
      openDocHint: "Nhấp để mở tài liệu",
      noAttachedDocs: "Chưa có tài liệu đính kèm",
      physicianPrefix: "Bác sĩ:",
      nursePrefix: "Điều dưỡng:",
      treatmentsHeading: "Thuốc điều trị hiện tại",
      noTreatments: "Chưa ghi nhận",
      docViewer: {
        dialogTitle: "Trình Xem Tài liệu Lâm sàng Đính kèm",
        closeBtn: "Đóng",
        zoomOut: "Thu nhỏ",
        zoomIn: "Phóng to",
        resetZoom: "Đặt lại thu phóng",
        rotateLeft: "Xoay -90°",
        rotateRight: "Xoay +90°",
        downloadBtn: "Tải xuống",
        prevPage: "Trước",
        nextPage: "Sau",
        pageIndicator: (page, totalPages) => `Trang ${page} / ${totalPages}`,
        filesLabel: "Tệp đính kèm:",
        labSheetTitle: "Trang 1 — Phiếu Kết quả Xét nghiệm & Huyết thanh học",
        blotAndTxSheetTitle:
          "Trang 2 — Bảng Immunoblot, Thuốc điều trị & Ký duyệt",
        testCol: "Chỉ số Xét nghiệm",
        resultCol: "Kết quả",
        unitCol: "Đơn vị",
        refCol: "Khoảng tham chiếu",
        flagCol: "Cờ",
        confCol: "OCR",
        blotHeading: "Tóm tắt Immunoblot (ANA Profile 23 / Myositis 16)",
        txHeading: "Thuốc điều trị hiện tại",
        careTeamHeading: "Đội ngũ Phụ trách & Trạng thái Phê duyệt",
        signedByLabel: "Đã phê duyệt & ký bởi:",
        pendingSignOff: "Đang chờ Bác sĩ Chuyên khoa xác minh OCR",
      },
      paginationLabel: "Phân trang hồ sơ bệnh nhân",
      perPageLabel: "Mỗi trang",
      prevPage: "Trang trước",
      nextPage: "Trang sau",
      pageLabel: (page) => `Trang ${page}`,
      pageOfTotal: (page, totalPages) => `Trang ${page} / ${totalPages}`,
      viewModeLabel: "Hiển thị",
      viewToolbarLabel: "Chế độ hiển thị hồ sơ",
      viewGridLabel: "Lưới",
      viewListLabel: "Danh sách",
    },
    patient: {
      heading: "Nộp hồ sơ",
      subheading: "Gửi ảnh kết quả khám hoặc xét nghiệm để bác sĩ chuyên khoa của dự án xem.",
      dropzonePrompt: "Kéo thả ảnh vào đây để thêm ảnh",
      dropzoneHint: (maxMb) => `Ảnh PNG, JPG hoặc WEBP, tối đa ${maxMb} MB mỗi ảnh.`,
      browseBtn: "Chọn ảnh có sẵn",
      cameraBtn: "Chụp ảnh phiếu",
      photoTipsHeading: "Cách chụp ảnh rõ",
      photoTips: [
        "Chụp thẳng từ trên xuống, đủ sáng và thấy hết tờ giấy.",
        "Mỗi trang một ảnh.",
        "Chụp cả phần có ngày lấy mẫu nếu ngày này ghi trên phiếu.",
      ],
      suggestedRecordsHeading: "Nên nộp gì",
      suggestedRecords: "Kết quả liên quan đến bệnh lupus, như xét nghiệm máu, nước tiểu, kháng thể (ANA, anti-dsDNA), bổ thể, đo chức năng hô hấp hoặc siêu âm.",
      stagedListHeading: (count) => `Kiểm tra ảnh trước khi gửi (${count})`,
      imageLabel: (n) => `Ảnh ${n}`,
      previewImageAction: (name) => `Xem trước ${name}`,
      removeFileAction: (name) => `Xóa ${name}`,
      validationNoticeTitle: "Kiểm tra tệp",
      invalidFileType: (name) =>
        `Đã bỏ qua "${name}" vì chỉ hỗ trợ ảnh PNG, JPG và WEBP.`,
      fileTooLarge: (name, maxMb) =>
        `Đã bỏ qua "${name}": vượt quá giới hạn ${maxMb} MB mỗi tệp.`,
      duplicateFile: (name) => `Tệp "${name}" đã có trong danh sách tải lên.`,
      stagedAnnouncement: (count) =>
        count === 0
          ? "Chưa chọn ảnh nào."
          : `Có ${count} ảnh sẵn sàng gửi.`,
      submitBtn: "Gửi hồ sơ",
      submittingBtn: "Đang gửi ảnh… vui lòng không đóng trang",
      submitEmptyHint: "Chọn ít nhất 1 ảnh để gửi",
      submitSignInHint: "Đăng nhập để gửi ảnh",
      guestBannerTitle: "Đăng nhập để gửi hồ sơ",
      guestBannerDesc: "Dùng tài khoản bệnh nhân để gửi ảnh và theo dõi trạng thái hồ sơ.",
      guestSignInCta: "Đăng nhập",
      trackerHeading: "Hồ sơ đã gửi",
      trackerCount: (count) => `${count} hồ sơ`,
      trackerEmpty: "Bạn chưa gửi hồ sơ nào.",
      trackerErrorTitle: "Không tải được danh sách hồ sơ đã gửi.",
      stepReceived: "Đã nhận",
      stepProcessing: "Đang xử lý",
      stepDoctorReview: "Bác sĩ đang xem",
      stepApproved: "Bác sĩ đã duyệt",
      waitingNote: "Thường trong vài ngày làm việc. Bạn không cần làm gì thêm.",
      processingFailed: "Có vấn đề với ảnh đã gửi. Nhóm dự án sẽ liên hệ với bạn.",
      previewDialogTitle: "Xem trước ảnh",
      previewDialogClose: "Đóng",
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

// The specialist's embedded uploader still supports metadata-only documents.
export const EMBEDDED_UPLOAD_COPY = {
  en: {
    eyebrow: "Patient Portal",
    heading: "Upload your document",
    subheading: "Upload your hospital lab report or medical record. Our AI extracts structured biomarkers and a Vinmec doctor verifies the result.",
    dropzonePrompt: "Drag & drop images / PDFs here, or click to select",
    dropzoneHint: "Accepted: PNG, JPG, WEBP, PDF • Max 15 MB per file",
    browseBtn: "Browse files",
    cameraBtn: "Take photo",
    stagedListHeading: (count: number) => `Files ready to submit (${count})`,
    invalidFileType: (name: string) => `Skipped "${name}": only PNG, JPG, WEBP, or PDF files are accepted.`,
    stagedAnnouncement: (count: number) => count === 0 ? "Upload queue cleared." : `${count} file(s) staged for submission.`,
    submitBtn: "Upload & send to doctor",
    submittingBtn: "Sending to clinical registry...",
    previewDialogTitle: "Uploaded document preview",
    previewDialogClose: "Close preview",
  },
  vi: {
    eyebrow: "Cổng Bệnh nhân",
    heading: "Tải lên tài liệu của bạn",
    subheading: "Bạn chỉ cần tải lên phiếu xét nghiệm hoặc hồ sơ y tế. AI sẽ đọc tài liệu và bác sĩ Vinmec sẽ xác minh kết quả.",
    dropzonePrompt: "Kéo thả ảnh / PDF vào đây, hoặc nhấp để chọn tệp",
    dropzoneHint: "Chấp nhận: PNG, JPG, WEBP, PDF • Tối đa 15 MB mỗi tệp",
    browseBtn: "Chọn tệp",
    cameraBtn: "Chụp ảnh",
    stagedListHeading: (count: number) => `Tệp sẵn sàng gửi (${count})`,
    invalidFileType: (name: string) => `Đã bỏ qua "${name}": chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc PDF.`,
    stagedAnnouncement: (count: number) => count === 0 ? "Đã xóa hết tệp chờ gửi." : `Có ${count} tệp sẵn sàng gửi bác sĩ.`,
    submitBtn: "Tải lên & Gửi cho Bác sĩ",
    submittingBtn: "Đang gửi hồ sơ lên hệ thống...",
    previewDialogTitle: "Xem trước ảnh tài liệu tải lên",
    previewDialogClose: "Đóng xem trước",
  },
};

/** Numbered label for a staged image; `index` is 0-based, the label starts at 1. */
export function fileLabel(index: number, language: Language): string {
  return getUploadPageCopy(language).patient.imageLabel(index + 1);
}
