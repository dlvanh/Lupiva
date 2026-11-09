import {
  UserRole,
  DemoUser,
  LabReportMock,
  ButtonMappingItem,
  DEMO_USERS,
  MOCK_LAB_REPORTS,
  BUTTON_ACTION_MAP,
} from "./mockData";

export type Language = "en" | "vi";

export interface Translations {
  common: {
    brandSubtitle: string;
    allMockDataNotice: string;
    gotIt: string;
    close: string;
    closeEsc: string;
    verified: string;
    needsReview: string;
    abnormal: string;
    normal: string;
    high: string;
    low: string;
    positive: string;
    languageToggleTitle: string;
    activeModeSpecialist: string;
    activeModePatient: string;
    signOut: string;
    signIn: string;
    guestMode: string;
  };
  navbar: {
    overviewWorkflow: string;
    roleLogin: string;
    ocrWorkspace: string;
    uiButtonMap: string;
    inspectButtonsTitle: string;
    modalTitle: string;
    modalDescription: string;
    modalThPage: string;
    modalThButton: string;
    modalThAction: string;
    modalThOutcome: string;
  };
  landing: {
    challengeTag: string;
    specialtyTag: string;
    heroTitle: string;
    heroDescription: string;
    launchOcrBtn: string;
    switchRoleBtn: (role: "specialist" | "patient") => string;
    loginBtn: string;
    viewButtonMapBtn: (count: number) => string;
    metricPanelsTitle: string;
    metricPanelsVal: string;
    metricPanelsSub: string;
    metricConfidenceTitle: string;
    metricConfidenceVal: string;
    metricConfidenceSub: string;
    metricCommitsTitle: string;
    metricCommitsVal: (count: number) => string;
    metricCommitsSub: string;
    previewBadge: string;
    previewNeedsReview: (count: number) => string;
    previewOpenOcrBtn: string;
    workflowSectionTitle: string;
    workflowSectionSub: string;
    workflowJumpLink: string;
    step1Tag: string;
    step1Category: string;
    step1Title: string;
    step1Desc: string;
    step2Tag: string;
    step2Category: string;
    step2Title: string;
    step2Desc: string;
    step3Tag: string;
    step3Category: string;
    step3Title: string;
    step3Desc: string;
    mockSectionTitle: string;
    mockSectionSub: string;
    sampleBadge: (index: number) => string;
    abnormalBadge: (count: number) => string;
    needsReviewBadge: (count: number) => string;
    inspectCardBtn: string;
  };
  login: {
    roleAccessTag: string;
    title: string;
    autofillBtn: string;
    subtitle: string;
    specialistTabTitle: string;
    specialistTabBadge: string;
    specialistTabDesc: string;
    patientTabTitle: string;
    patientTabBadge: string;
    patientTabDesc: string;
    emailLabel: string;
    passwordLabel: string;
    passwordHint: string;
    specialistConsent: string;
    patientConsent: string;
    submitBtn: (name: string) => string;
    skipBtn: string;
    selectedProfileTitle: string;
    roleAffiliation: string;
    deptCohort: string;
    whatUnlocks: string;
    activeSessionTitle: string;
    loggedInAs: (name: string) => string;
    guestNotice: string;
  };
  ocr: {
    sampleScanLabel: string;
    uploadBtn: string;
    runScanBtn: string;
    scanningBtn: string;
    resetBtn: string;
    resetTitle: string;
    sourceScanHeader: string;
    uploadedLabel: (name: string) => string;
    boxesOn: string;
    boxesOff: string;
    uploadedScanTitle: string;
    returnToMock: string;
    patientLabel: string;
    idLabel: string;
    specimenLabel: string;
    tableThBiomarker: string;
    tableThResult: string;
    tableThFlag: string;
    tableThRef: string;
    orderingPhysician: string;
    accreditedLab: string;
    legendVerified: string;
    legendReview: string;
    legendHint: string;
    extractionHeaderSuffix: string;
    sledaiImpactTitle: string;
    filterAll: (count: number) => string;
    filterReview: (count: number) => string;
    filterAbnormal: (count: number) => string;
    addRowBtn: string;
    verifyAllBtn: (count: number) => string;
    tblHeaderBiomarker: string;
    tblHeaderValue: string;
    tblHeaderUnitRef: string;
    tblHeaderFlag: string;
    tblHeaderHitl: string;
    groundedFieldPrefix: string;
    categoryPrefix: string;
    clinicalNotePrefix: string;
    statusNeedsReview: (count: number) => string;
    statusAllVerified: (count: number) => string;
    exportJsonBtn: string;
    saveRegistryBtn: string;
    committedSectionTitle: (count: number) => string;
    committedSectionDesc: string;
    noRecordsCommitted: string;
    recordSavedAt: (time: string) => string;
    recordSignedBy: (doctor: string, count: number) => string;
    jsonModalTitle: string;
    jsonModalDesc: (patient: string, id: string, report: string) => string;
    jsonModalDownloadBtn: string;
    defaultAddedName: string;
    defaultAddedNote: string;
  };
  toasts: {
    signedIn: (name: string) => string;
    activeMode: (title: string) => string;
    signedOutTitle: string;
    signedOutDesc: string;
    savedRegistryTitle: (id: string) => string;
    savedRegistryDesc: (count: number, sledai: string) => string;
    autofillTitle: string;
    autofillDesc: (name: string) => string;
    emailRequiredTitle: string;
    emailRequiredDesc: string;
    consentRequiredTitle: string;
    consentRequiredDesc: string;
    ocrScanCompleteTitle: string;
    ocrScanCompleteDesc: (count: number, source: string) => string;
    reportResetTitle: string;
    reportResetDesc: (reportTitle: string) => string;
    scanUploadTitle: (filename: string) => string;
    scanUploadDesc: string;
    verifiedFieldTitle: (code: string) => string;
    verifiedFieldDesc: (val: string, unit: string) => string;
    verifiedAllTitle: string;
    verifiedAllDesc: (count: number) => string;
    allAlreadyVerifiedDesc: string;
    addedRowTitle: string;
    addedRowDesc: string;
    unverifiedWarningTitle: (count: number) => string;
    unverifiedWarningDesc: (codes: string) => string;
    downloadJsonTitle: string;
    downloadJsonDesc: (filename: string) => string;
    langSwitchedTitle: string;
    langSwitchedDesc: string;
  };
}

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    common: {
      brandSubtitle: "Vinmec SLE Registry & HITL Lab OCR",
      allMockDataNotice: "All mock data is defined in",
      gotIt: "Got It",
      close: "Close",
      closeEsc: "Close (Esc)",
      verified: "Verified",
      needsReview: "Needs Review",
      abnormal: "Abnormal",
      normal: "Normal",
      high: "High",
      low: "Low",
      positive: "Positive",
      languageToggleTitle: "Switch Language / Chuyển Đổi Ngôn Ngữ",
      activeModeSpecialist: "Specialist Reviewer Mode",
      activeModePatient: "Patient Companion Mode",
      signOut: "Sign Out",
      signIn: "Sign In",
      guestMode: "Public Evaluator Mode",
    },
    navbar: {
      overviewWorkflow: "Overview & Workflow",
      roleLogin: "Role Login",
      ocrWorkspace: "Document OCR Workspace",
      uiButtonMap: "UI Button Map",
      inspectButtonsTitle: "Inspect what every button in the prototype does",
      modalTitle: "Interactive UI Button & Mock Action Map",
      modalDescription:
        "Reference specification mapping every button across Landing, Login, and OCR Workspace to its mock data behavior.",
      modalThPage: "Page / View",
      modalThButton: "Button / Control",
      modalThAction: "Mock Data Action",
      modalThOutcome: "Expected UI Outcome",
    },
    landing: {
      challengeTag: "VINMEC INNOVATION CHALLENGE 2026",
      specialtyTag: "Clinical Immunology & Allergy",
      heroTitle:
        "Standardized Lupus Lab OCR & Physician-Verified e-CRF Registry",
      heroDescription:
        "Lupiva transforms paper and PDF immunology lab reports into structured Systemic Lupus Erythematosus (SLE) registry records. Powered by side-by-side optical character recognition, bounding-box grounding, and mandatory Physician-in-the-Loop (HITL) verification.",
      launchOcrBtn: "Launch Document OCR Workspace",
      switchRoleBtn: (role) =>
        `Switch Role (${role === "specialist" ? "Specialist" : "Patient"})`,
      loginBtn: "Specialist / Patient Login",
      viewButtonMapBtn: (count) => `View Interactive Button Map (${count})`,
      metricPanelsTitle: "SLE Lab Panels Mapped",
      metricPanelsVal: "3 Core e-CRFs",
      metricPanelsSub: "Serology, Renal, Hematology",
      metricConfidenceTitle: "HITL Confidence Gate",
      metricConfidenceVal: "≥ 85% Auto",
      metricConfidenceSub: "Flagged review below threshold",
      metricCommitsTitle: "Session e-CRF Commits",
      metricCommitsVal: (count) => `${count} Saved`,
      metricCommitsSub: "Ready for FHIR / JSON export",
      previewBadge: "PREVIEW: SLE SEROLOGY e-CRF EXTRACTION",
      previewNeedsReview: (count) => `${count} Fields Need Review`,
      previewOpenOcrBtn: "Open Full Split-Screen Review & Verify C3/C4",
      workflowSectionTitle:
        "How the Physician-in-the-Loop (HITL) OCR Workflow Operates",
      workflowSectionSub:
        "Designed around medical Document AI safety standards: source grounding, confidence triage, and explicit specialist sign-off.",
      workflowJumpLink: "Jump straight to OCR Workspace →",
      step1Tag: "STEP 01",
      step1Category: "Document Capture",
      step1Title: "Select or Upload SLE Lab Report",
      step1Desc:
        "Patients or clinical coordinators upload a hospital lab sheet (Serology, 24h Urinalysis, or CBC) or choose from 3 pre-loaded Vinmec SLE sample panels.",
      step2Tag: "STEP 02",
      step2Category: "Side-by-Side Grounding",
      step2Title: "Inspect Bounding Boxes & Flagged Reads",
      step2Desc:
        "Clicking any biomarker row highlights its exact bounding box on the original lab report. Values below 85% confidence are flagged in amber for human verification.",
      step3Tag: "STEP 03",
      step3Category: "Standardized e-CRF",
      step3Title: "Approve & Commit to SLE Registry",
      step3Desc:
        "Once verified, the structured panel is saved to the patient's longitudinal e-CRF profile with automated SLEDAI-2K biomarker scoring and JSON export.",
      mockSectionTitle: "Interactive Mock Lab Reports Ready for Testing",
      mockSectionSub:
        "Click any report card below to load its scanned document and mock biomarker dataset directly into the OCR Workspace.",
      sampleBadge: (index) => `SAMPLE #${index}`,
      abnormalBadge: (count) => `${count} Abnormal Flags`,
      needsReviewBadge: (count) => `${count} Low-Confidence OCR Reads`,
      inspectCardBtn: "Inspect in OCR Workspace",
    },
    login: {
      roleAccessTag: "Role-Based Clinical Access",
      title: "Sign in to Lupiva Platform",
      autofillBtn: "Autofill Demo Credentials",
      subtitle:
        "Select a persona below to test the workflow as either a Vinmec Clinical Immunology Specialist (HITL verifier) or an SLE Cohort Patient.",
      specialistTabTitle: "Clinical Specialist",
      specialistTabBadge: "HITL Doctor",
      specialistTabDesc: "Verify OCR labs & commit e-CRF",
      patientTabTitle: "SLE Patient Portal",
      patientTabBadge: "Companion",
      patientTabDesc: "Upload lab scans & earn vouchers",
      emailLabel: "Institutional or Patient Email",
      passwordLabel: "Demo Passkey / PIN",
      passwordHint: "Pre-populated for evaluation",
      specialistConsent:
        "I confirm Physician-in-the-Loop (HITL) supervision responsibility: all flagged OCR biomarkers (<85% confidence) will be reviewed against the source scan before e-CRF commit.",
      patientConsent:
        "I consent to contribute de-identified SLE lab values to the Vinmec Clinical Immunology Registry in exchange for specialist consultation voucher incentives.",
      submitBtn: (name) => `Sign In as ${name} & Open OCR →`,
      skipBtn: "Continue to OCR Without Changing Session",
      selectedProfileTitle: "Selected Mock Profile",
      roleAffiliation: "Role & Affiliation",
      deptCohort: "Department / Cohort ID",
      whatUnlocks: "What This Role Unlocks in OCR",
      activeSessionTitle: "Currently Active Session",
      loggedInAs: (name) => `Logged in as ${name}. Signing in above will switch the active session to the selected role.`,
      guestNotice: "No user currently signed in (Guest Evaluator mode).",
    },
    ocr: {
      sampleScanLabel: "Sample Lab Scan:",
      uploadBtn: "Upload Lab Image / PDF",
      runScanBtn: "Run AI OCR Scan",
      scanningBtn: "Scanning Document...",
      resetBtn: "Reset Mock State",
      resetTitle: "Reset current report back to initial unverified mock state",
      sourceScanHeader: "Source Lab Scan",
      uploadedLabel: (name) => `Uploaded: ${name}`,
      boxesOn: "Boxes: ON",
      boxesOff: "Boxes: OFF",
      uploadedScanTitle: "Custom Uploaded Scan:",
      returnToMock: "Return to Mock Sheet",
      patientLabel: "PATIENT:",
      idLabel: "ID:",
      specimenLabel: "SPECIMEN:",
      tableThBiomarker: "Assay / Biomarker",
      tableThResult: "Result",
      tableThFlag: "Flag",
      tableThRef: "Ref. Range",
      orderingPhysician: "Ordering:",
      accreditedLab: "ISO 15189 Accredited Clinical Lab",
      legendVerified: "Verified (≥85%)",
      legendReview: "Needs Human Review (<85%)",
      legendHint: "Click any box to sync with table →",
      extractionHeaderSuffix: "— e-CRF Extraction",
      sledaiImpactTitle: "Estimated SLEDAI-2K Impact",
      filterAll: (count) => `All Fields (${count})`,
      filterReview: (count) => `Needs Review (${count})`,
      filterAbnormal: (count) => `Abnormal (${count})`,
      addRowBtn: "+ Add Biomarker Row",
      verifyAllBtn: (count) => `✓ Verify All Flagged (${count})`,
      tblHeaderBiomarker: "Biomarker / Assay",
      tblHeaderValue: "Extracted Value",
      tblHeaderUnitRef: "Unit & Ref",
      tblHeaderFlag: "Flag",
      tblHeaderHitl: "HITL Verification",
      groundedFieldPrefix: "GROUNDED FIELD:",
      categoryPrefix: "Category:",
      clinicalNotePrefix: "Clinical & OCR Note:",
      statusNeedsReview: (count) =>
        `⚠ ${count} field(s) flagged below 85% OCR confidence require verification before commit.`,
      statusAllVerified: (count) =>
        `✓ All ${count} biomarkers verified and ready for SLE e-CRF database commit.`,
      exportJsonBtn: "Preview / Export e-CRF JSON",
      saveRegistryBtn: "Save to SLE Registry (e-CRF) →",
      committedSectionTitle: (count) =>
        `Committed SLE e-CRF Registry Records (Current Session: ${count})`,
      committedSectionDesc:
        "Records saved via \"Save to SLE Registry (e-CRF)\" appear here with specialist attribution and SLEDAI-2K impact.",
      noRecordsCommitted:
        "No e-CRF records committed in this session yet. Verify the amber flagged rows above and click Save to SLE Registry (e-CRF) to test the submission flow.",
      recordSavedAt: (time) => `Saved at ${time}`,
      recordSignedBy: (doctor, count) =>
        `Signed off by: ${doctor} (${count} biomarkers)`,
      jsonModalTitle: "Standardized SLE e-CRF JSON Payload",
      jsonModalDesc: (patient, id, report) =>
        `Structured output for ${patient} (${id}) • ${report}`,
      jsonModalDownloadBtn: "Download .json File",
      defaultAddedName: "Anti-Smith (Anti-Sm) IgG",
      defaultAddedNote: "Manually added by reviewer during HITL inspection.",
    },
    toasts: {
      signedIn: (name) => `Signed in as ${name}`,
      activeMode: (title) => `Active mode: ${title}`,
      signedOutTitle: "Signed out of Lupiva session",
      signedOutDesc: "You are now browsing in public evaluator mode.",
      savedRegistryTitle: (id) => `Saved ${id} to SLE e-CRF Registry`,
      savedRegistryDesc: (count, sledai) =>
        `${count} biomarkers committed (${sledai}).`,
      autofillTitle: "Demo Credentials Autofilled",
      autofillDesc: (name) => `Loaded mock profile for ${name}.`,
      emailRequiredTitle: "Email Required",
      emailRequiredDesc:
        "Please enter an email or click Autofill Demo Credentials.",
      consentRequiredTitle: "Informed Consent Required",
      consentRequiredDesc:
        "Patients must acknowledge e-CRF registry data de-identification consent.",
      ocrScanCompleteTitle: "AI OCR Extraction Complete",
      ocrScanCompleteDesc: (count, source) =>
        `Extracted ${count} biomarkers from ${source}.`,
      reportResetTitle: "Report Reset to Default Mock Data",
      reportResetDesc: (reportTitle) =>
        `Restored original OCR extraction state for ${reportTitle}.`,
      scanUploadTitle: (filename) => `Scanned Uploaded Document: ${filename}`,
      scanUploadDesc:
        "Mapped detected values to SLE e-CRF template. Please review highlighted fields.",
      verifiedFieldTitle: (code) => `Verified ${code}`,
      verifiedFieldDesc: (val, unit) =>
        `Confirmed value "${val} ${unit}" against source lab report.`,
      verifiedAllTitle: "All Flagged Biomarkers Verified",
      verifiedAllDesc: (count) =>
        `Approved ${count} low-confidence OCR field(s) for e-CRF submission.`,
      allAlreadyVerifiedDesc:
        "All biomarkers in this panel are already verified.",
      addedRowTitle: "Added Biomarker Row",
      addedRowDesc: "Appended manual biomarker entry to the e-CRF table.",
      unverifiedWarningTitle: (count) =>
        `${count} Field(s) Still Need Review`,
      unverifiedWarningDesc: (codes) =>
        `Please click "Verify" on amber rows (${codes}) or click "Verify All Flagged" before saving.`,
      downloadJsonTitle: "Downloaded e-CRF JSON",
      downloadJsonDesc: (filename) => `Saved ${filename}`,
      langSwitchedTitle: "Language Switched",
      langSwitchedDesc: "Interface switched to English.",
    },
  },
  vi: {
    common: {
      brandSubtitle: "Hệ thống Đăng ký SLE Vinmec & OCR Xét nghiệm HITL",
      allMockDataNotice: "Toàn bộ dữ liệu mẫu được định nghĩa tại",
      gotIt: "Đã hiểu",
      close: "Đóng",
      closeEsc: "Đóng (Esc)",
      verified: "Đã xác thực",
      needsReview: "Cần kiểm tra",
      abnormal: "Bất thường",
      normal: "Bình thường",
      high: "Cao",
      low: "Thấp",
      positive: "Dương tính",
      languageToggleTitle: "Chuyển Đổi Ngôn Ngữ / Switch Language",
      activeModeSpecialist: "Chế độ Bác sĩ Chuyên khoa",
      activeModePatient: "Chế độ Bệnh nhân Đồng hành",
      signOut: "Đăng xuất",
      signIn: "Đăng nhập",
      guestMode: "Chế độ Đánh giá Khách",
    },
    navbar: {
      overviewWorkflow: "Tổng quan & Quy trình",
      roleLogin: "Đăng nhập Vai trò",
      ocrWorkspace: "Không gian OCR Tài liệu",
      uiButtonMap: "Sơ đồ Nút Giao diện",
      inspectButtonsTitle: "Tra cứu chức năng của từng nút bấm trong mô hình thử nghiệm",
      modalTitle: "Sơ đồ Tương tác Nút Giao diện & Hành vi Dữ liệu Mẫu",
      modalDescription:
        "Tài liệu đối chiếu chức năng của từng nút trên Trang chủ, Đăng nhập và Không gian OCR với trạng thái dữ liệu mô phỏng.",
      modalThPage: "Trang / Chế độ",
      modalThButton: "Nút bấm / Điều khiển",
      modalThAction: "Hành động Dữ liệu Mẫu",
      modalThOutcome: "Kết quả Giao diện Dự kiến",
    },
    landing: {
      challengeTag: "VINMEC INNOVATION CHALLENGE 2026",
      specialtyTag: "Miễn dịch & Dị ứng Lâm sàng",
      heroTitle:
        "Số hóa Xét nghiệm Lupus bằng OCR & Hệ thống Đăng ký e-CRF Xác thực bởi Bác sĩ",
      heroDescription:
        "Lupiva chuẩn hóa các phiếu xét nghiệm miễn dịch dạng giấy hoặc PDF thành hồ sơ đăng ký Lupus ban đỏ hệ thống (SLE) có cấu trúc. Vận hành bởi công nghệ nhận dạng ký tự quang học đối chiếu song song, định vị khung vùng nhận diện và cơ chế bắt buộc Bác sĩ xác nhận (HITL).",
      launchOcrBtn: "Mở Không gian OCR Xét nghiệm",
      switchRoleBtn: (role) =>
        `Đổi Vai trò (${role === "specialist" ? "Bác sĩ" : "Bệnh nhân"})`,
      loginBtn: "Đăng nhập Bác sĩ / Bệnh nhân",
      viewButtonMapBtn: (count) => `Xem Sơ đồ Nút Bấm (${count})`,
      metricPanelsTitle: "Bộ Xét nghiệm SLE Chuẩn hóa",
      metricPanelsVal: "3 Mẫu e-CRF Cốt lõi",
      metricPanelsSub: "Huyết thanh, Thận, Huyết học",
      metricConfidenceTitle: "Ngưỡng Tin cậy HITL",
      metricConfidenceVal: "≥ 85% Tự động",
      metricConfidenceSub: "Cảnh báo kiểm tra thủ công dưới ngưỡng",
      metricCommitsTitle: "Hồ sơ e-CRF Đã lưu Phiên này",
      metricCommitsVal: (count) => `${count} Hồ sơ`,
      metricCommitsSub: "Sẵn sàng trích xuất chuẩn FHIR / JSON",
      previewBadge: "XEM TRƯỚC: TRÍCH XUẤT e-CRF HUYẾT THANH SLE",
      previewNeedsReview: (count) => `${count} Chỉ số Cần Kiểm tra`,
      previewOpenOcrBtn: "Mở Không gian So sánh Song song & Xác thực C3/C4",
      workflowSectionTitle:
        "Quy trình OCR Xét nghiệm có Bác sĩ Tham gia (HITL) Hoạt động Như thế nào?",
      workflowSectionSub:
        "Thiết kế theo chuẩn an toàn Trí tuệ Nhân tạo Tài liệu Y tế: đối chiếu văn bản gốc, phân loại độ tin cậy và ký duyệt chuyên khoa rõ ràng.",
      workflowJumpLink: "Chuyển ngay tới Không gian OCR →",
      step1Tag: "BƯỚC 01",
      step1Category: "Thu thập Tài liệu",
      step1Title: "Chọn hoặc Tải lên Phiếu Xét nghiệm SLE",
      step1Desc:
        "Bệnh nhân hoặc điều phối viên lâm sàng tải lên ảnh chụp phiếu xét nghiệm viện (Huyết thanh, Nước tiểu 24h, hoặc Công thức máu) hoặc chọn từ 3 bộ mẫu SLE Vinmec có sẵn.",
      step2Tag: "BƯỚC 02",
      step2Category: "Đối chiếu Vùng Song song",
      step2Title: "Kiểm tra Khung Nhận diện & Cảnh báo Độ tin cậy",
      step2Desc:
        "Nhấp vào bất kỳ hàng chỉ số nào sẽ làm nổi bật vị trí vùng chữ nhật tương ứng trên bản quét gốc. Giá trị có độ tin cậy < 85% được đánh dấu màu hổ phách để người kiểm tra xác nhận.",
      step3Tag: "BƯỚC 03",
      step3Category: "e-CRF Chuẩn hóa",
      step3Title: "Phê duyệt & Lưu vào Cơ sở Dữ liệu SLE",
      step3Desc:
        "Sau khi xác thực, bảng chỉ số cấu trúc sẽ được lưu vào hồ sơ e-CRF theo dõi dọc của bệnh nhân, đồng thời tự động tính điểm chỉ số SLEDAI-2K và xuất file JSON.",
      mockSectionTitle: "Các Phiếu Xét nghiệm Mẫu Sẵn sàng Trải nghiệm",
      mockSectionSub:
        "Nhấp vào bất kỳ thẻ bệnh án dưới đây để tải tài liệu quét và bộ chỉ số sinh học mô phỏng trực tiếp vào Không gian OCR.",
      sampleBadge: (index) => `MẪU BỆNH ÁN #${index}`,
      abnormalBadge: (count) => `${count} Chỉ số Bất thường`,
      needsReviewBadge: (count) => `${count} Kết quả OCR Cần Kiểm tra`,
      inspectCardBtn: "Xem chi tiết trong Không gian OCR",
    },
    login: {
      roleAccessTag: "Truy cập Lâm sàng Phân quyền",
      title: "Đăng nhập Nền tảng Lupiva",
      autofillBtn: "Tự động Điền Tài khoản Mẫu",
      subtitle:
        "Chọn một hồ sơ mẫu bên dưới để thử nghiệm quy trình với vai trò Bác sĩ Miễn dịch Lâm sàng Vinmec (người duyệt HITL) hoặc Bệnh nhân thuộc Đoàn hệ SLE.",
      specialistTabTitle: "Bác sĩ Chuyên khoa",
      specialistTabBadge: "Bác sĩ Duyệt HITL",
      specialistTabDesc: "Xác thực OCR xét nghiệm & lưu e-CRF",
      patientTabTitle: "Cổng Thông tin Bệnh nhân",
      patientTabBadge: "Đồng hành",
      patientTabDesc: "Tải phiếu xét nghiệm & nhận voucher",
      emailLabel: "Email Bệnh viện hoặc Email Bệnh nhân",
      passwordLabel: "Mã Khóa / PIN Đánh giá Thử nghiệm",
      passwordHint: "Được điền sẵn phục vụ đánh giá",
      specialistConsent:
        "Tôi xác nhận trách nhiệm giám sát Bác sĩ Tham gia (HITL): toàn bộ chỉ số OCR bị cảnh báo (<85% độ tin cậy) sẽ được đối chiếu kỹ lưỡng với bản chụp gốc trước khi lưu vào e-CRF.",
      patientConsent:
        "Tôi đồng ý đóng góp các chỉ số xét nghiệm SLE đã ẩn danh vào Cơ sở Dữ liệu Miễn dịch Lâm sàng Vinmec để đổi lấy phiếu ưu đãi khám chuyên khoa.",
      submitBtn: (name) => `Đăng nhập vai trò ${name} & Mở OCR →`,
      skipBtn: "Tiếp tục vào OCR mà không đổi phiên đăng nhập",
      selectedProfileTitle: "Hồ sơ Mẫu Được Chọn",
      roleAffiliation: "Vai trò & Đơn vị",
      deptCohort: "Khoa / Mã Đoàn hệ Đăng ký",
      whatUnlocks: "Quyền hạn của Vai trò trong Không gian OCR",
      activeSessionTitle: "Phiên Làm việc Hiện tại",
      loggedInAs: (name) => `Đang đăng nhập với tên ${name}. Đăng nhập ở trên sẽ chuyển đổi phiên sang vai trò tương ứng.`,
      guestNotice: "Chưa có người dùng đăng nhập (Chế độ Người Đánh giá Khách).",
    },
    ocr: {
      sampleScanLabel: "Chọn Bản quét Mẫu:",
      uploadBtn: "Tải Ảnh / PDF Xét nghiệm",
      runScanBtn: "Chạy Quét AI OCR",
      scanningBtn: "Đang Quét Tài liệu...",
      resetBtn: "Khôi phục Dữ liệu Gốc",
      resetTitle: "Đặt lại phiếu xét nghiệm về trạng thái mẫu ban đầu chưa xác thực",
      sourceScanHeader: "Bản Quét Xét nghiệm Gốc",
      uploadedLabel: (name) => `Đã tải lên: ${name}`,
      boxesOn: "Khung: BẬT",
      boxesOff: "Khung: TẮT",
      uploadedScanTitle: "Bản quét tải lên tùy chỉnh:",
      returnToMock: "Quay lại Bản Xét nghiệm Mẫu",
      patientLabel: "BỆNH NHÂN:",
      idLabel: "MÃ BN:",
      specimenLabel: "MẪU PHẨM:",
      tableThBiomarker: "Chỉ số / Xét nghiệm",
      tableThResult: "Kết quả",
      tableThFlag: "Đánh giá",
      tableThRef: "Trị số Tham chiếu",
      orderingPhysician: "Bác sĩ chỉ định:",
      accreditedLab: "Phòng Xét nghiệm Đạt chuẩn ISO 15189",
      legendVerified: "Đã xác thực (≥85%)",
      legendReview: "Cần kiểm tra thủ công (<85%)",
      legendHint: "Nhấp vào khung để đồng bộ sang bảng bên phải →",
      extractionHeaderSuffix: "— Trích xuất e-CRF",
      sledaiImpactTitle: "Dự kiến Tác động Điểm SLEDAI-2K",
      filterAll: (count) => `Tất cả Chỉ số (${count})`,
      filterReview: (count) => `Cần Kiểm tra (${count})`,
      filterAbnormal: (count) => `Bất thường (${count})`,
      addRowBtn: "+ Thêm Hàng Chỉ số",
      verifyAllBtn: (count) => `✓ Xác thực Tất cả (${count})`,
      tblHeaderBiomarker: "Chỉ số / Xét nghiệm",
      tblHeaderValue: "Giá trị Trích xuất",
      tblHeaderUnitRef: "Đơn vị & Tham chiếu",
      tblHeaderFlag: "Đánh giá",
      tblHeaderHitl: "Xác thực HITL",
      groundedFieldPrefix: "VÙNG ĐANG CHỌN:",
      categoryPrefix: "Nhóm:",
      clinicalNotePrefix: "Ghi chú Lâm sàng & OCR:",
      statusNeedsReview: (count) =>
        `⚠ ${count} chỉ số có độ tin cậy OCR < 85% cần được Bác sĩ kiểm tra trước khi lưu vào e-CRF.`,
      statusAllVerified: (count) =>
        `✓ Toàn bộ ${count} chỉ số sinh học đã được xác thực, sẵn sàng lưu vào Cơ sở Dữ liệu e-CRF SLE.`,
      exportJsonBtn: "Xem trước / Xuất e-CRF JSON",
      saveRegistryBtn: "Lưu vào Cơ sở Dữ liệu SLE (e-CRF) →",
      committedSectionTitle: (count) =>
        `Hồ sơ e-CRF SLE Đã Cam kết Lưu (Phiên này: ${count})`,
      committedSectionDesc:
        "Các hồ sơ được lưu bằng nút \"Lưu vào Cơ sở Dữ liệu SLE (e-CRF)\" hiển thị tại đây cùng thông tin Bác sĩ ký duyệt và tác động điểm SLEDAI-2K.",
      noRecordsCommitted:
        "Chưa có hồ sơ e-CRF nào được lưu trong phiên này. Hãy bấm \"Xác thực\" các hàng màu hổ phách phía trên rồi nhấn \"Lưu vào Cơ sở Dữ liệu SLE (e-CRF)\" để thử nghiệm quy trình nộp.",
      recordSavedAt: (time) => `Lưu lúc ${time}`,
      recordSignedBy: (doctor, count) =>
        `Bác sĩ ký duyệt: ${doctor} (${count} chỉ số)`,
      jsonModalTitle: "Cấu trúc e-CRF JSON SLE Tiêu chuẩn",
      jsonModalDesc: (patient, id, report) =>
        `Dữ liệu có cấu trúc cho ${patient} (${id}) • ${report}`,
      jsonModalDownloadBtn: "Tải file .json Về máy",
      defaultAddedName: "Kháng thể Anti-Smith (Anti-Sm) IgG",
      defaultAddedNote: "Được bổ sung thủ công bởi người kiểm duyệt trong quá trình rà soát HITL.",
    },
    toasts: {
      signedIn: (name) => `Đã đăng nhập vai trò ${name}`,
      activeMode: (title) => `Chế độ hoạt động: ${title}`,
      signedOutTitle: "Đã đăng xuất khỏi phiên Lupiva",
      signedOutDesc: "Bạn hiện đang duyệt ở chế độ Người Đánh giá Khách.",
      savedRegistryTitle: (id) => `Đã lưu hồ sơ ${id} vào CSDL e-CRF SLE`,
      savedRegistryDesc: (count, sledai) =>
        `Đã ghi nhận ${count} chỉ số sinh học (${sledai}).`,
      autofillTitle: "Đã Tự động Điền Tài khoản Mẫu",
      autofillDesc: (name) => `Đã nạp hồ sơ mẫu của ${name}.`,
      emailRequiredTitle: "Yêu cầu Nhập Email",
      emailRequiredDesc:
        "Vui lòng nhập địa chỉ email hoặc bấm 'Tự động Điền Tài khoản Mẫu'.",
      consentRequiredTitle: "Yêu cầu Chấp thuận Tham gia",
      consentRequiredDesc:
        "Bệnh nhân cần xác nhận đồng ý đóng góp dữ liệu e-CRF đã ẩn danh.",
      ocrScanCompleteTitle: "Hoàn tất Trích xuất AI OCR",
      ocrScanCompleteDesc: (count, source) =>
        `Đã trích xuất ${count} chỉ số sinh học từ ${source}.`,
      reportResetTitle: "Đã Đặt lại Phiếu Xét nghiệm Về Mẫu Ban đầu",
      reportResetDesc: (reportTitle) =>
        `Khôi phục trạng thái nhận dạng OCR gốc cho ${reportTitle}.`,
      scanUploadTitle: (filename) => `Đã Quét Tài liệu Tải lên: ${filename}`,
      scanUploadDesc:
        "Đã khớp các giá trị nhận diện vào biểu mẫu e-CRF SLE. Vui lòng rà soát các trường được đánh dấu.",
      verifiedFieldTitle: (code) => `Đã xác thực ${code}`,
      verifiedFieldDesc: (val, unit) =>
        `Đã đối chiếu xác nhận giá trị "${val} ${unit}" với phiếu xét nghiệm gốc.`,
      verifiedAllTitle: "Đã Xác thực Toàn bộ Chỉ số Cảnh báo",
      verifiedAllDesc: (count) =>
        `Đã phê duyệt ${count} chỉ số OCR độ tin cậy thấp để nộp hồ sơ e-CRF.`,
      allAlreadyVerifiedDesc:
        "Toàn bộ chỉ số sinh học trong bộ xét nghiệm này đã được xác thực.",
      addedRowTitle: "Đã Thêm Hàng Chỉ số",
      addedRowDesc: "Đã bổ sung mục chỉ số thủ công vào bảng e-CRF.",
      unverifiedWarningTitle: (count) =>
        `Còn ${count} Chỉ số Cần Kiểm tra`,
      unverifiedWarningDesc: (codes) =>
        `Vui lòng nhấp "Xác thực" trên các hàng màu hổ phách (${codes}) hoặc chọn "Xác thực Tất cả" trước khi lưu.`,
      downloadJsonTitle: "Đã Tải file e-CRF JSON",
      downloadJsonDesc: (filename) => `Đã lưu tệp ${filename}`,
      langSwitchedTitle: "Đã Chuyển Ngôn ngữ",
      langSwitchedDesc: "Giao diện đã chuyển sang Tiếng Việt.",
    },
  },
};

