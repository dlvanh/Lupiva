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
    triageHeading: string;
    manualTierLabel: string;
    verifyTierLabel: string;
    approvedTierLabel: string;
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
    eyebrow: string;
    heading: string;
    subheading: string;
    dropzoneLabel: string;
    dropzonePrompt: string;
    dropzoneHint: string;
    browseBtn: string;
    cameraBtn: string;
    scanBtn: string;
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
    uploadSuccessTitle: string;
    uploadSuccessMessage: string;
    uploadSuccessDismiss: string;
    scanner: {
      photoTitle: string;
      scanTitle: string;
      photoSubtitle: string;
      scanSubtitle: string;
      closeBtn: string;
      startingCamera: string;
      cameraUnavailableTitle: string;
      cameraUnavailableHint: string;
      nativeCameraBtn: string;
      switchCameraBtn: string;
      alignGuideText: string;
      captureBtn: string;
      scanCaptureBtn: string;
      retakeBtn: string;
      rotateBtn: string;
      filterLabel: string;
      filterScanBw: string;
      filterScanColor: string;
      filterOriginal: string;
      addMorePageBtn: string;
      pagesCapturedLabel: (count: number) => string;
      confirmSingleBtn: string;
      confirmMultiBtn: (count: number) => string;
      capturedPageAlt: (index: number) => string;
      removeCapturedPage: (index: number) => string;
    };
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
      triageHeading: "OCR Triage",
      manualTierLabel: "<80%",
      verifyTierLabel: "80–90%",
      approvedTierLabel: ">90%",
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
      noTreatments: "None listed",
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
      eyebrow: "Patient Portal",
      heading: "Upload your document",
      subheading:
        "Upload your hospital lab report or medical record. Our AI extracts structured biomarkers and a Vinmec doctor verifies the result.",
      dropzoneLabel: "Select, photograph, or scan lab images and PDF documents",
      dropzonePrompt: "Drag & drop images / PDFs here, or choose an option below",
      dropzoneHint: "Accepted: PNG, JPG, WEBP, PDF • Max 15 MB per file",
      browseBtn: "Browse files",
      cameraBtn: "Take photo",
      scanBtn: "Scan document",
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
      submitBtn: "Upload",
      submittingBtn: "Sending to clinical registry...",
      uploadSuccessTitle: "Submission Received",
      uploadSuccessMessage:
        "Cảm ơn bạn đã nộp hồ sơ tới dự án, thông tin của bạn sẽ được chuyển đến các bác sĩ chuyên khoa. Nếu có bất kỳ thắc mắc gì bạn vui lòng liên hệ đến chủ nhiệm dự án, email,... Chúng tôi sẵn sàng hỗ trợ giải đáp",
      uploadSuccessDismiss: "Dismiss notice",
      scanner: {
        photoTitle: "Take Document Photo",
        scanTitle: "Direct Document Scanner",
        photoSubtitle: "Capture a clear photo of your laboratory report or medical record.",
        scanSubtitle:
          "Align the page inside the frame. High-contrast scan filtering brightens paper and sharpens text automatically.",
        closeBtn: "Close",
        startingCamera: "Starting camera...",
        cameraUnavailableTitle: "Unable to access live camera in this browser",
        cameraUnavailableHint:
          "Please allow camera permission or tap below to open your device's camera app directly.",
        nativeCameraBtn: "Open Device Camera",
        switchCameraBtn: "Switch Camera",
        alignGuideText: "Align document within the frame",
        captureBtn: "Take Photo",
        scanCaptureBtn: "Scan Page",
        retakeBtn: "Retake",
        rotateBtn: "Rotate 90°",
        filterLabel: "Image mode:",
        filterScanBw: "Crisp Scan (B&W)",
        filterScanColor: "Color Scan",
        filterOriginal: "Original Photo",
        addMorePageBtn: "+ Scan Another Page",
        pagesCapturedLabel: (count) => `Captured pages (${count})`,
        confirmSingleBtn: "Use This Image",
        confirmMultiBtn: (count) => `Add ${count} Page(s) to Upload`,
        capturedPageAlt: (index) => `Captured page ${index}`,
        removeCapturedPage: (index) => `Remove captured page ${index}`,
      },
      guestBannerTitle: "Sign in required to submit to the encrypted registry",
      guestBannerDesc:
        "Sign in with your Patient account so your documents are securely saved and routed to clinical specialists.",
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
      triageHeading: "Phân tầng OCR",
      manualTierLabel: "<80%",
      verifyTierLabel: "80–90%",
      approvedTierLabel: ">90%",
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
      noTreatments: "Không có",
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
      eyebrow: "Cổng Bệnh nhân",
      heading: "Tải lên tài liệu của bạn",
      subheading:
        "Bạn chỉ cần tải lên phiếu xét nghiệm hoặc hồ sơ y tế. AI sẽ đọc tài liệu và bác sĩ Vinmec sẽ xác minh kết quả.",
      dropzoneLabel: "Chọn, chụp ảnh hoặc quét (scan) tài liệu xét nghiệm",
      dropzonePrompt: "Kéo thả ảnh / PDF vào đây, hoặc chọn cách thêm tài liệu bên dưới",
      dropzoneHint: "Chấp nhận: PNG, JPG, WEBP, PDF • Tối đa 15 MB mỗi tệp",
      browseBtn: "Chọn tệp",
      cameraBtn: "Chụp ảnh",
      scanBtn: "Quét tài liệu (Scan)",
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
      submitBtn: "Tải lên",
      submittingBtn: "Đang gửi hồ sơ lên hệ thống...",
      uploadSuccessTitle: "Đã tiếp nhận hồ sơ",
      uploadSuccessMessage:
        "Cảm ơn bạn đã nộp hồ sơ tới dự án, thông tin của bạn sẽ được chuyển đến các bác sĩ chuyên khoa. Nếu có bất kỳ thắc mắc gì bạn vui lòng liên hệ đến chủ nhiệm dự án, email,... Chúng tôi sẵn sàng hỗ trợ giải đáp",
      uploadSuccessDismiss: "Đóng thông báo",
      scanner: {
        photoTitle: "Chụp ảnh Tài liệu",
        scanTitle: "Quét Tài liệu Trực tiếp (Scan)",
        photoSubtitle: "Chụp ảnh rõ nét phiếu xét nghiệm hoặc hồ sơ khám bệnh của bạn.",
        scanSubtitle:
          "Đặt trang giấy gọn trong khung. Bộ lọc Scan tự động làm sáng nền giấy và tăng độ nét chữ số xét nghiệm.",
        closeBtn: "Đóng",
        startingCamera: "Đang khởi động camera...",
        cameraUnavailableTitle: "Không thể mở camera trực tiếp trên trình duyệt",
        cameraUnavailableHint:
          "Vui lòng cấp quyền camera hoặc bấm nút bên dưới để mở ứng dụng camera mặc định của thiết bị.",
        nativeCameraBtn: "Mở Camera Thiết bị",
        switchCameraBtn: "Đổi Camera",
        alignGuideText: "Căn chỉnh phiếu xét nghiệm nằm gọn trong khung",
        captureBtn: "Chụp ảnh",
        scanCaptureBtn: "Quét trang này",
        retakeBtn: "Chụp lại",
        rotateBtn: "Xoay 90°",
        filterLabel: "Chế độ ảnh:",
        filterScanBw: "Scan rõ chữ (Đen trắng)",
        filterScanColor: "Scan giữ màu",
        filterOriginal: "Ảnh gốc",
        addMorePageBtn: "+ Quét thêm trang",
        pagesCapturedLabel: (count) => `Trang đã quét (${count})`,
        confirmSingleBtn: "Dùng ảnh này",
        confirmMultiBtn: (count) => `Thêm ${count} trang vào danh sách`,
        capturedPageAlt: (index) => `Trang đã quét ${index}`,
        removeCapturedPage: (index) => `Xóa trang đã quét ${index}`,
      },
      guestBannerTitle: "Cần đăng nhập để gửi hồ sơ vào hệ thống bảo mật",
      guestBannerDesc:
        "Vui lòng đăng nhập bằng tài khoản Bệnh nhân để lưu hồ sơ bảo mật và chuyển tới đội ngũ bác sĩ chuyên khoa.",
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
