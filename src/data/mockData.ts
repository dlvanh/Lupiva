export type UserRole = "specialist" | "patient";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  departmentOrRegistryId: string;
  badgeText: string;
  consentSigned: boolean;
  consentSignedAt?: string | null;
}

export interface DemoUser extends AuthUser {
  passwordHint: string;
}

export type ClinicalFlag = "Normal" | "High" | "Low" | "Positive";

export interface BiomarkerField {
  id: string;
  code: string;
  name: string;
  category: string;
  /** Current value in the input. Empty ("") initially when confidence < 80% */
  value: string;
  /** Ground-truth value printed on the source lab scan sheet */
  printedValue?: string;
  unit: string;
  referenceRange: string;
  flag: ClinicalFlag;
  confidence: number; // 0 - 100
  verified: boolean;
  clinicalNote: string;
  // Percentage coordinates (0-100) on the rendered document sheet for bounding-box grounding
  bbox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface LabReportMock {
  id: string;
  shortTitle: string;
  title: string;
  subtitle: string;
  facility: string;
  department: string;
  patientName: string;
  patientId: string;
  patientAgeSex: string;
  collectionDate: string;
  specimenType: string;
  orderingPhysician: string;
  clinicalSummary: string;
  sledaiImpact: string;
  fields: BiomarkerField[];
}

export interface ButtonMappingItem {
  page:
    | "Global Navbar"
    | "Landing Page (/)"
    | "Login Page (/login)"
    | "OCR Workspace (/ocr)"
    | "SLE e-CRF Manager (/crf)";
  buttonLabel: string;
  elementId: string;
  mockAction: string;
  expectedOutcome: string;
}

export const DEMO_USERS: Record<UserRole, DemoUser> = {
  specialist: {
    id: "usr-spec-01",
    name: "Dr. Nguyen Minh, MD, PhD",
    role: "specialist",
    title: "Senior Consultant — Clinical Immunology & Allergy",
    email: "dr.minh.immunology@vinmec.com",
    passwordHint: "VinmecSLE#2026",
    departmentOrRegistryId: "Vinmec Times City • Dept. of Clinical Immunology",
    badgeText: "",
    consentSigned: true,
  },
  patient: {
    id: "usr-pat-84",
    name: "Tran Thi Mai",
    role: "patient",
    title: "SLE Cohort Participant • Registry #VN-SLE-084",
    email: "mai.tran.patient@lupiva.vn",
    passwordHint: "PatientCare#2026",
    departmentOrRegistryId: "SLE Registry Cohort • Enrolled Oct 2026",
    badgeText: "",
    consentSigned: true,
  },
};

export const MOCK_LAB_REPORTS: LabReportMock[] = [
  {
    id: "rep-sle-immuno",
    shortTitle: "Report #1: SLE Serology & Complement",
    title: "Autoimmune Serology & Complement Panel",
    subtitle: "Standardized SLE Activity Biomarkers (e-CRF Form A1)",
    facility: "Vinmec Central Laboratory — Clinical Immunology Division",
    department: "Outpatient Rheumatology & Autoimmune Clinic",
    patientName: "Tran Thi Mai",
    patientId: "VN-SLE-084",
    patientAgeSex: "29F",
    collectionDate: "08/11/2026 08:35 ICT",
    specimenType: "Venous Serum (SST Tube)",
    orderingPhysician: "Dr. Nguyen Minh, MD",
    clinicalSummary:
      "Elevated Anti-dsDNA titer with hypocomplementemia (low C3 and C4), consistent with active serological SLE flare.",
    sledaiImpact: "+4 points (Increased DNA binding +2, Low Complement +2)",
    fields: [
      {
        id: "fld-ana",
        code: "ANA-HEP2",
        name: "ANA (Immunofluorescence Hep-2)",
        category: "Autoantibodies",
        value: "1:320 Homogeneous",
        unit: "Titer",
        referenceRange: "< 1:80 Negative",
        flag: "Positive",
        confidence: 98,
        verified: true,
        clinicalNote: "Entry criterion confirmed for EULAR/ACR SLE classification.",
        bbox: { top: 31, left: 6, width: 88, height: 7.5 },
      },
      {
        id: "fld-dsdna",
        code: "ANTI-DSDNA",
        name: "Anti-dsDNA IgG (ELISA)",
        category: "Autoantibodies",
        value: "142.5",
        unit: "IU/mL",
        referenceRange: "< 30.0 IU/mL",
        flag: "High",
        confidence: 96,
        verified: true,
        clinicalNote: "4.7x upper limit of normal; correlates with lupus nephritis activity.",
        bbox: { top: 40, left: 6, width: 88, height: 7.5 },
      },
      {
        id: "fld-c3",
        code: "COMP-C3",
        name: "Complement C3 (Turbidimetry)",
        category: "Complement",
        value: "",
        printedValue: "0.58",
        unit: "g/L",
        referenceRange: "0.90 – 1.80 g/L",
        flag: "Low",
        confidence: 76,
        verified: false,
        clinicalNote:
          "<80% OCR confidence due to faint decimal print on thermal scan — check original document ('0.58') and enter manually.",
        bbox: { top: 49, left: 6, width: 88, height: 7.5 },
      },
      {
        id: "fld-c4",
        code: "COMP-C4",
        name: "Complement C4 (Turbidimetry)",
        category: "Complement",
        value: "0.09",
        printedValue: "0.09",
        unit: "g/L",
        referenceRange: "0.10 – 0.40 g/L",
        flag: "Low",
        confidence: 84,
        verified: false,
        clinicalNote:
          "80–90% OCR confidence tier: pre-filled '0.09' requires user verification against scan.",
        bbox: { top: 58, left: 6, width: 88, height: 7.5 },
      },
      {
        id: "fld-esr",
        code: "ESR-1HR",
        name: "Erythrocyte Sedimentation Rate (ESR)",
        category: "Inflammation",
        value: "44",
        unit: "mm/hr",
        referenceRange: "0 – 20 mm/hr",
        flag: "High",
        confidence: 97,
        verified: true,
        clinicalNote: "Elevated systemic acute phase reactant.",
        bbox: { top: 67, left: 6, width: 88, height: 7.5 },
      },
      {
        id: "fld-crp",
        code: "HS-CRP",
        name: "C-Reactive Protein (hs-CRP)",
        category: "Inflammation",
        value: "4.2",
        unit: "mg/L",
        referenceRange: "< 5.0 mg/L",
        flag: "Normal",
        confidence: 99,
        verified: true,
        clinicalNote: "Normal CRP with high ESR is classic for uncomplicated SLE flare vs. infection.",
        bbox: { top: 76, left: 6, width: 88, height: 7.5 },
      },
    ],
  },
  {
    id: "rep-sle-renal",
    shortTitle: "Report #2: Lupus Nephritis & Renal",
    title: "Renal Function & 24h Urinalysis Panel",
    subtitle: "Lupus Nephritis Surveillance (e-CRF Form B2)",
    facility: "Vinmec Central Laboratory — Nephrology & Urinalysis Unit",
    department: "Multidisciplinary Lupus Nephritis Clinic",
    patientName: "Tran Thi Mai",
    patientId: "VN-SLE-084",
    patientAgeSex: "29F",
    collectionDate: "08/11/2026 09:10 ICT",
    specimenType: "24h Urine + Fasting Serum",
    orderingPhysician: "Dr. Nguyen Minh, MD",
    clinicalSummary:
      "New-onset proteinuria > 0.5 g/24h with active urinary sediment; warrants specialist nephrology co-management.",
    sledaiImpact: "+8 points (Proteinuria +4, Hematuria / Urinary Casts +4)",
    fields: [
      {
        id: "fld-up24",
        code: "UPROT-24H",
        name: "24-Hour Urine Protein Excretion",
        category: "Urinalysis",
        value: "1.35",
        unit: "g/24h",
        referenceRange: "< 0.15 g/24h",
        flag: "High",
        confidence: 95,
        verified: true,
        clinicalNote: "Exceeds 0.5 g/24h SLEDAI-2K proteinuria threshold.",
        bbox: { top: 31, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-upcr",
        code: "UPCR-SPOT",
        name: "Urine Protein-to-Creatinine Ratio",
        category: "Urinalysis",
        value: "148",
        printedValue: "148",
        unit: "mg/mmol",
        referenceRange: "< 15 mg/mmol",
        flag: "High",
        confidence: 84,
        verified: false,
        clinicalNote:
          "80–90% OCR confidence tier: handwritten lab annotation nearby — please verify numeric value '148'.",
        bbox: { top: 41, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-screat",
        code: "SER-CREAT",
        name: "Serum Creatinine (Enzymatic)",
        category: "Renal Chemistry",
        value: "86.0",
        unit: "µmol/L",
        referenceRange: "45.0 – 84.0 µmol/L",
        flag: "High",
        confidence: 98,
        verified: true,
        clinicalNote: "Mild elevation above baseline (baseline 68 µmol/L).",
        bbox: { top: 51, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-egfr",
        code: "EGFR-CKDEPI",
        name: "eGFR (CKD-EPI 2021)",
        category: "Renal Chemistry",
        value: "78",
        unit: "mL/min/1.73m²",
        referenceRange: "> 90 mL/min/1.73m²",
        flag: "Low",
        confidence: 97,
        verified: true,
        clinicalNote: "CKD Stage G2 range; monitor closely with immunosuppression adjustment.",
        bbox: { top: 61, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-rbc-urine",
        code: "URINE-RBC",
        name: "Urine Dysmorphic RBCs (Microscopy)",
        category: "Urinary Sediment",
        value: "",
        printedValue: "18",
        unit: "cells/HPF",
        referenceRange: "0 – 4 cells/HPF",
        flag: "High",
        confidence: 74,
        verified: false,
        clinicalNote:
          "<80% OCR confidence: smudged microscopy printout — check original document ('18') and enter manually.",
        bbox: { top: 71, left: 6, width: 88, height: 8 },
      },
    ],
  },
  {
    id: "rep-sle-cbc",
    shortTitle: "Report #3: Hematology & Cytopenia",
    title: "Complete Blood Count (CBC) & Direct Coombs",
    subtitle: "SLE Hematologic Manifestations (e-CRF Form C1)",
    facility: "Vinmec Central Laboratory — Automated Hematology",
    department: "Outpatient Rheumatology & Autoimmune Clinic",
    patientName: "Tran Thi Mai",
    patientId: "VN-SLE-084",
    patientAgeSex: "29F",
    collectionDate: "08/11/2026 08:40 ICT",
    specimenType: "EDTA Whole Blood",
    orderingPhysician: "Dr. Nguyen Minh, MD",
    clinicalSummary:
      "Mild leukopenia and lymphopenia typical of active SLE; platelet count preserved above 100 G/L.",
    sledaiImpact: "+1 point (Leukopenia < 3.0 G/L)",
    fields: [
      {
        id: "fld-wbc",
        code: "WBC-TOTAL",
        name: "White Blood Cell Count (WBC)",
        category: "Hematology",
        value: "2.85",
        unit: "G/L",
        referenceRange: "4.00 – 10.00 G/L",
        flag: "Low",
        confidence: 99,
        verified: true,
        clinicalNote: "Leukopenia < 3.0 G/L not due to drug toxicity.",
        bbox: { top: 31, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-lymph",
        code: "ALC-ABS",
        name: "Absolute Lymphocyte Count",
        category: "Hematology",
        value: "0.72",
        unit: "G/L",
        referenceRange: "1.00 – 4.00 G/L",
        flag: "Low",
        confidence: 83,
        verified: false,
        clinicalNote: "Marked lymphopenia; flagged (<85% confidence) for manual verification.",
        bbox: { top: 41, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-hgb",
        code: "HGB-CONC",
        name: "Hemoglobin (Hb)",
        category: "Hematology",
        value: "112",
        unit: "g/L",
        referenceRange: "120 – 155 g/L",
        flag: "Low",
        confidence: 98,
        verified: true,
        clinicalNote: "Mild normocytic anemia of chronic inflammation.",
        bbox: { top: 51, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-plt",
        code: "PLT-COUNT",
        name: "Platelet Count (PLT)",
        category: "Hematology",
        value: "184",
        unit: "G/L",
        referenceRange: "150 – 400 G/L",
        flag: "Normal",
        confidence: 99,
        verified: true,
        clinicalNote: "Within normal reference limits.",
        bbox: { top: 61, left: 6, width: 88, height: 8 },
      },
      {
        id: "fld-coombs",
        code: "DAT-COOMBS",
        name: "Direct Antiglobulin Test (Direct Coombs)",
        category: "Immunohematology",
        value: "Weak Positive (IgG)",
        unit: "Qualitative",
        referenceRange: "Negative",
        flag: "Positive",
        confidence: 94,
        verified: true,
        clinicalNote: "Autoimmune hemolysis screen positive without overt hemolysis.",
        bbox: { top: 71, left: 6, width: 88, height: 8 },
      },
    ],
  },
];

export const BUTTON_ACTION_MAP: ButtonMappingItem[] = [
  {
    page: "Global Navbar",
    buttonLabel: "EN | VI (Language Switcher)",
    elementId: "nav-btn-language-toggle",
    mockAction: "Toggles the entire platform interface and clinical mock data between English and Vietnamese in real time.",
    expectedOutcome: "Updates header, pages, and biomarker tables to the selected language immediately.",
  },
  {
    page: "Global Navbar",
    buttonLabel: "UI Button Map",
    elementId: "nav-btn-action-guide",
    mockAction: "Opens the interactive Button & Mock Data Reference modal from any page.",
    expectedOutcome: "Displays a complete table of all buttons and their mock state transitions.",
  },
  {
    page: "Global Navbar",
    buttonLabel: "Sign In / Sign Out",
    elementId: "nav-btn-auth",
    mockAction: "Routes to /login or revokes the active PostgreSQL HttpOnly session via POST /api/auth/logout and redirects to Overview (/).",
    expectedOutcome: "Updates top-right user role pill, navigates to / on sign out, and shows session status toast.",
  },
  {
    page: "Landing Page (/)",
    buttonLabel: "Launch Document OCR Workspace",
    elementId: "hero-btn-launch-ocr",
    mockAction: "Navigates directly to /ocr with Report #1 (SLE Serology Panel) loaded.",
    expectedOutcome: "Opens the split-screen clinical OCR workspace immediately.",
  },
  {
    page: "Landing Page (/)",
    buttonLabel: "Specialist / Patient Login",
    elementId: "hero-btn-login",
    mockAction: "Navigates to /login authentication screen.",
    expectedOutcome: "Allows signing in with seeded demo accounts or registering a new account.",
  },
  {
    page: "Landing Page (/)",
    buttonLabel: "Inspect Sample Report in OCR (#1 / #2 / #3)",
    elementId: "sample-card-btn-*",
    mockAction: "Sets selectedReportId in LupivaContext and routes to /ocr.",
    expectedOutcome: "Pre-loads the chosen SLE lab panel (Serology, Renal, or CBC) in the OCR viewer.",
  },
  {
    page: "Login Page (/login)",
    buttonLabel: "Role Tab: Vinmec Specialist / SLE Patient",
    elementId: "login-tab-specialist / login-tab-patient",
    mockAction: "Switches active role selection, demo credential autofill (when enabled), and consent copy.",
    expectedOutcome: "Toggles between Dr. Nguyen Minh (HITL Reviewer) and Tran Thi Mai (Patient).",
  },
  {
    page: "Login Page (/login)",
    buttonLabel: "Autofill Demo Credentials",
    elementId: "login-btn-autofill",
    mockAction: "When demo mode is enabled, populates seeded email, password, and e-CRF informed consent checkbox.",
    expectedOutcome: "Zero-typing demo login setup for evaluators.",
  },
  {
    page: "Login Page (/login)",
    buttonLabel: "Sign In / Create Account",
    elementId: "login-btn-submit",
    mockAction: "Authenticates via POST /api/auth/login or registers via POST /api/auth/register against PostgreSQL.",
    expectedOutcome: "Issues an HttpOnly session cookie, displays verified user badge, and redirects by role.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Sample Report Switcher (#1, #2, #3)",
    elementId: "ocr-btn-report-*",
    mockAction: "Loads the selected mock clinical lab scan and its corresponding biomarker rows.",
    expectedOutcome: "Updates both the left scanned document sheet and right e-CRF extraction table.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Upload Lab Image / PDF",
    elementId: "ocr-btn-upload",
    mockAction: "Opens file input; renders uploaded image on the left canvas with mock SLE extraction.",
    expectedOutcome: "Lets users test uploading their own file while mapping to structured e-CRF fields.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Run AI OCR Scan",
    elementId: "ocr-btn-run-scan",
    mockAction: "Runs a 1.1s laser scan animation over the document and refreshes field extraction.",
    expectedOutcome: "Highlights bounding boxes on the lab report and populates biomarker confidence scores.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Bounding Box / Table Row Click",
    elementId: "ocr-bbox-* / ocr-row-*",
    mockAction: "Bi-directionally links a region on the scanned report with its row in the e-CRF table.",
    expectedOutcome: "Highlights the active biomarker in both panes and shows clinical SLEDAI notes.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Verify Row / Edit Value Inline",
    elementId: "ocr-btn-verify-*",
    mockAction: "Approves a flagged (<85% confidence) OCR value or updates its number/unit.",
    expectedOutcome: "Changes row badge from amber 'Needs Review' to teal 'Verified (100%)'.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Verify All Flagged Fields",
    elementId: "ocr-btn-verify-all",
    mockAction: "Batch-approves all remaining low-confidence rows in the current report.",
    expectedOutcome: "Clears all amber 'Needs Review' warnings so the report is ready for e-CRF commit.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Add Biomarker Row",
    elementId: "ocr-btn-add-row",
    mockAction: "Appends a new editable biomarker row to the e-CRF table.",
    expectedOutcome: "Allows manual entry of any additional lab test from the paper report.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Preview / Download e-CRF JSON",
    elementId: "ocr-btn-export-json",
    mockAction: "Generates standardized SLE Registry e-CRF JSON payload and opens preview/download.",
    expectedOutcome: "Displays the structured FHIR/e-CRF JSON ready for database ingestion.",
  },
  {
    page: "OCR Workspace (/ocr)",
    buttonLabel: "Save to SLE Registry (e-CRF)",
    elementId: "ocr-btn-save-registry",
    mockAction: "Validates that all <80% manual-entry and 80–90% verify rows are resolved, saves to savedRecords, and syncs to /crf.",
    expectedOutcome: "Increments the Registry counter, syncs values into the patient's SLE CRF, and logs timestamp.",
  },
  {
    page: "SLE e-CRF Manager (/crf)",
    buttonLabel: "Run AI OCR & Populate CRF",
    elementId: "crf-btn-run-ocr",
    mockAction: "Scans the selected clinical dossier or uploaded file and maps results into CRF fields using the 3-tier confidence rule.",
    expectedOutcome: ">90% auto-approves, 80–90% highlights for verification, and <80% leaves blank for manual entry from the source scan.",
  },
  {
    page: "SLE e-CRF Manager (/crf)",
    buttonLabel: "3-Tier Triage Filter (<80% Manual / 80–90% Verify / >90% Auto)",
    elementId: "crf-filter-*",
    mockAction: "Filters CRF extracted fields by confidence tier or jumps to the next unresolved field.",
    expectedOutcome: "Focuses clinician review on <80% blank fields and 80–90% verification fields with side-by-side scan grounding.",
  },
  {
    page: "SLE e-CRF Manager (/crf)",
    buttonLabel: "Auto-Suggest EULAR/ACR 2019 & SLEDAI-2K from Verified Data",
    elementId: "crf-btn-autoscore",
    mockAction: "Evaluates verified lab biomarkers and organ manifestations to pre-check matching EULAR/ACR and SLEDAI-2K criteria.",
    expectedOutcome: "Updates domain-weighted EULAR/ACR score (≥10 threshold) and SLEDAI-2K disease activity total.",
  },
  {
    page: "SLE e-CRF Manager (/crf)",
    buttonLabel: "Sign Off & Commit SLE Case Report Form",
    elementId: "crf-btn-signoff",
    mockAction: "Verifies all <80% and 80–90% OCR fields are resolved and records role-attributed CRF sign-off.",
    expectedOutcome: "Marks the patient's complete SLE Case Report Form as Verified & Signed and enables full JSON export.",
  },
];