export function getLocalizedDemoUsers(lang: Language): Record<UserRole, DemoUser> {
  if (lang === "en") return DEMO_USERS;
  return {
    specialist: {
      ...DEMO_USERS.specialist,
      title: "Bác sĩ Cố vấn Cấp cao — Miễn dịch & Dị ứng Lâm sàng",
      departmentOrRegistryId: "Vinmec Times City • Khoa Miễn dịch Lâm sàng",
      badgeText: "Bác sĩ Duyệt HITL",
    },
    patient: {
      ...DEMO_USERS.patient,
      title: "Người tham gia Đoàn hệ SLE • Mã Đăng ký #VN-SLE-084",
      departmentOrRegistryId: "Đoàn hệ Đăng ký SLE • Tham gia Tháng 10/2026",
      badgeText: "Đủ điều kiện Voucher",
    },
  };
}

export function getLocalizedLabReports(lang: Language): LabReportMock[] {
  if (lang === "en") return MOCK_LAB_REPORTS;
  return [
    {
      ...MOCK_LAB_REPORTS[0],
      shortTitle: "Bệnh án #1: Huyết thanh & Bổ thể SLE",
      title: "Bảng Xét nghiệm Huyết thanh Tự miễn & Bổ thể",
      subtitle: "Bộ Chỉ số Hoạt tính SLE Chuẩn hóa (Mẫu e-CRF A1)",
      facility: "Phòng Xét nghiệm Trung tâm Vinmec — Đơn nguyên Miễn dịch Lâm sàng",
      department: "Phòng khám Ngoại trú Khớp & Bệnh Tự miễn",
      specimenType: "Huyết thanh Tĩnh mạch (Ống SST)",
      orderingPhysician: "TS. BS. Nguyễn Minh",
      clinicalSummary:
        "Nồng độ Anti-dsDNA tăng cao kèm giảm bổ thể (C3 và C4 thấp), phù hợp với đợt bùng phát SLE hoạt tính trên huyết thanh học.",
      sledaiImpact: "+4 điểm (Tăng gắn kết DNA +2, Giảm bổ thể +2)",
      fields: MOCK_LAB_REPORTS[0].fields.map((f) => {
        if (f.id === "fld-ana") {
          return {
            ...f,
            name: "Kháng thể Kháng nhân ANA (Miễn dịch huỳnh quang Hep-2)",
            category: "Tự kháng thể",
            referenceRange: "< 1:80 Âm tính",
            clinicalNote: "Đạt tiêu chuẩn đầu vào theo phân loại SLE EULAR/ACR.",
          };
        }
        if (f.id === "fld-dsdna") {
          return {
            ...f,
            name: "Kháng thể Anti-dsDNA IgG (Kỹ thuật ELISA)",
            category: "Tự kháng thể",
            referenceRange: "< 30.0 IU/mL",
            clinicalNote: "Gấp 4.7 lần giới hạn trên bình thường; tương quan với hoạt tính viêm thận lupus.",
          };
        }
        if (f.id === "fld-c3") {
          return {
            ...f,
            name: "Bổ thể C3 (Đo độ đục Turbidimetry)",
            category: "Bổ thể",
            referenceRange: "0.90 – 1.80 g/L",
            clinicalNote: "Độ tin cậy OCR thấp do dấu thập phân in mờ trên bản quét nhiệt — cần kiểm tra '0.58'.",
          };
        }
        if (f.id === "fld-c4") {
          return {
            ...f,
            name: "Bổ thể C4 (Đo độ đục Turbidimetry)",
            category: "Bổ thể",
            referenceRange: "0.10 – 0.40 g/L",
            clinicalNote: "Tiêu thụ bổ thể C4 mức ranh giới; cảnh báo <85% ngưỡng OCR để con người xác nhận.",
          };
        }
        if (f.id === "fld-esr") {
          return {
            ...f,
            name: "Tốc độ Máu lắng (ESR 1 giờ)",
            category: "Viêm",
            referenceRange: "0 – 20 mm/giờ",
            clinicalNote: "Chỉ điểm phản ứng pha cấp tính hệ thống tăng cao.",
          };
        }
        if (f.id === "fld-crp") {
          return {
            ...f,
            name: "Protein Phản ứng C Siêu nhạy (hs-CRP)",
            category: "Viêm",
            referenceRange: "< 5.0 mg/L",
            clinicalNote: "CRP bình thường kết hợp ESR tăng là dấu hiệu kinh điển của đợt bùng phát SLE không nhiễm trùng.",
          };
        }
        return f;
      }),
    },
    {
      ...MOCK_LAB_REPORTS[1],
      shortTitle: "Bệnh án #2: Viêm thận Lupus & Chức năng Thận",
      title: "Bảng Chức năng Thận & Tổng phân tích Nước tiểu 24h",
      subtitle: "Giám sát Viêm thận Lupus (Mẫu e-CRF B2)",
      facility: "Phòng Xét nghiệm Trung tâm Vinmec — Đơn nguyên Thận học & Nước tiểu",
      department: "Phòng khám Đa chuyên khoa Viêm thận Lupus",
      specimenType: "Nước tiểu 24h + Huyết thanh Lúc đói",
      orderingPhysician: "TS. BS. Nguyễn Minh",
      clinicalSummary:
        "Xuất hiện protein niệu mới > 0.5 g/24h kèm cặn lắng nước tiểu hoạt tính; cần hội chẩn chuyên khoa thận phối hợp điều trị.",
      sledaiImpact: "+8 điểm (Protein niệu +4, Tiểu máu / Trụ niệu +4)",
      fields: MOCK_LAB_REPORTS[1].fields.map((f) => {
        if (f.id === "fld-up24") {
          return {
            ...f,
            name: "Protein Niệu 24 Giờ",
            category: "Xét nghiệm Nước tiểu",
            referenceRange: "< 0.15 g/24h",
            clinicalNote: "Vượt ngưỡng protein niệu 0.5 g/24h theo thang điểm SLEDAI-2K.",
          };
        }
        if (f.id === "fld-upcr") {
          return {
            ...f,
            name: "Tỷ lệ Protein/Creatinine Niệu (UPCR)",
            category: "Xét nghiệm Nước tiểu",
            referenceRange: "< 15 mg/mmol",
            clinicalNote: "Có chữ viết tay cạnh kết quả — vui lòng xác nhận số liệu '148'.",
          };
        }
        if (f.id === "fld-screat") {
          return {
            ...f,
            name: "Creatinine Huyết thanh (Enzymatic)",
            category: "Hóa sinh Thận",
            referenceRange: "45.0 – 84.0 µmol/L",
            clinicalNote: "Tăng nhẹ so với mức nền (mức nền 68 µmol/L).",
          };
        }
        if (f.id === "fld-egfr") {
          return {
            ...f,
            name: "Độ Lọc Cầu Thận Ước tính eGFR (CKD-EPI 2021)",
            category: "Hóa sinh Thận",
            referenceRange: "> 90 mL/phút/1.73m²",
            clinicalNote: "Giai đoạn bệnh thận mạn G2; cần theo dõi sát khi điều chỉnh thuốc ức chế miễn dịch.",
          };
        }
        if (f.id === "fld-rbc-urine") {
          return {
            ...f,
            name: "Hồng cầu Biến dạng trong Nước tiểu (Soi kính)",
            category: "Cặn lắng Nước tiểu",
            referenceRange: "0 – 4 tế bào/vi trường",
            clinicalNote: "Dấu hiệu tiểu máu nguồn gốc cầu thận; cảnh báo để Bác sĩ xác nhận.",
          };
        }
        return f;
      }),
    },
    {
      ...MOCK_LAB_REPORTS[2],
      shortTitle: "Bệnh án #3: Huyết học & Giảm Dòng Tế bào",
      title: "Tổng phân tích Tế bào Máu Ngoại vi (CBC) & Nghiệm pháp Coombs",
      subtitle: "Biểu hiện Huyết học trong SLE (Mẫu e-CRF C1)",
      facility: "Phòng Xét nghiệm Trung tâm Vinmec — Huyết học Tự động",
      department: "Phòng khám Ngoại trú Khớp & Bệnh Tự miễn",
      specimenType: "Máu Toàn phần Kháng đông EDTA",
      orderingPhysician: "TS. BS. Nguyễn Minh",
      clinicalSummary:
        "Giảm nhẹ bạch cầu và bạch cầu lympho điển hình trong SLE hoạt động; số lượng tiểu cầu vẫn được duy trì trên 100 G/L.",
      sledaiImpact: "+1 điểm (Bạch cầu < 3.0 G/L)",
      fields: MOCK_LAB_REPORTS[2].fields.map((f) => {
        if (f.id === "fld-wbc") {
          return {
            ...f,
            name: "Số lượng Bạch cầu (WBC Tổng số)",
            category: "Huyết học",
            referenceRange: "4.00 – 10.00 G/L",
            clinicalNote: "Bạch cầu giảm < 3.0 G/L không do độc tính của thuốc.",
          };
        }
        if (f.id === "fld-lymph") {
          return {
            ...f,
            name: "Số lượng Tế bào Lympho Tuyệt đối",
            category: "Huyết học",
            referenceRange: "1.00 – 4.00 G/L",
            clinicalNote: "Giảm lympho rõ rệt; cảnh báo (<85% độ tin cậy) để xác thực thủ công.",
          };
        }
        if (f.id === "fld-hgb") {
          return {
            ...f,
            name: "Huyết sắc tố (Hemoglobin - Hb)",
            category: "Huyết học",
            referenceRange: "120 – 155 g/L",
            clinicalNote: "Thiếu máu đẳng sắc nhẹ do phản ứng viêm mạn tính.",
          };
        }
        if (f.id === "fld-plt") {
          return {
            ...f,
            name: "Số lượng Tiểu cầu (PLT)",
            category: "Huyết học",
            referenceRange: "150 – 400 G/L",
            clinicalNote: "Trong giới hạn tham chiếu bình thường.",
          };
        }
        if (f.id === "fld-coombs") {
          return {
            ...f,
            name: "Nghiệm pháp Coombs Trực tiếp (Direct Coombs)",
            category: "Miễn dịch Huyết học",
            referenceRange: "Âm tính",
            clinicalNote: "Tầm soát tan máu tự miễn dương tính nhưng chưa có tan máu ồ ạt trên lâm sàng.",
          };
        }
        return f;
      }),
    },
  ];
}

