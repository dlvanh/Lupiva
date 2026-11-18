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
    brandName: string;
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
    crfManager: string;
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
    programTag: string;
    heroTitle: string;
    heroDescription: string;
    patientCta: string;
    doctorCta: string;
    navBackground: string;
    navHowItWorks: string;
    navBenefits: string;
    navRegistration: string;
    backgroundKicker: string;
    backgroundTitle: string;
    backgroundLead: string;
    backgroundCards: Array<{ title: string; body: string }>;
    howItWorksKicker: string;
    howItWorksTitle: string;
    howItWorksSubtitle: string;
    howItWorksSteps: Array<{ stepLabel: string; title: string; desc: string }>;
    benefitsKicker: string;
    benefitsTitle: string;
    benefitsSubtitle: string;
    benefitsItems: Array<{ title: string; desc: string }>;
    registrationKicker: string;
    registrationTitle: string;
    registrationSubtitle: string;
    regStep1Title: string;
    regStep1Rule: string;
    regStep1Desc: string;
    regStep2Title: string;
    regStep2Desc: string;
    regStepAction: string;
  };
  login: {
    roleAccessTag: string;
    title: string;
    registerTitle: string;
    autofillBtn: string;
    subtitle: string;
    registerSubtitle: string;
    modeSignInTab: string;
    modeRegisterTab: string;
    specialistTabTitle: string;
    specialistTabBadge: string;
    specialistTabDesc: string;
    patientTabTitle: string;
    patientTabBadge: string;
    patientTabDesc: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    emailLabel: string;
    passwordLabel: string;
    passwordHint: string;
    passwordHintProduction: string;
    passwordHintRegister: string;
    inviteCodeLabel: string;
    inviteCodePlaceholder: string;
    inviteCodeHint: string;
    specialistConsent: string;
    patientConsent: string;
    submitBtn: (name: string) => string;
    submitRegisterBtn: (roleLabel: string) => string;
    signingInBtn: string;
    creatingAccountBtn: string;
    skipBtn: string;
    selectedProfileTitle: string;
    registerProfileTitle: string;
    roleAffiliation: string;
    deptCohort: string;
    whatUnlocks: string;
    activeSessionTitle: string;
    loggedInAs: (name: string) => string;
    guestNotice: string;
    securityVaultTitle: string;
    securityVaultDesc: string;
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
    accountCreatedTitle: (name: string) => string;
    activeMode: (title: string) => string;
    authFailedTitle: string;
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
      brandName:
        "Center of Clinical Immunology & Allergy — Vinmec Times City International Hospital",
      brandSubtitle: "Vinmec SLE Clinical Registry",
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
      crfManager: "SLE Case Report Form (CRF)",
      uiButtonMap: "UI Button Map",
      inspectButtonsTitle: "Inspect what every button in the prototype does",
      modalTitle: "Interactive UI Button & Mock Action Map",
      modalDescription:
        "Reference specification mapping every button across Landing, Login, OCR Workspace, and SLE e-CRF Manager to its mock data behavior.",
      modalThPage: "Page / View",
      modalThButton: "Button / Control",
      modalThAction: "Mock Data Action",
      modalThOutcome: "Expected UI Outcome",
    },
    landing: {
      programTag: "Systemic Lupus Erythematosus (SLE) Clinical Registry",
      heroTitle:
        "Center of Clinical Immunology & Allergy — Vinmec Times City International Hospital",
      heroDescription:
        "The official Systemic Lupus Erythematosus (SLE) Clinical Registry portal. Our platform enables patients to maintain centralized laboratory records, supports longitudinal disease monitoring, and connects patients directly with Vinmec Clinical Immunology & Allergy specialists.",
      patientCta: "For Patients",
      doctorCta: "For Physicians",
      navBackground: "Background",
      navHowItWorks: "How the Registry Works",
      navBenefits: "Patient Benefits",
      navRegistration: "How to Register",
      backgroundKicker: "Overview & Purpose",
      backgroundTitle: "Background",
      backgroundLead:
        "Systemic Lupus Erythematosus (SLE) is a complex, chronic autoimmune disease affecting multiple organs that requires ongoing monitoring through immunological, hematological, and renal biomarkers.",
      backgroundCards: [
        {
          title: "Challenges with Fragmented Medical Records",
          body: "During long-term management, patients frequently visit multiple clinics and hold scattered paper laboratory reports, making longitudinal comparison across treatment milestones difficult for both patients and doctors.",
        },
        {
          title: "Standardized Registry at Vinmec Times City",
          body: "The Center of Clinical Immunology & Allergy — Vinmec Times City International Hospital established this registry to structure clinical histories according to international medical standards, enhancing care continuity and clinical research.",
        },
      ],
      howItWorksKicker: "Clinical Workflow",
      howItWorksTitle: "How the Registry Works",
      howItWorksSubtitle:
        "A clear, collaborative 3-step process connecting patients and Clinical Immunology & Allergy specialists.",
      howItWorksSteps: [
        {
          stepLabel: "Step 1",
          title: "Patient Enrollment & Document Submission",
          desc: "After signing the electronic informed consent (E-consent) and registering an account, patients upload photos or PDF files of lab reports and clinical records.",
        },
        {
          stepLabel: "Step 2",
          title: "Specialist Review & Verification",
          desc: "Extracted test parameters are checked side-by-side against the original uploaded documents and directly verified by Vinmec Clinical Immunology & Allergy specialists.",
        },
        {
          stepLabel: "Step 3",
          title: "Secure Longitudinal Follow-Up",
          desc: "Verified clinical records are securely stored in the standardized registry, supporting longitudinal tracking of disease activity and treatment response.",
        },
      ],
      benefitsKicker: "For Patients",
      benefitsTitle: "Patient Benefits",
      benefitsSubtitle:
        "Joining the registry provides patients with organized long-term health tracking while safeguarding personal privacy.",
      benefitsItems: [
        {
          title: "Improved Treatment",
          desc: "Centralized immunological, hematological, and renal records across visits are reviewed by Vinmec Clinical Immunology & Allergy specialists, helping physicians monitor disease progression accurately, personalize care, and advance Lupus treatment.",
        },
        {
          title: "Anonymity and Security",
          desc: "Personal identifying information is de-identified and encrypted separately from clinical datasets, strictly complying with medical confidentiality regulations and research ethics standards.",
        },
      ],
      registrationKicker: "Participation Guide",
      registrationTitle: "How to Register",
      registrationSubtitle:
        "To join the SLE Clinical Registry at the Center of Clinical Immunology & Allergy — Vinmec Times City International Hospital, patients complete two clear steps:",
      regStep1Title: "1. E-consent form",
      regStep1Rule:
        "Patients must sign the consent form before registering an account",
      regStep1Desc:
        "Before creating an account, patients review the registry objectives, participation benefits, and data privacy protections, and confirm agreement on the electronic E-consent form.",
      regStep2Title: "2. Submit Medical Records",
      regStep2Desc:
        "After registering and signing in, patients upload photos or PDFs of their laboratory test reports and clinical summaries for specialist review.",
      regStepAction: "Continue to sign in / register",
    },
    login: {
      roleAccessTag: "Role-Based Clinical Access",
      title: "Sign In",
      registerTitle: "Create Account",
      autofillBtn: "Autofill Demo Credentials",
      subtitle: "Enter your email and password to access the system.",
      registerSubtitle:
        "Create a patient account to upload and track your laboratory records.",
      modeSignInTab: "Sign In",
      modeRegisterTab: "Create Account",
      specialistTabTitle: "Clinical Specialist",
      specialistTabBadge: "Physician",
      specialistTabDesc: "Verify labs & manage e-CRF records",
      patientTabTitle: "SLE Patient Portal",
      patientTabBadge: "Patient",
      patientTabDesc: "Sign E-consent & upload records",
      fullNameLabel: "Full Name",
      fullNamePlaceholder: "Enter your full name",
      emailLabel: "Email",
      passwordLabel: "Password",
      passwordHint: "Seeded demo passkey pre-filled",
      passwordHintProduction: "Enter your account password",
      passwordHintRegister: "Min 8 chars, 1 letter, 1 number & 1 special char",
      inviteCodeLabel: "Institutional Specialist Invite Code",
      inviteCodePlaceholder: "Required for Vinmec Clinical Specialists",
      inviteCodeHint:
        "Gated on the server via SPECIALIST_INVITE_CODE to protect physician e-CRF privileges.",
      specialistConsent:
        "I confirm Physician-in-the-Loop (HITL) supervision responsibility: all flagged OCR biomarkers (<85% confidence) will be reviewed against the source scan before e-CRF commit.",
      patientConsent:
        "E-consent form: I have read and agree to participate in the SLE Clinical Registry at the Center of Clinical Immunology & Allergy — Vinmec Times City International Hospital, and consent to encrypted storage and de-identified clinical use of my submitted records.",
      submitBtn: (name) => `Sign In as ${name} →`,
      submitRegisterBtn: (roleLabel) => `Create ${roleLabel} Account →`,
      signingInBtn: "Verifying Session...",
      creatingAccountBtn: "Creating account...",
      skipBtn: "Continue Without Signing In",
      selectedProfileTitle: "Selected Account Profile",
      registerProfileTitle: "Encrypted Account Preview",
      roleAffiliation: "Role & Affiliation",
      deptCohort: "Department / Cohort ID",
      whatUnlocks: "Role Capabilities",
      activeSessionTitle: "Currently Active Session",
      loggedInAs: (name) =>
        `Logged in as ${name}. Signing in above will switch the active session cookie to the new account.`,
      guestNotice: "No active session (unauthenticated guest mode).",
      securityVaultTitle: "3-Zone PII Vault Protection",
      securityVaultDesc:
        "Email & Full Name are stored with AES-256-GCM (AAD row binding) and keyed HMAC-SHA256 blind indexes; passwords use scrypt + HttpOnly DB sessions.",
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
      legendVerified: "Auto-Approved (>90%)",
      legendReview: "Verify (80–90%) / Manual (<80%)",
      legendHint: "Click any box to sync with table →",
      extractionHeaderSuffix: "— e-CRF Extraction",
      sledaiImpactTitle: "Estimated SLEDAI-2K Impact",
      filterAll: (count) => `All Fields (${count})`,
      filterReview: (count) => `Needs Review (${count})`,
      filterAbnormal: (count) => `Abnormal (${count})`,
      addRowBtn: "+ Add Biomarker Row",
      verifyAllBtn: (count) => `Verify All Flagged (${count})`,
      tblHeaderBiomarker: "Biomarker / Assay",
      tblHeaderValue: "Extracted Value",
      tblHeaderUnitRef: "Unit & Ref",
      tblHeaderFlag: "Flag",
      tblHeaderHitl: "HITL Verification",
      groundedFieldPrefix: "GROUNDED FIELD:",
      categoryPrefix: "Category:",
      clinicalNotePrefix: "Clinical & OCR Note:",
      statusNeedsReview: (count) =>
        `${count} field(s) require action: <80% must be entered from original scan, and 80–90% must be verified before commit.`,
      statusAllVerified: (count) =>
        `All ${count} biomarkers verified (>90% auto-approved or user-confirmed) and ready for SLE e-CRF commit.`,
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
      accountCreatedTitle: (name) => `Account created for ${name}`,
      activeMode: (title) => `Active mode: ${title}`,
      authFailedTitle: "Authentication Error",
      signedOutTitle: "Signed out of registry session",
      signedOutDesc: "You are now browsing as a guest visitor.",
      savedRegistryTitle: (id) => `Saved ${id} to SLE e-CRF Registry`,
      savedRegistryDesc: (count, sledai) =>
        `${count} biomarkers committed (${sledai}).`,
      autofillTitle: "Demo Credentials Autofilled",
      autofillDesc: (name) => `Loaded mock profile for ${name}.`,
      emailRequiredTitle: "Email Required",
      emailRequiredDesc: "Please enter your email address.",
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
      brandName:
        "Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City",
      brandSubtitle: "Hệ thống Đăng ký Lâm sàng SLE Vinmec",
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
      activeModePatient: "Chế độ Bệnh nhân",
      signOut: "Đăng xuất",
      signIn: "Đăng nhập",
      guestMode: "Chế độ Khách",
    },
    navbar: {
      overviewWorkflow: "Tổng quan & Quy trình",
      roleLogin: "Đăng nhập Vai trò",
      ocrWorkspace: "Không gian OCR Tài liệu",
      crfManager: "Hồ sơ Bệnh án SLE (CRF)",
      uiButtonMap: "Sơ đồ Nút Giao diện",
      inspectButtonsTitle: "Tra cứu chức năng của từng nút bấm trong mô hình thử nghiệm",
      modalTitle: "Sơ đồ Tương tác Nút Giao diện & Hành vi Dữ liệu Mẫu",
      modalDescription:
        "Tài liệu đối chiếu chức năng của từng nút trên Trang chủ, Đăng nhập, Không gian OCR và Quản lý Hồ sơ Bệnh án SLE (CRF).",
      modalThPage: "Trang / Chế độ",
      modalThButton: "Nút bấm / Điều khiển",
      modalThAction: "Hành động Dữ liệu Mẫu",
      modalThOutcome: "Kết quả Giao diện Dự kiến",
    },
    landing: {
      programTag: "Hệ thống Đăng ký Lâm sàng Lupus Ban Đỏ Hệ Thống (SLE Registry)",
      heroTitle:
        "Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City",
      heroDescription:
        "Cổng thông tin Hệ thống Đăng ký Lâm sàng Bệnh nhân Lupus Ban Đỏ Hệ Thống (SLE). Nền tảng giúp người bệnh lưu trữ hồ sơ xét nghiệm tập trung, theo dõi diễn tiến sức khỏe xuyên suốt và kết nối trực tiếp với đội ngũ Bác sĩ Chuyên khoa tại Vinmec Times City.",
      patientCta: "Dành cho bệnh nhân",
      doctorCta: "Dành cho bác sĩ",
      navBackground: "Bối cảnh",
      navHowItWorks: "Registry hoạt động như nào",
      navBenefits: "Quyền lợi của bệnh nhân",
      navRegistration: "Cách thức đăng ký",
      backgroundKicker: "Thông tin chung",
      backgroundTitle: "Bối cảnh",
      backgroundLead:
        "Lupus ban đỏ hệ thống (SLE) là bệnh lý tự miễn mạn tính có biểu hiện đa cơ quan, đòi hỏi theo dõi lâu dài và liên tục thông qua các xét nghiệm miễn dịch, huyết học và chức năng thận.",
      backgroundCards: [
        {
          title: "Thách thức từ hồ sơ y tế phân tán",
          body: "Trong quá trình điều trị kéo dài, người bệnh thường lưu giữ nhiều phiếu xét nghiệm giấy qua các đợt tái khám khác nhau, dễ thất lạc và gây khó khăn khi bác sĩ cần đối chiếu diễn tiến bệnh theo thời gian.",
        },
        {
          title: "Sáng kiến tại Vinmec Times City",
          body: "Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City xây dựng Hệ thống Đăng ký Lâm sàng SLE nhằm chuẩn hóa dữ liệu y khoa, giúp nâng cao chất lượng theo dõi điều trị cá thể hóa và phục vụ nghiên cứu chuyên sâu.",
        },
      ],
      howItWorksKicker: "Quy trình vận hành",
      howItWorksTitle: "Registry hoạt động như nào",
      howItWorksSubtitle:
        "Quy trình 3 bước minh bạch, khép kín giữa người bệnh và đội ngũ Bác sĩ Chuyên khoa Miễn dịch - Dị ứng.",
      howItWorksSteps: [
        {
          stepLabel: "Bước 1",
          title: "Bệnh nhân đăng ký & gửi hồ sơ",
          desc: "Sau khi ký E-consent form và tạo tài khoản, người bệnh tải lên ảnh chụp hoặc tệp PDF các kết quả xét nghiệm, phiếu khám bệnh hoặc giấy ra viện.",
        },
        {
          stepLabel: "Bước 2",
          title: "Bác sĩ chuyên khoa đối chiếu & thẩm định",
          desc: "Thông tin từ hồ sơ được số hóa và luôn được Bác sĩ Chuyên khoa Miễn dịch - Dị ứng Vinmec trực tiếp kiểm tra, đối chiếu với bản gốc nhằm bảo đảm độ chính xác lâm sàng.",
        },
        {
          stepLabel: "Bước 3",
          title: "Lưu trữ chuẩn hóa & theo dõi dọc",
          desc: "Dữ liệu sau xác thực được lưu trữ an toàn vào hệ thống Registry, hỗ trợ bác sĩ tổng hợp chỉ số bệnh và đồng hành theo dõi điều trị lâu dài cho người bệnh.",
        },
      ],
      benefitsKicker: "Giá trị dành cho người bệnh",
      benefitsTitle: "Quyền lợi của bệnh nhân",
      benefitsSubtitle:
        "Tham gia Hệ thống Đăng ký giúp người bệnh quản lý hồ sơ sức khỏe khoa học và được bảo vệ quyền riêng tư ở mức cao nhất.",
      benefitsItems: [
        {
          title: "Cải thiện hiệu quả điều trị",
          desc: "Toàn bộ lịch sử xét nghiệm miễn dịch, huyết học và chức năng thận qua các đợt khám được lưu trữ tập trung và được Bác sĩ Chuyên khoa Miễn dịch - Dị ứng Vinmec thẩm định, giúp theo dõi diễn tiến bệnh chính xác, tối ưu phác đồ cá thể hóa và nâng cao hiệu quả điều trị Lupus.",
        },
        {
          title: "Ẩn danh và Bảo mật",
          desc: "Thông tin định danh cá nhân được ẩn danh và mã hóa tách biệt hoàn toàn với dữ liệu chuyên môn, tuân thủ nghiêm ngặt quy định bảo mật dữ liệu y tế và đạo đức nghiên cứu.",
        },
      ],
      registrationKicker: "Hướng dẫn tham gia",
      registrationTitle: "Cách thức đăng ký",
      registrationSubtitle:
        "Để tham gia Hệ thống Đăng ký tại Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City, bệnh nhân thực hiện đầy đủ 2 bước sau:",
      regStep1Title: "1. E-consent form",
      regStep1Rule:
        "Bệnh nhân phải ký consent form trước khi đăng ký tài khoản",
      regStep1Desc:
        "Trước khi khởi tạo tài khoản, người bệnh đọc kỹ thông tin về mục đích chương trình, quyền lợi và cam kết bảo mật dữ liệu, sau đó xác nhận đồng ý trên biểu mẫu điện tử (E-consent form).",
      regStep2Title: "2. Nộp hồ sơ",
      regStep2Desc:
        "Sau khi hoàn tất ký E-consent form, tạo tài khoản và đăng nhập, bệnh nhân tiến hành tải lên ảnh chụp hoặc tệp PDF phiếu xét nghiệm, hồ sơ khám bệnh để bác sĩ chuyên khoa tiếp nhận thẩm định.",
      regStepAction: "Đi tới trang đăng nhập",
    },
    login: {
      roleAccessTag: "Truy cập Lâm sàng Phân quyền",
      title: "Đăng nhập",
      registerTitle: "Đăng ký tài khoản",
      autofillBtn: "Tự động Điền Tài khoản Mẫu",
      subtitle: "Nhập email và mật khẩu để truy cập hệ thống.",
      registerSubtitle:
        "Tạo tài khoản bệnh nhân để tải lên và theo dõi hồ sơ xét nghiệm.",
      modeSignInTab: "Đăng nhập",
      modeRegisterTab: "Tạo Tài khoản",
      specialistTabTitle: "Bác sĩ Chuyên khoa",
      specialistTabBadge: "Bác sĩ",
      specialistTabDesc: "Thẩm định hồ sơ & lưu e-CRF",
      patientTabTitle: "Cổng Thông tin Bệnh nhân",
      patientTabBadge: "Bệnh nhân",
      patientTabDesc: "Ký E-consent & nộp hồ sơ xét nghiệm",
      fullNameLabel: "Họ và Tên",
      fullNamePlaceholder: "Nhập họ và tên đầy đủ",
      emailLabel: "Email",
      passwordLabel: "Mật khẩu",
      passwordHint: "Đã điền sẵn mật khẩu tài khoản mẫu",
      passwordHintProduction: "Nhập mật khẩu tài khoản của bạn",
      passwordHintRegister: "Tối thiểu 8 ký tự, gồm chữ cái, số & ký tự đặc biệt",
      inviteCodeLabel: "Mã Mời Bác sĩ Chuyên khoa Vinmec",
      inviteCodePlaceholder: "Bắt buộc đối với Bác sĩ Chuyên khoa",
      inviteCodeHint:
        "Kiểm tra phía máy chủ qua SPECIALIST_INVITE_CODE nhằm bảo vệ quyền ghi e-CRF.",
      specialistConsent:
        "Tôi xác nhận trách nhiệm giám sát Bác sĩ Tham gia (HITL): toàn bộ chỉ số OCR bị cảnh báo (<85% độ tin cậy) sẽ được đối chiếu kỹ lưỡng với bản chụp gốc trước khi lưu vào e-CRF.",
      patientConsent:
        "E-consent form: Tôi đã đọc, hiểu rõ và đồng ý tham gia Hệ thống Đăng ký SLE tại Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City, đồng ý lưu trữ bảo mật và sử dụng dữ liệu y tế đã ẩn danh cho mục đích chăm sóc lâm sàng và nghiên cứu.",
      submitBtn: (name) => `Đăng nhập với tên ${name} →`,
      submitRegisterBtn: (roleLabel) => `Tạo Tài khoản ${roleLabel} →`,
      signingInBtn: "Đang xác thực phiên...",
      creatingAccountBtn: "Đang tạo tài khoản...",
      skipBtn: "Tiếp tục mà không đăng nhập",
      selectedProfileTitle: "Hồ sơ Tài khoản Được Chọn",
      registerProfileTitle: "Xem trước Tài khoản Mã hóa",
      roleAffiliation: "Vai trò & Đơn vị",
      deptCohort: "Khoa / Mã Đoàn hệ Đăng ký",
      whatUnlocks: "Quyền hạn của Vai trò trên Hệ thống",
      activeSessionTitle: "Phiên Làm việc Hiện tại",
      loggedInAs: (name) =>
        `Đang đăng nhập với tên ${name}. Đăng nhập ở trên sẽ cập nhật phiên HttpOnly sang tài khoản mới.`,
      guestNotice: "Chưa có phiên đăng nhập hoạt động (Chế độ Khách).",
      securityVaultTitle: "Bảo vệ Hầm Dữ liệu PII 3 Vùng",
      securityVaultDesc:
        "Email & Họ tên được mã hóa AES-256-GCM (ràng buộc AAD theo hàng) kèm blind index HMAC-SHA256; mật khẩu băm scrypt + phiên DB HttpOnly.",
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
      legendVerified: "Tự động duyệt (>90%)",
      legendReview: "Xác nhận (80–90%) / Nhập tay (<80%)",
      legendHint: "Nhấp vào khung để đồng bộ sang bảng bên phải →",
      extractionHeaderSuffix: "— Trích xuất e-CRF",
      sledaiImpactTitle: "Dự kiến Tác động Điểm SLEDAI-2K",
      filterAll: (count) => `Tất cả Chỉ số (${count})`,
      filterReview: (count) => `Cần Kiểm tra (${count})`,
      filterAbnormal: (count) => `Bất thường (${count})`,
      addRowBtn: "+ Thêm Hàng Chỉ số",
      verifyAllBtn: (count) => `Xác thực Tất cả (${count})`,
      tblHeaderBiomarker: "Chỉ số / Xét nghiệm",
      tblHeaderValue: "Giá trị Trích xuất",
      tblHeaderUnitRef: "Đơn vị & Tham chiếu",
      tblHeaderFlag: "Đánh giá",
      tblHeaderHitl: "Xác thực HITL",
      groundedFieldPrefix: "VÙNG ĐANG CHỌN:",
      categoryPrefix: "Nhóm:",
      clinicalNotePrefix: "Ghi chú Lâm sàng & OCR:",
      statusNeedsReview: (count) =>
        `${count} chỉ số cần xử lý: <80% cần đối chiếu bản gốc để nhập tay, và 80–90% cần nhấn xác nhận trước khi lưu vào e-CRF.`,
      statusAllVerified: (count) =>
        `Toàn bộ ${count} chỉ số sinh học đã được duyệt (>90% tự động hoặc đã xác thực), sẵn sàng lưu vào e-CRF SLE.`,
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
      accountCreatedTitle: (name) => `Đã tạo tài khoản cho ${name}`,
      activeMode: (title) => `Chế độ hoạt động: ${title}`,
      authFailedTitle: "Lỗi Xác thực",
      signedOutTitle: "Đã đăng xuất khỏi phiên làm việc",
      signedOutDesc: "Bạn hiện đang duyệt ở chế độ Khách.",
      savedRegistryTitle: (id) => `Đã lưu hồ sơ ${id} vào CSDL e-CRF SLE`,
      savedRegistryDesc: (count, sledai) =>
        `Đã ghi nhận ${count} chỉ số sinh học (${sledai}).`,
      autofillTitle: "Đã Tự động Điền Tài khoản Mẫu",
      autofillDesc: (name) => `Đã nạp hồ sơ mẫu của ${name}.`,
      emailRequiredTitle: "Yêu cầu Nhập Email",
      emailRequiredDesc: "Vui lòng nhập địa chỉ email của bạn.",
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
      badgeText: "",
    },
    patient: {
      ...DEMO_USERS.patient,
      title: "Người tham gia Đoàn hệ SLE • Mã Đăng ký #VN-SLE-084",
      departmentOrRegistryId: "Đoàn hệ Đăng ký SLE • Tham gia Tháng 10/2026",
      badgeText: "",
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
            clinicalNote:
              "Độ tin cậy OCR <80% do dấu thập phân in mờ trên bản quét nhiệt — vui lòng đối chiếu bản gốc ('0.58') và nhập tay.",
          };
        }
        if (f.id === "fld-c4") {
          return {
            ...f,
            name: "Bổ thể C4 (Đo độ đục Turbidimetry)",
            category: "Bổ thể",
            referenceRange: "0.10 – 0.40 g/L",
            clinicalNote:
              "Nhóm độ tin cậy OCR 80–90%: giá trị điền sẵn '0.09' cần người dùng nhấn xác nhận lại.",
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
            clinicalNote:
              "Nhóm độ tin cậy OCR 80–90%: có chữ viết tay cạnh kết quả — vui lòng xác nhận số liệu '148'.",
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
            clinicalNote:
              "Độ tin cậy OCR <80% do bản in soi cặn mờ — vui lòng xem bản gốc ('18') và nhập tay.",
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
      mockAction: "Chuyển tới trang /login hoặc thu hồi phiên HttpOnly trên PostgreSQL qua POST /api/auth/logout và điều hướng về Tổng quan (/).",
      expectedOutcome: "Cập nhật huy hiệu vai trò ở góc phải phía trên, chuyển về trang Tổng quan khi đăng xuất và hiển thị thông báo trạng thái.",
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
      expectedOutcome: "Cho phép đăng nhập bằng tài khoản mẫu trong DB hoặc tạo tài khoản mới.",
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
      mockAction: "Chuyển đổi vai trò đăng nhập/đăng ký, tự động điền mẫu (khi bật demo) và cập nhật cam kết.",
      expectedOutcome: "Chuyển đổi giữa TS. BS. Nguyễn Minh (Bác sĩ HITL) và Trần Thị Mai (Bệnh nhân).",
    },
    {
      page: "Login Page (/login)",
      buttonLabel: "Tự động Điền Tài khoản Mẫu",
      elementId: "login-btn-autofill",
      mockAction: "Khi bật chế độ demo, tự động điền email, mật khẩu tài khoản mẫu và ô đồng ý e-CRF.",
      expectedOutcome: "Thiết lập đăng nhập nhanh phục vụ đánh giá.",
    },
    {
      page: "Login Page (/login)",
      buttonLabel: "Đăng nhập / Tạo Tài khoản",
      elementId: "login-btn-submit",
      mockAction: "Xác thực qua POST /api/auth/login hoặc đăng ký qua POST /api/auth/register trên PostgreSQL.",
      expectedOutcome: "Cấp cookie phiên HttpOnly, hiển thị huy hiệu người dùng và điều hướng theo vai trò.",
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
      mockAction: "Kiểm tra toàn bộ hàng <80% và 80–90% đã được xử lý, lưu vào savedRecords và đồng bộ sang /crf.",
      expectedOutcome: "Tăng bộ đếm Đăng ký, đồng bộ chỉ số vào Hồ sơ Bệnh án SLE (CRF) và ghi nhận thời gian lưu.",
    },
    {
      page: "SLE e-CRF Manager (/crf)",
      buttonLabel: "Chạy AI OCR & Điền Hồ sơ Bệnh án (CRF)",
      elementId: "crf-btn-run-ocr",
      mockAction: "Quét hồ sơ bệnh án hoặc tệp tải lên và điền vào các trường CRF theo quy tắc độ tin cậy 3 mức.",
      expectedOutcome: ">90% tự động duyệt, 80–90% đánh dấu để xác nhận lại, và <80% để trống yêu cầu xem bản gốc rồi nhập tay.",
    },
    {
      page: "SLE e-CRF Manager (/crf)",
      buttonLabel: "Bộ lọc Phân tầng 3 Mức (<80% Nhập tay / 80–90% Xác nhận / >90% Tự động)",
      elementId: "crf-filter-*",
      mockAction: "Lọc các trường trích xuất trong CRF theo tầng độ tin cậy hoặc nhảy tới trường chưa xử lý tiếp theo.",
      expectedOutcome: "Giúp bác sĩ tập trung xử lý các trường <80% để trống và 80–90% cần xác nhận đối chiếu bản quét gốc.",
    },
    {
      page: "SLE e-CRF Manager (/crf)",
      buttonLabel: "Tự động Gợi ý Điểm EULAR/ACR 2019 & SLEDAI-2K",
      elementId: "crf-btn-autoscore",
      mockAction: "Đánh giá các chỉ số xét nghiệm và tổn thương cơ quan đã xác thực để tự động đánh dấu tiêu chuẩn EULAR/ACR và SLEDAI-2K.",
      expectedOutcome: "Cập nhật tổng điểm phân loại EULAR/ACR (ngưỡng ≥10) và mức độ hoạt tính bệnh SLEDAI-2K.",
    },
    {
      page: "SLE e-CRF Manager (/crf)",
      buttonLabel: "Ký duyệt & Lưu Hồ sơ Bệnh án SLE (CRF)",
      elementId: "crf-btn-signoff",
      mockAction: "Kiểm tra toàn bộ trường <80% và 80–90% đã hoàn tất và ghi nhận chữ ký điện tử theo vai trò.",
      expectedOutcome: "Đánh dấu Hồ sơ Bệnh án SLE đã Xác thực & Ký duyệt, sẵn sàng xuất file JSON toàn phần.",
    },
  ];
}
