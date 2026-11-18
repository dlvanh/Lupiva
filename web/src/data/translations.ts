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
  patientPortal: {
    overviewTitle: string;
    overviewIntro: string;
    startBtn: string;
    submitMenuLabel: string;
    patientMenuLabel: string;
    benefitsTitle: string;
    benefitImprovedTitle: string;
    benefitImprovedBody: string;
    benefitPrivacyTitle: string;
    benefitPrivacyBody: string;
    howTitle: string;
    registerTitle: string;
    registerBody: string;
    step1Title: string;
    step1Body: string;
    step1Btn: string;
    step1Done: string;
    step2Title: string;
    step2Body: string;
    faqTitle: string;
    faq: readonly { question: string; answer: string }[];
    appointmentNotice: string;
    contactTitle: string;
    contactLeadLabel: string;
    contactLead: string;
    contactEmail: string;
    contactPhoneLabel: string;
    contactPhone: string;
    supportLine: (email: string, phone: string) => string;
    successTitle: string;
    successBody: (contactLead: string, contactEmail: string) => string;
    successCodeLabel: string;
    successFilesLabel: string;
    successStatusBtn: string;
    successHomeBtn: string;
  };
  login: {
    modeLabel: string;
    roleLabel: string;
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
    patientEConsent: string;
    patientConsent: string;
    submitBtn: string;
    submitRegisterBtn: (roleLabel: string) => string;
    signingInBtn: string;
    creatingAccountBtn: string;
    skipBtn: string;
    portalTitle: string;
    patientUse: string;
    doctorUse: string;
    dataProtection: string;
    loggedInAs: (name: string) => string;
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
  doctor: {
    counterNew: string;
    counterPending: string;
    counterApproved: string;
    crfFormBtn: string;
    redcapBtn: string;
    moreFilters: string;
    hideFilters: string;
    uploadForPatient: string;
    closeUpload: string;
    reviewBtn: string;
    imagesCount: (count: number) => string;
    progressLoading: string;
    progressUnavailable: string;
    detailsBtn: string;
    collapseBtn: string;
    approveDossierBtn: string;
    approveDossierBusy: string;
    dossierApprovedBtn: string;
    approveDossierHint: string;
    dossierApprovedNotice: string;
    reviewSaved: (count: number) => string;
    scoreSaved: string;
    reviewBar: (approved: number, total: number, pending: number) => string;
    sectionsLabel: string;
    backendIdLabel: string;
    keyboardHint: string;
    editBtn: string;
    originLlm: string;
    originSource: string;
    originApproved: string;
    originManual: string;
    decideShort: string;
    scoreShort: string;
    unknownShort: string;
    dashboard: {
      columns: { studyId: string; patient: string; date: string; images: string; progress: string; status: string; actions: string };
      groups: { failed: string; new: string; reviewing: string; awaiting: string; approved: string };
      sections: { admin: string; blood: string; renal: string; immune: string; clinical: string; score: string };
      legend: { empty: string; unverified: string; complete: string };
      sectionProgress: (label: string, approved: number, total: number) => string;
      remaining: (count: number) => string;
      noName: string;
      reviewer: (name: string, dateTime: string) => string;
      errors: { duplicate: string; noResults: string; timeout: string; network: string; api: string; unknown: string };
      errorDetails: string;
      retry: string;
      retrying: string;
      retryFailed: string;
      reviewUnavailable: string;
      readyForSignOff: string;
    };
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

const patientContact = {
  contactLead: "...",
  contactEmail: "...",
  contactPhone: "...",
};

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
      metricConfidenceTitle: "3-Tier HITL Confidence",
      metricConfidenceVal: ">90% Auto",
      metricConfidenceSub: "80–90% Verify • <80% Manual",
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
    patientPortal: {
      overviewTitle: "Lupus Patient Registry",
      overviewIntro: "Share your visit and test results to help doctors better understand lupus.",
      startBtn: "Start participation",
      submitMenuLabel: "Submit records",
      patientMenuLabel: "My records",
      benefitsTitle: "Benefits for Patients",
      benefitImprovedTitle: "Contribute to lupus research",
      benefitImprovedBody: "Your records can help researchers better understand lupus and how people respond to treatment.",
      benefitPrivacyTitle: "Protecting your privacy",
      benefitPrivacyBody: "The project uses codes in place of names and other details that identify you in the research data.",
      howTitle: "How to join",
      registerTitle: "Create an account",
      registerBody: "Use your email address to sign up and track the records you send.",
      step1Title: "Agree to take part (sign electronically)",
      step1Body: "When you agree to take part, you let the project use the records you share for lupus research. You can contact the project team to withdraw.",
      step1Btn: "Review consent",
      step1Done: "You’ve agreed to take part",
      step2Title: "Submit your records",
      step2Body: "Take or choose photos of your records to send to the project specialists. You can check their status in My records.",
      faqTitle: "Frequently asked questions",
      // TODO: research team to confirm wording
      faq: [
        { question: "Does it cost anything?", answer: "Taking part in the project is free." },
        { question: "Who can see my records?", answer: "The project’s specialists can review your records. The research data is pseudonymized, which means it uses codes in place of identifying details." },
        { question: "How long does it take?", answer: "Submitting depends on how many photos you send. Review usually takes a few working days." },
        { question: "How will my records be used?", answer: "Specialists review the records, and the project uses the data to study how lupus changes over time and how people respond to treatment." },
      ],
      appointmentNotice: "This does not book an appointment or replace seeing a doctor.",
      contactTitle: "Contact",
      contactLeadLabel: "Project lead",
      contactPhoneLabel: "Phone",
      ...patientContact,
      supportLine: (email, phone) => `Need help? Email ${email} or call ${phone}`,
      successTitle: "Submission successful!",
      successBody: (contactLead, contactEmail) =>
        `Thank you for submitting your records to the project. Your information will be forwarded to specialists. If you have any questions, please contact the project lead, ${contactLead}, by email at ${contactEmail}. We are happy to help.`,
      successCodeLabel: "Submission code",
      successFilesLabel: "Number of files",
      successStatusBtn: "View status",
      successHomeBtn: "Back to home",
    },
    login: {
      modeLabel: "Sign in or create an account",
      roleLabel: "Account type",
      title: "Sign in to VietNam Lupus Registry",
      registerTitle: "Create a VietNam Lupus Registry account",
      autofillBtn: "Autofill Demo Credentials",
      subtitle: "Sign in with your account.",
      registerSubtitle:
        "Create a patient account or use an invitation to register as a Vinmec clinical specialist.",
      modeSignInTab: "Sign In",
      modeRegisterTab: "Create Account",
      specialistTabTitle: "Clinical Specialist",
      specialistTabBadge: "HITL Doctor",
      specialistTabDesc: "Verify OCR labs & commit e-CRF",
      patientTabTitle: "SLE Patient Portal",
      patientTabBadge: "Companion",
      patientTabDesc: "Upload lab scans & earn vouchers",
      fullNameLabel: "Full Name",
      fullNamePlaceholder: "e.g., Tran Thi Mai",
      emailLabel: "Institutional or Patient Email",
      passwordLabel: "Password",
      passwordHint: "Seeded demo passkey pre-filled",
      passwordHintProduction: "Enter your account password",
      passwordHintRegister: "Min 8 chars, 1 letter, 1 number & 1 special char",
      inviteCodeLabel: "Institutional Specialist Invite Code",
      inviteCodePlaceholder: "Required for Vinmec Clinical Specialists",
      inviteCodeHint: "Enter the invitation code provided by your institution.",
      specialistConsent:
        "I confirm Physician-in-the-Loop (HITL) supervision responsibility: all flagged OCR biomarkers (<85% confidence) will be reviewed against the source scan before e-CRF commit.",
      patientEConsent: "I agree to participate (E-consent)",
      patientConsent:
        "I consent to contribute de-identified SLE lab values to the Vinmec Clinical Immunology Registry for review by my doctor.",
      submitBtn: "Sign in",
      submitRegisterBtn: (roleLabel) => `Create ${roleLabel} Account →`,
      signingInBtn: "Signing in…",
      creatingAccountBtn: "Creating account…",
      skipBtn: "Continue Without Signing In",
      portalTitle: "Using VietNam Lupus Registry",
      patientUse: "Patients submit documents and track their submissions.",
      doctorUse: "Doctors review submissions and their case report forms (CRFs).",
      dataProtection: "Access to your data is restricted by account permissions.",
      loggedInAs: (name) => `You’re signed in as ${name}.`,
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
    doctor: {
      counterNew: "New dossiers",
      counterPending: "Unreviewed",
      counterApproved: "Approved",
      crfFormBtn: "CRF form",
      redcapBtn: "REDCap",
      moreFilters: "More filters",
      hideFilters: "Hide filters",
      uploadForPatient: "+ Upload images for a patient",
      closeUpload: "Close upload panel",
      reviewBtn: "Review",
      imagesCount: (count) => `${count} image(s)`,
      progressLoading: "reading progress…",
      progressUnavailable: "progress unavailable",
      detailsBtn: "Details",
      collapseBtn: "Collapse",
      approveDossierBtn: "Approve dossier",
      approveDossierBusy: "Approving…",
      dossierApprovedBtn: "Dossier approved",
      approveDossierHint: "Approve every remaining CRF cell before approving the dossier.",
      dossierApprovedNotice: "Dossier approved; it now counts as Approved on the dashboard.",
      reviewSaved: (count) => `Approved ${count} cell(s).`,
      scoreSaved: "Score assessment saved.",
      reviewBar: (approved, total, pending) =>
        `Approved ${approved}/${total} · ${pending} cell(s) left to decide`,
      sectionsLabel: "Sections",
      backendIdLabel: "Backend id",
      keyboardHint: "↑/↓ move between cells · Enter ticks the active cell",
      editBtn: "Edit manually",
      originLlm: "LLM proposal",
      originSource: "read from image",
      originApproved: "approved",
      originManual: "manual edit",
      decideShort: "To decide",
      scoreShort: "Scores",
      unknownShort: "Unknown",
      dashboard: {
        columns: { studyId: "Study ID", patient: "Patient", date: "Submitted", images: "Images", progress: "CRF progress", status: "Status", actions: "Actions" },
        groups: { failed: "Needs attention", new: "New dossiers", reviewing: "In review", awaiting: "Awaiting review", approved: "Reviewed" },
        sections: { admin: "Administration", blood: "Haematology", renal: "Biochemistry / Renal", immune: "Immunology", clinical: "Respiratory / Cardiac / Imaging", score: "SLEDAI / EULAR scores" },
        legend: { empty: "No data", unverified: "Unverified", complete: "Complete" },
        sectionProgress: (label, approved, total) => `${label}: ${approved}/${total} approved`,
        remaining: (count) => `${count} ${count === 1 ? "cell needs" : "cells need"} a decision`,
        noName: "name not entered",
        reviewer: (name, dateTime) => `Dr ${name} · ${dateTime}`,
        errors: {
          duplicate: "This image duplicates one already in another dossier.",
          noResults: "None of the images contain results to extract.",
          timeout: "Image processing timed out.",
          network: "The connection was interrupted while processing the images.",
          api: "The image processing service encountered an error.",
          unknown: "There was a problem processing the images.",
        },
        errorDetails: "Technical details",
        retry: "Retry",
        retrying: "Retrying…",
        retryFailed: "Unable to retry submission.",
        reviewUnavailable: "Review is available after image processing.",
        readyForSignOff: "Awaiting sign-off",
      },
    },
    toasts: {
      signedIn: (name) => `Signed in as ${name}`,
      accountCreatedTitle: (name) => `Account created for ${name}`,
      activeMode: (title) => `Active mode: ${title}`,
      authFailedTitle: "Authentication Error",
      signedOutTitle: "Signed out of VietNam Lupus Registry",
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
      metricConfidenceTitle: "Phân tầng Tin cậy 3 Mức",
      metricConfidenceVal: ">90% Tự động",
      metricConfidenceSub: "80–90% Xác nhận • <80% Nhập tay",
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
    patientPortal: {
      overviewTitle: "Đăng ký bệnh nhân Lupus",
      overviewIntro: "Chia sẻ kết quả khám và xét nghiệm để cùng bác sĩ hiểu rõ hơn về bệnh lupus.",
      startBtn: "Bắt đầu tham gia",
      submitMenuLabel: "Nộp hồ sơ",
      patientMenuLabel: "Hồ sơ của tôi",
      benefitsTitle: "Quyền lợi",
      benefitImprovedTitle: "Góp phần nghiên cứu bệnh lupus",
      benefitImprovedBody: "Hồ sơ bạn chia sẻ giúp nhóm nghiên cứu hiểu thêm về bệnh lupus và cách người bệnh đáp ứng với điều trị.",
      benefitPrivacyTitle: "Bảo vệ thông tin cá nhân",
      benefitPrivacyBody: "Dữ liệu nghiên cứu dùng mã số thay cho tên và những thông tin có thể nhận ra bạn.",
      howTitle: "Cách tham gia",
      registerTitle: "Tạo tài khoản",
      registerBody: "Dùng email để tạo tài khoản và theo dõi hồ sơ bạn đã gửi.",
      step1Title: "Đồng ý tham gia (ký điện tử)",
      step1Body: "Khi đồng ý tham gia, bạn cho phép dự án dùng hồ sơ bạn chia sẻ để nghiên cứu bệnh lupus. Bạn có thể liên hệ nhóm dự án để rút khỏi dự án.",
      step1Btn: "Xem nội dung đồng ý tham gia",
      step1Done: "Bạn đã đồng ý tham gia",
      step2Title: "Nộp hồ sơ",
      step2Body: "Chụp hoặc chọn ảnh hồ sơ để gửi cho bác sĩ chuyên khoa của dự án. Bạn có thể theo dõi tiến độ trong mục Hồ sơ của tôi.",
      faqTitle: "Câu hỏi thường gặp",
      // TODO: research team to confirm wording
      faq: [
        { question: "Có mất phí không?", answer: "Tham gia dự án là miễn phí." },
        { question: "Ai được xem hồ sơ?", answer: "Các bác sĩ chuyên khoa của dự án có thể xem hồ sơ bạn gửi. Dữ liệu nghiên cứu được giả danh hóa, tức là dùng mã số thay cho thông tin nhận diện." },
        { question: "Mất bao lâu?", answer: "Thời gian gửi tùy vào số ảnh bạn nộp. Hồ sơ thường được xem trong vài ngày làm việc." },
        { question: "Hồ sơ dùng vào việc gì?", answer: "Bác sĩ xem hồ sơ và dự án dùng dữ liệu để tìm hiểu bệnh lupus thay đổi theo thời gian ra sao và người bệnh đáp ứng với điều trị thế nào." },
      ],
      appointmentNotice: "Đây không phải đặt lịch khám và không thay thế việc khám bác sĩ.",
      contactTitle: "Liên hệ",
      contactLeadLabel: "Chủ nhiệm dự án",
      contactPhoneLabel: "Điện thoại",
      ...patientContact,
      supportLine: (email, phone) => `Cần hỗ trợ? Gửi email ${email} hoặc gọi ${phone}`,
      successTitle: "Nộp hồ sơ thành công!",
      successBody: (contactLead, contactEmail) =>
        `Cảm ơn bạn đã nộp hồ sơ tới dự án. Thông tin của bạn sẽ được chuyển đến các bác sĩ chuyên khoa. Nếu có bất kỳ thắc mắc gì, bạn vui lòng liên hệ tới chủ nhiệm dự án ${contactLead}, email ${contactEmail}, chúng tôi sẵn sàng hỗ trợ giải đáp.`,
      successCodeLabel: "Mã hồ sơ",
      successFilesLabel: "Số tệp",
      successStatusBtn: "Xem trạng thái",
      successHomeBtn: "Về trang chủ",
    },
    login: {
      modeLabel: "Đăng nhập hoặc tạo tài khoản",
      roleLabel: "Loại tài khoản",
      title: "Đăng nhập VietNam Lupus Registry",
      registerTitle: "Tạo tài khoản VietNam Lupus Registry",
      autofillBtn: "Tự động Điền Tài khoản Mẫu",
      subtitle: "Đăng nhập bằng tài khoản của bạn.",
      registerSubtitle:
        "Tạo tài khoản bệnh nhân hoặc dùng mã mời để đăng ký tài khoản bác sĩ chuyên khoa Vinmec.",
      modeSignInTab: "Đăng nhập",
      modeRegisterTab: "Tạo Tài khoản",
      specialistTabTitle: "Bác sĩ Chuyên khoa",
      specialistTabBadge: "Bác sĩ Duyệt HITL",
      specialistTabDesc: "Xác thực OCR xét nghiệm & lưu e-CRF",
      patientTabTitle: "Cổng Thông tin Bệnh nhân",
      patientTabBadge: "Đồng hành",
      patientTabDesc: "Tải phiếu xét nghiệm & nhận voucher",
      fullNameLabel: "Họ và Tên",
      fullNamePlaceholder: "VD: Trần Thị Mai",
      emailLabel: "Email Bệnh viện hoặc Email Bệnh nhân",
      passwordLabel: "Mật khẩu",
      passwordHint: "Đã điền sẵn mật khẩu tài khoản mẫu",
      passwordHintProduction: "Nhập mật khẩu tài khoản của bạn",
      passwordHintRegister: "Tối thiểu 8 ký tự, gồm chữ cái, số & ký tự đặc biệt",
      inviteCodeLabel: "Mã Mời Bác sĩ Chuyên khoa Vinmec",
      inviteCodePlaceholder: "Bắt buộc đối với Bác sĩ Chuyên khoa",
      inviteCodeHint: "Nhập mã mời do đơn vị của bạn cung cấp.",
      specialistConsent:
        "Tôi xác nhận trách nhiệm giám sát Bác sĩ Tham gia (HITL): toàn bộ chỉ số OCR bị cảnh báo (<85% độ tin cậy) sẽ được đối chiếu kỹ lưỡng với bản chụp gốc trước khi lưu vào e-CRF.",
      patientEConsent: "Tôi đồng ý tham gia (E-consent)",
      patientConsent:
        "Tôi đồng ý đóng góp các chỉ số xét nghiệm SLE đã ẩn danh vào Cơ sở Dữ liệu Miễn dịch Lâm sàng Vinmec để bác sĩ xem xét.",
      submitBtn: "Đăng nhập",
      submitRegisterBtn: (roleLabel) => `Tạo Tài khoản ${roleLabel} →`,
      signingInBtn: "Đang đăng nhập…",
      creatingAccountBtn: "Đang tạo tài khoản…",
      skipBtn: "Tiếp tục mà không đăng nhập",
      portalTitle: "Sử dụng VietNam Lupus Registry",
      patientUse: "Bệnh nhân nộp tài liệu và theo dõi hồ sơ.",
      doctorUse: "Bác sĩ duyệt hồ sơ và phiếu CRF.",
      dataProtection: "Chỉ những tài khoản được cấp quyền mới có thể truy cập dữ liệu của bạn.",
      loggedInAs: (name) => `Bạn đang đăng nhập bằng tài khoản của ${name}.`,
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
    doctor: {
      counterNew: "Hồ sơ mới",
      counterPending: "Chưa duyệt",
      counterApproved: "Đã duyệt",
      crfFormBtn: "Phiếu CRF",
      redcapBtn: "REDCap",
      moreFilters: "Lọc thêm",
      hideFilters: "Ẩn lọc",
      uploadForPatient: "+ Tải ảnh lên cho bệnh nhân",
      closeUpload: "Đóng khung tải ảnh",
      reviewBtn: "Duyệt",
      imagesCount: (count) => `${count} ảnh`,
      progressLoading: "đang đọc tiến độ…",
      progressUnavailable: "không đọc được tiến độ",
      detailsBtn: "Chi tiết",
      collapseBtn: "Thu gọn",
      approveDossierBtn: "Phê duyệt hồ sơ",
      approveDossierBusy: "Đang phê duyệt…",
      dossierApprovedBtn: "Hồ sơ đã phê duyệt",
      approveDossierHint: "Duyệt hết các ô CRF còn lại trước khi phê duyệt hồ sơ.",
      dossierApprovedNotice: "Đã phê duyệt hồ sơ; hồ sơ được tính vào mục Đã duyệt trên bảng hồ sơ.",
      reviewSaved: (count) => `Đã duyệt ${count} ô.`,
      scoreSaved: "Đã lưu đánh giá điểm.",
      reviewBar: (approved, total, pending) =>
        `Đã duyệt ${approved}/${total} · còn ${pending} ô cần quyết định`,
      sectionsLabel: "Mục",
      backendIdLabel: "Mã backend",
      keyboardHint: "↑/↓ chuyển ô · Enter tích ô đang chọn",
      editBtn: "Sửa tay",
      originLlm: "LLM đề xuất",
      originSource: "đọc từ ảnh",
      originApproved: "đã duyệt",
      originManual: "sửa tay",
      decideShort: "Cần quyết định",
      scoreShort: "Chấm điểm",
      unknownShort: "Chưa rõ",
      dashboard: {
        columns: { studyId: "Study ID", patient: "Bệnh nhân", date: "Ngày nộp", images: "Ảnh", progress: "Tiến độ CRF", status: "Trạng thái", actions: "Thao tác" },
        groups: { failed: "Cần xử lý", new: "Hồ sơ mới", reviewing: "Đang duyệt", awaiting: "Chờ duyệt", approved: "Đã duyệt" },
        sections: { admin: "Hành chính", blood: "Huyết học", renal: "Sinh hóa/Thận", immune: "Miễn dịch", clinical: "Hô hấp/Tim/Hình ảnh", score: "Điểm SLEDAI/EULAR" },
        legend: { empty: "Không có dữ liệu", unverified: "Chưa xác minh", complete: "Đã duyệt" },
        sectionProgress: (label, approved, total) => `${label}: ${approved}/${total} đã duyệt`,
        remaining: (count) => `còn ${count} ô cần quyết định`,
        noName: "chưa nhập tên",
        reviewer: (name, dateTime) => `BS. ${name} · ${dateTime}`,
        errors: {
          duplicate: "Ảnh trùng với hồ sơ khác đã có trong hệ thống",
          noResults: "Không có ảnh nào chứa kết quả để trích xuất.",
          timeout: "Quá thời gian xử lý ảnh.",
          network: "Mất kết nối khi xử lý ảnh.",
          api: "Dịch vụ xử lý ảnh gặp lỗi.",
          unknown: "Có lỗi khi xử lý ảnh.",
        },
        errorDetails: "Chi tiết kỹ thuật",
        retry: "Gửi lại",
        retrying: "Đang gửi lại…",
        retryFailed: "Không gửi lại được hồ sơ.",
        reviewUnavailable: "Có thể duyệt sau khi xử lý ảnh.",
        readyForSignOff: "Chờ ký duyệt",
      },
    },
    toasts: {
      signedIn: (name) => `Đã đăng nhập vai trò ${name}`,
      accountCreatedTitle: (name) => `Đã tạo tài khoản cho ${name}`,
      activeMode: (title) => `Chế độ hoạt động: ${title}`,
      authFailedTitle: "Lỗi Xác thực",
      signedOutTitle: "Đã đăng xuất khỏi VietNam Lupus Registry",
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
      mockAction: "Chuyển tới trang /login hoặc thu hồi phiên HttpOnly trên PostgreSQL qua POST /api/auth/logout.",
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