export function getLocalizedButtonActionMap(lang: Language): ButtonMappingItem[] {
  if (lang === "en") return BUTTON_ACTION_MAP;
  return [
    {
      page: "Global Navbar",
      buttonLabel: "EN | VI (Chuyển Đổi Ngôn Ngữ)",
      elementId: "nav-btn-language-toggle",
      mockAction: "Chuyển đổi toàn bộ giao diện và dữ liệu mẫu giữa Tiếng Anh và Tiếng Việt tức thì.",
      expectedOutcome: "Cập nhật thanh điều hướng, các trang và bảng xét nghiệm sang ngôn ngữ đã chọn.",
    },
    {
      page: "Global Navbar",
      buttonLabel: "Sơ đồ Nút Giao diện",
      elementId: "nav-btn-action-guide",
      mockAction: "Mở bảng tra cứu tương tác về nút bấm và dữ liệu mô phỏng từ bất kỳ trang nào.",
      expectedOutcome: "Hiển thị đầy đủ bảng danh sách tất cả các nút và trạng thái chuyển đổi tương ứng.",
    },
    {
      page: "Global Navbar",
      buttonLabel: "Đăng nhập / Đăng xuất",
      elementId: "nav-btn-auth",
      mockAction: "Chuyển tới trang /login hoặc xóa phiên đăng nhập của DemoUser hiện tại.",
      expectedOutcome: "Cập nhật huy hiệu vai trò ở góc phải phía trên và hiển thị thông báo trạng thái.",
    },
    {
      page: "Landing Page (/)",
      buttonLabel: "Mở Không gian OCR Xét nghiệm",
      elementId: "hero-btn-launch-ocr",
      mockAction: "Chuyển thẳng tới trang /ocr với Bệnh án #1 (Bộ Huyết thanh SLE) được nạp sẵn.",
      expectedOutcome: "Mở ngay lập tức không gian làm việc OCR lâm sàng chia đôi màn hình.",
    },
    {
      page: "Landing Page (/)",
      buttonLabel: "Đăng nhập Bác sĩ / Bệnh nhân",
      elementId: "hero-btn-login",
      mockAction: "Điều hướng đến màn hình xác thực /login.",
      expectedOutcome: "Cho phép chuyển đổi giữa tài khoản demo Bác sĩ Vinmec và Bệnh nhân SLE.",
    },
    {
      page: "Landing Page (/)",
      buttonLabel: "Xem chi tiết trong Không gian OCR (#1 / #2 / #3)",
      elementId: "sample-card-btn-*",
      mockAction: "Gán selectedReportId trong LupivaContext và điều hướng tới /ocr.",
      expectedOutcome: "Tải trước bộ xét nghiệm SLE được chọn (Huyết thanh, Thận, hoặc Huyết học) vào khung xem OCR.",
    },
    {
      page: "Login Page (/login)",
      buttonLabel: "Thẻ vai trò: Bác sĩ Vinmec / Bệnh nhân SLE",
      elementId: "login-tab-specialist / login-tab-patient",
      mockAction: "Chuyển đổi nhân vật đăng nhập và cập nhật thẻ thông tin xem trước.",
      expectedOutcome: "Chuyển đổi giữa TS. BS. Nguyễn Minh (Bác sĩ HITL) và Trần Thị Mai (Bệnh nhân).",
    },
    {
      page: "Login Page (/login)",
      buttonLabel: "Tự động Điền Tài khoản Mẫu",
      elementId: "login-btn-autofill",
      mockAction: "Điền tự động email, mật khẩu và đánh dấu ô đồng ý đóng góp e-CRF.",
      expectedOutcome: "Thiết lập đăng nhập nhanh không cần gõ phím phục vụ đánh giá.",
    },
    {
      page: "Login Page (/login)",
      buttonLabel: "Đăng nhập & Mở Không gian OCR",
      elementId: "login-btn-submit",
      mockAction: "Xác thực DemoUser đã chọn trong LupivaContext và chuyển hướng tới /ocr.",
      expectedOutcome: "Thanh tiêu đề hiển thị huy hiệu người dùng và mở quyền ký duyệt e-CRF.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Chọn Bản quét Mẫu (#1, #2, #3)",
      elementId: "ocr-btn-report-*",
      mockAction: "Tải bản quét lâm sàng mẫu tương ứng cùng các hàng chỉ số sinh học.",
      expectedOutcome: "Cập nhật đồng thời bản quét bên trái và bảng trích xuất e-CRF bên phải.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Tải Ảnh / PDF Xét nghiệm",
      elementId: "ocr-btn-upload",
      mockAction: "Mở hộp thoại chọn tệp; hiển thị hình ảnh tải lên với trích xuất SLE mô phỏng.",
      expectedOutcome: "Cho phép người dùng thử tải tệp riêng và ánh xạ vào các trường e-CRF có cấu trúc.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Chạy Quét AI OCR",
      elementId: "ocr-btn-run-scan",
      mockAction: "Chạy hoạt ảnh tia laser 1.1s quét tài liệu và làm mới chỉ số trích xuất.",
      expectedOutcome: "Làm nổi bật các khung vùng trên bản quét và điền điểm tin cậy OCR.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Nhấp Khung Vùng / Hàng Chỉ số",
      elementId: "ocr-bbox-* / ocr-row-*",
      mockAction: "Liên kết hai chiều giữa một vùng trên bản quét với hàng tương ứng trong bảng e-CRF.",
      expectedOutcome: "Làm nổi bật chỉ số ở cả hai bên và hiển thị ghi chú lâm sàng SLEDAI.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Xác thực Hàng / Chỉnh sửa Giá trị Trực tiếp",
      elementId: "ocr-btn-verify-*",
      mockAction: "Phê duyệt giá trị OCR bị cảnh báo (<85% tin cậy) hoặc sửa lại số liệu/đơn vị.",
      expectedOutcome: "Chuyển huy hiệu từ màu hổ phách 'Cần kiểm tra' sang màu xanh mòng két 'Đã xác thực (100%)'.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Xác thực Tất cả Hàng Cảnh báo",
      elementId: "ocr-btn-verify-all",
      mockAction: "Phê duyệt hàng loạt tất cả các hàng có độ tin cậy thấp còn lại trong báo cáo.",
      expectedOutcome: "Xóa toàn bộ cảnh báo màu hổ phách để báo cáo sẵn sàng được cam kết lưu e-CRF.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Thêm Hàng Chỉ số",
      elementId: "ocr-btn-add-row",
      mockAction: "Thêm một hàng chỉ số sinh học có thể chỉnh sửa mới vào bảng e-CRF.",
      expectedOutcome: "Cho phép nhập thủ công thêm bất kỳ chỉ số nào từ phiếu xét nghiệm giấy.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Xem trước / Xuất e-CRF JSON",
      elementId: "ocr-btn-export-json",
      mockAction: "Tạo dữ liệu JSON e-CRF SLE chuẩn hóa và mở cửa sổ xem trước/tải về.",
      expectedOutcome: "Hiển thị chuỗi JSON chuẩn FHIR/e-CRF sẵn sàng nạp vào cơ sở dữ liệu y tế.",
    },
    {
      page: "OCR Workspace (/ocr)",
      buttonLabel: "Lưu vào Cơ sở Dữ liệu SLE (e-CRF)",
      elementId: "ocr-btn-save-registry",
      mockAction: "Kiểm tra toàn bộ hàng đã được xác thực và thêm bản ghi vào savedRecords.",
      expectedOutcome: "Tăng bộ đếm Đăng ký, hiển thị tóm tắt tác động SLEDAI và ghi nhận thời gian lưu.",
    },
  ];
}
