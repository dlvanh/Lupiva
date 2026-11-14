import { ClinicalFlag } from "./mockData";

export type OcrTierStatus =
  | "auto_approved" // > 90% confidence -> auto-approved
  | "needs_verify" // 80 - 90% confidence -> pre-filled, user must verify again
  | "manual_required" // < 80% confidence -> left blank initially; user checks original document and adds it in
  | "user_verified"; // Verified or manually entered by the user

export function getInitialOcrTierStatus(confidence: number): OcrTierStatus {
  if (confidence > 90) return "auto_approved";
  if (confidence >= 80) return "needs_verify";
  return "manual_required";
}

export interface CrfOcrField {
  id: string;
  code: string;
  labelEn: string;
  labelVi: string;
  sectionId: CrfSectionId;
  subSectionEn: string;
  subSectionVi: string;
  panelGroup: "infectious" | "organs" | "renal" | "hematology" | "pft" | "immunology";
  /** Current value in the CRF input. Empty string ("") initially when confidence < 80% */
  value: string;
  /** The printed value visible on the original scanned document sheet */
  printedValue: string;
  /** Optional secondary value (e.g., % predicted for PFTs or intensity for Blot panels) */
  secondaryValue?: string;
  printedSecondaryValue?: string;
  unit: string;
  referenceRange: string;
  flag: ClinicalFlag;
  confidence: number; // 0 - 100
  status: OcrTierStatus;
  clinicalNoteEn?: string;
  clinicalNoteVi?: string;
}

export type CrfSectionId =
  | "demographics"
  | "medical_history"
  | "organs_damage"
  | "immunology"
  | "eular_acr"
  | "sledai_2k";

export type YesNoUnknown = "YES" | "NO" | "Unknown";

export interface CrfInfectionEpisode {
  id: string;
  factor: string;
  dateOfOnset: string;
  dateOfNormalization: string;
}

export interface CrfTreatmentRow {
  id: string;
  group: "Medication" | "Vaccine" | "Other";
  name: string;
  route: string;
  dose: string;
  frequency: string;
  duration: string; // Begin date / End date
}

export interface CrfCheckItem {
  id: string;
  labelEn: string;
  labelVi: string;
  checked: boolean;
  specify: string;
}

export type BlotResultStatus = "Negative" | "Positive" | "Borderline" | "";

export interface CrfAntibodyBlotRow {
  id: string;
  code: string;
  name: string;
  panel: "ana23" | "myositis16";
  /** Current status in CRF. Empty ("") when confidence < 80% until user checks original scan */
  result: BlotResultStatus;
  printedResult: "Negative" | "Positive" | "Borderline";
  intensity: string;
  printedIntensity: string;
  confidence: number;
  status: OcrTierStatus;
}

export interface EularAcrCriterionItem {
  id: string;
  domainId: string;
  domainCategory: "clinical" | "immunological";
  domainLabelEn: string;
  domainLabelVi: string;
  labelEn: string;
  labelVi: string;
  weight: number;
  checked: boolean;
}

export interface Sledai2kCriterionItem {
  id: string;
  weight: number;
  criterionEn: string;
  criterionVi: string;
  definitionEn: string;
  definitionVi: string;
  checked: boolean;
}

export interface UploadedDocFile {
  id: string;
  name: string;
  /** Object URL for images; null for PDFs / sample dossier */
  url: string | null;
  isImage: boolean;
}

export type SubmissionStatus = "pending_doctor_review" | "approved";

export interface SleCrfPatientRecord {
  /** Documents uploaded by the patient (patient flow) */
  uploadedFiles?: UploadedDocFile[];
  submittedAt?: string;
  submissionStatus?: SubmissionStatus;
  id: string;
  studyId: string; // e.g., VN-0084-26
  patientName: string;
  age: string;
  gender: "Female" | "Male";
  icfSignedDate: string; // DD/MM/YYYY
  heightCm: string;
  weightKg: string;
  physician: string;
  nurse: string;
  lastUpdated: string;
  signedOffBy: string | null;
  signedOffRole: string | null;

  // Section 2: Medical History
  malignantDisease: "YES" | "NO";
  malignantSpecify: string;
  otherComorbidities: "YES" | "NO";
  otherComorbiditiesSpecify: string;
  familyAutoimmuneHistory: "YES" | "NO";
  familyRelatives: {
    Father: boolean;
    Mother: boolean;
    Brother: boolean;
    Sister: boolean;
    Child: boolean;
    Others: boolean;
  };
  familyDiseaseSpecify: string;
  fever: "YES" | "NO";
  feverTempC: string;
  feverOnsetDate: string;
  feverType: "periodic" | "prolonged" | "others";
  feverTypeSpecify: string;
  historyOfInfection: YesNoUnknown;
  infectionEpisodes: CrfInfectionEpisode[];
  treatmentStatus: "YES" | "NO";
  treatments: CrfTreatmentRow[];

  // Section 3: Organs Damage
  skinMucosaAbnormality: YesNoUnknown;
  skinMucosaItems: CrfCheckItem[];
  muscleDamage: YesNoUnknown;
  muscleBiopsyOther: "YES" | "NO";
  muscleBiopsySpecify: string;
  jointsDamage: YesNoUnknown;
  swollenJointsCount: string;
  tenderJointsCount: string;
  vasScore: string; // /100
  abnormalXray: YesNoUnknown;
  abnormalXraySpecify: string;
  abnormalUltrasound: YesNoUnknown;
  abnormalUltrasoundSpecify: string;
  jointDeformity: YesNoUnknown;
  jointDeformitySpecify: string;
  jointsOther: "YES" | "NO";
  jointsOtherSpecify: string;
  kidneysDamage: YesNoUnknown;
  renalBiopsyPerformed: "YES" | "NO";
  renalBiopsyNote: string;
  renalBiopsyClasses: string[]; // Class I, Class II, Class III, Class IV, IIIA, IVA, IIIC, IVC, IIIA/C, IVA/C, Class V, Class VI
  kidneysOther: "YES" | "NO";
  kidneysOtherSpecify: string;
  haematologicalDisorders: YesNoUnknown;
  haematologicalSpecify: string;
  cardiovascularAbnormality: YesNoUnknown;
  cardiovascularItems: CrfCheckItem[];
  lungDamage: YesNoUnknown;
  lungIld: boolean;
  lungIldPatterns: string[]; // UIP, NSIP, OP, NSIP-OP overlap, DAD, LIP, Unclassifiable pattern
  lungPleuritis: boolean;
  lungPleuritisSpecify: string;
  lungOther: boolean;
  lungOtherSpecify: string;
  neuropsychiatricDisorders: YesNoUnknown;
  neuropsychiatricItems: CrfCheckItem[];
  giDisorders: YesNoUnknown;
  giItems: CrfCheckItem[];

  // OCR-Extracted Lab & Instrument Fields across Sections 2, 3, 4
  ocrFields: CrfOcrField[];

  // Section 4: Antibody Blot Panels (ANA Profile 23 & Myositis 16)
  antibodyBlots: CrfAntibodyBlotRow[];

  // Section 5: 2019 EULAR/ACR SLE Classification Criteria
  anaEntryCriterionMet: boolean;
  eularAcrCriteria: EularAcrCriterionItem[];

  // Section 6: SLEDAI-2K Disease Activity Assessment
  sledai2kCriteria: Sledai2kCriterionItem[];
}

export function getSubmissionStatus(p: SleCrfPatientRecord): SubmissionStatus {
  return p.submissionStatus ?? (p.signedOffBy ? "approved" : "pending_doctor_review");
}

export const RENAL_BIOPSY_CLASS_OPTIONS = [
  "Class I",
  "Class II",
  "Class III",
  "Class IV",
  "IIIA",
  "IVA",
  "IIIC",
  "IVC",
  "IIIA/C",
  "IVA/C",
  "Class V",
  "Class VI",
] as const;

export const ILD_HRCT_PATTERN_OPTIONS = [
  "UIP",
  "NSIP",
  "OP",
  "NSIP-OP overlap",
  "DAD",
  "LIP",
  "Unclassifiable pattern",
] as const;

function makeOcrField(
  id: string,
  code: string,
  labelEn: string,
  labelVi: string,
  sectionId: CrfSectionId,
  subSectionEn: string,
  subSectionVi: string,
  panelGroup: CrfOcrField["panelGroup"],
  printedValue: string,
  unit: string,
  referenceRange: string,
  flag: ClinicalFlag,
  confidence: number,
  options?: {
    printedSecondaryValue?: string;
    clinicalNoteEn?: string;
    clinicalNoteVi?: string;
  }
): CrfOcrField {
  const status = getInitialOcrTierStatus(confidence);
  return {
    id,
    code,
    labelEn,
    labelVi,
    sectionId,
    subSectionEn,
    subSectionVi,
    panelGroup,
    // < 80% confidence leaves the input blank so the user checks the original scan and enters it manually
    value: status === "manual_required" ? "" : printedValue,
    printedValue,
    secondaryValue:
      status === "manual_required"
        ? ""
        : options?.printedSecondaryValue,
    printedSecondaryValue: options?.printedSecondaryValue,
    unit,
    referenceRange,
    flag,
    confidence,
    status,
    clinicalNoteEn: options?.clinicalNoteEn,
    clinicalNoteVi: options?.clinicalNoteVi,
  };
}

function makeBlotRow(
  id: string,
  code: string,
  name: string,
  panel: "ana23" | "myositis16",
  printedResult: "Negative" | "Positive" | "Borderline",
  printedIntensity: string,
  confidence: number
): CrfAntibodyBlotRow {
  const status = getInitialOcrTierStatus(confidence);
  return {
    id,
    code,
    name,
    panel,
    result: status === "manual_required" ? "" : printedResult,
    printedResult,
    intensity: status === "manual_required" ? "" : printedIntensity,
    printedIntensity,
    confidence,
    status,
  };
}

export function buildDefaultEularAcrCriteria(
  checkedIds: string[] = []
): EularAcrCriterionItem[] {
  const items: Omit<EularAcrCriterionItem, "checked">[] = [
    // Clinical Domains
    {
      id: "eular-fever",
      domainId: "constitutional",
      domainCategory: "clinical",
      domainLabelEn: "Constitutional",
      domainLabelVi: "Toàn thân",
      labelEn: "Fever (>38.3°C)",
      labelVi: "Sốt (>38.3°C)",
      weight: 2,
    },
    {
      id: "eular-leukopenia",
      domainId: "hematologic",
      domainCategory: "clinical",
      domainLabelEn: "Hematologic",
      domainLabelVi: "Huyết học",
      labelEn: "Leukopenia (<4.0 G/L)",
      labelVi: "Giảm bạch cầu (<4.0 G/L)",
      weight: 3,
    },
    {
      id: "eular-thrombocytopenia",
      domainId: "hematologic",
      domainCategory: "clinical",
      domainLabelEn: "Hematologic",
      domainLabelVi: "Huyết học",
      labelEn: "Thrombocytopenia (<100 G/L)",
      labelVi: "Giảm tiểu cầu (<100 G/L)",
      weight: 4,
    },
    {
      id: "eular-hemolysis",
      domainId: "hematologic",
      domainCategory: "clinical",
      domainLabelEn: "Hematologic",
      domainLabelVi: "Huyết học",
      labelEn: "Autoimmune hemolysis",
      labelVi: "Tan máu tự miễn",
      weight: 4,
    },
    {
      id: "eular-delirium",
      domainId: "neuropsychiatric",
      domainCategory: "clinical",
      domainLabelEn: "Neuropsychiatric",
      domainLabelVi: "Tâm thần kinh",
      labelEn: "Delirium",
      labelVi: "Mê sảng",
      weight: 2,
    },
    {
      id: "eular-psychosis",
      domainId: "neuropsychiatric",
      domainCategory: "clinical",
      domainLabelEn: "Neuropsychiatric",
      domainLabelVi: "Tâm thần kinh",
      labelEn: "Psychosis",
      labelVi: "Loạn thần",
      weight: 3,
    },
    {
      id: "eular-seizure",
      domainId: "neuropsychiatric",
      domainCategory: "clinical",
      domainLabelEn: "Neuropsychiatric",
      domainLabelVi: "Tâm thần kinh",
      labelEn: "Seizure",
      labelVi: "Co giật",
      weight: 5,
    },
    {
      id: "eular-alopecia",
      domainId: "mucocutaneous",
      domainCategory: "clinical",
      domainLabelEn: "Mucocutaneous",
      domainLabelVi: "Da và Niêm mạc",
      labelEn: "Non-scarring alopecia",
      labelVi: "Rụng tóc không sẹo",
      weight: 2,
    },
    {
      id: "eular-oral-ulcers",
      domainId: "mucocutaneous",
      domainCategory: "clinical",
      domainLabelEn: "Mucocutaneous",
      domainLabelVi: "Da và Niêm mạc",
      labelEn: "Oral ulcers",
      labelVi: "Loét miệng",
      weight: 2,
    },
    {
      id: "eular-subacute-discoid",
      domainId: "mucocutaneous",
      domainCategory: "clinical",
      domainLabelEn: "Mucocutaneous",
      domainLabelVi: "Da và Niêm mạc",
      labelEn: "Subacute cutaneous OR discoid lupus",
      labelVi: "Lupus da bán cấp HOẶC dạng đĩa",
      weight: 4,
    },
    {
      id: "eular-acute-cutaneous",
      domainId: "mucocutaneous",
      domainCategory: "clinical",
      domainLabelEn: "Mucocutaneous",
      domainLabelVi: "Da và Niêm mạc",
      labelEn: "Acute cutaneous lupus (Malar rash / Generalized)",
      labelVi: "Lupus da cấp tính (Ban cánh bướm / Lan tỏa)",
      weight: 6,
    },
    {
      id: "eular-effusion",
      domainId: "serosal",
      domainCategory: "clinical",
      domainLabelEn: "Serosal",
      domainLabelVi: "Thanh mạc",
      labelEn: "Pleural or pericardial effusion",
      labelVi: "Tràn dịch màng phổi hoặc màng ngoài tim",
      weight: 5,
    },
    {
      id: "eular-pericarditis",
      domainId: "serosal",
      domainCategory: "clinical",
      domainLabelEn: "Serosal",
      domainLabelVi: "Thanh mạc",
      labelEn: "Acute pericarditis",
      labelVi: "Viêm màng ngoài tim cấp",
      weight: 6,
    },
    {
      id: "eular-joint",
      domainId: "musculoskeletal",
      domainCategory: "clinical",
      domainLabelEn: "Musculoskeletal",
      domainLabelVi: "Cơ xương khớp",
      labelEn: "Joint involvement (Synovitis or tenderness in ≥2 joints)",
      labelVi: "Tổn thương khớp (Viêm màng hoạt dịch hoặc đau ≥2 khớp)",
      weight: 6,
    },
    {
      id: "eular-proteinuria",
      domainId: "renal",
      domainCategory: "clinical",
      domainLabelEn: "Renal",
      domainLabelVi: "Thận",
      labelEn: "Proteinuria >0.5 g/24h",
      labelVi: "Protein niệu >0.5 g/24h",
      weight: 4,
    },
    {
      id: "eular-biopsy-2-5",
      domainId: "renal",
      domainCategory: "clinical",
      domainLabelEn: "Renal",
      domainLabelVi: "Thận",
      labelEn: "Renal biopsy with Class II or V lupus nephritis",
      labelVi: "Sinh thiết thận: Viêm thận lupus Nhóm II hoặc V",
      weight: 8,
    },
    {
      id: "eular-biopsy-3-4",
      domainId: "renal",
      domainCategory: "clinical",
      domainLabelEn: "Renal",
      domainLabelVi: "Thận",
      labelEn: "Renal biopsy with Class III or IV lupus nephritis",
      labelVi: "Sinh thiết thận: Viêm thận lupus Nhóm III hoặc IV",
      weight: 10,
    },
    // Immunological Domains
    {
      id: "eular-apl",
      domainId: "antiphospholipid",
      domainCategory: "immunological",
      domainLabelEn: "Antiphospholipid antibodies",
      domainLabelVi: "Kháng thể kháng phospholipid",
      labelEn:
        "Anti-cardiolipin antibody OR Anti-β2GP1 antibody OR Lupus anticoagulant",
      labelVi:
        "Kháng thể Anti-cardiolipin HOẶC Anti-β2GP1 HOẶC Kháng đông Lupus (LAC)",
      weight: 2,
    },
    {
      id: "eular-comp-single",
      domainId: "complement",
      domainCategory: "immunological",
      domainLabelEn: "Complement proteins",
      domainLabelVi: "Protein bổ thể",
      labelEn: "Low C3 OR low C4",
      labelVi: "Giảm C3 HOẶC giảm C4",
      weight: 3,
    },
    {
      id: "eular-comp-both",
      domainId: "complement",
      domainCategory: "immunological",
      domainLabelEn: "Complement proteins",
      domainLabelVi: "Protein bổ thể",
      labelEn: "Low C3 AND low C4",
      labelVi: "Giảm đồng thời cả C3 VÀ C4",
      weight: 4,
    },
    {
      id: "eular-sle-ab",
      domainId: "sle_specific_ab",
      domainCategory: "immunological",
      domainLabelEn: "SLE-specific antibodies",
      domainLabelVi: "Kháng thể đặc hiệu SLE",
      labelEn: "Anti-dsDNA antibody OR Anti-Smith (Sm) antibody",
      labelVi: "Kháng thể Anti-dsDNA HOẶC Kháng thể Anti-Smith (Sm)",
      weight: 6,
    },
  ];

  return items.map((item) => ({
    ...item,
    checked: checkedIds.includes(item.id),
  }));
}

export function buildDefaultSledai2kCriteria(
  checkedIds: string[] = []
): Sledai2kCriterionItem[] {
  const items: Omit<Sledai2kCriterionItem, "checked">[] = [
    {
      id: "sledai-seizure",
      weight: 8,
      criterionEn: "Seizure",
      criterionVi: "Co giật",
      definitionEn:
        "Recent onset. Excludes metabolic, infectious, or drug-related causes.",
      definitionVi:
        "Khởi phát gần đây. Loại trừ nguyên nhân chuyển hóa, nhiễm trùng hoặc do thuốc.",
    },
    {
      id: "sledai-psychosis",
      weight: 8,
      criterionEn: "Psychosis",
      criterionVi: "Loạn thần",
      definitionEn:
        "Altered ability to function in normal activities due to a severe disturbance in reality testing. Includes hallucinations, incoherence, loose associations, illogical thinking, poor thought content, or bizarre/disorganized behavior. Excludes uremia and drug-related causes.",
      definitionVi:
        "Rối loạn khả năng hoạt động bình thường do suy giảm nghiêm trọng nhận thức thực tại (ảo giác, rời rạc, tư duy phi logic, hành vi kỳ dị/vô tổ chức). Loại trừ tăng ure máu và do thuốc.",
    },
    {
      id: "sledai-obs",
      weight: 8,
      criterionEn: "Organic Brain Syndrome",
      criterionVi: "Hội chứng não thực tổn",
      definitionEn:
        "Altered mental function with impaired orientation, memory, or other intellectual functions, with rapid onset and fluctuating clinical features, plus at least two of the following: perceptual disturbance, incoherent speech, insomnia or daytime drowsiness, or increased/decreased psychomotor activity. Excludes drug-related, infectious, or metabolic causes.",
      definitionVi:
        "Thay đổi chức năng tâm thần kèm suy giảm định hướng, trí nhớ hoặc trí tuệ, khởi phát nhanh và diễn biến dao động, kèm ít nhất 2 dấu hiệu: rối loạn tri giác, nói rời rạc, mất ngủ/buồn ngủ ban ngày, hoặc tăng/giảm hoạt động tâm thần vận động. Loại trừ do thuốc, nhiễm trùng hoặc chuyển hóa.",
    },
    {
      id: "sledai-visual",
      weight: 8,
      criterionEn: "Visual Disturbance",
      criterionVi: "Rối loạn thị giác",
      definitionEn:
        "SLE-related retinal changes. Includes cytoid bodies, retinal hemorrhages, serous exudates or choroidal bleeding, or optic neuritis. Excludes drug-related, hypertensive, or infectious causes.",
      definitionVi:
        "Biến đổi võng mạc liên quan SLE (thể cytoid, xuất huyết võng mạc, tiết dịch thanh dịch hoặc xuất huyết hắc mạc, hoặc viêm dây thần kinh thị giác). Loại trừ do thuốc, tăng huyết áp hoặc nhiễm trùng.",
    },
    {
      id: "sledai-cranial",
      weight: 8,
      criterionEn: "Cranial Nerve Disorder",
      criterionVi: "Bệnh lý dây thần kinh sọ",
      definitionEn:
        "New onset of sensory or motor neuropathy involving cranial nerves.",
      definitionVi:
        "Khởi phát mới bệnh dây thần kinh cảm giác hoặc vận động liên quan các dây thần kinh sọ.",
    },
    {
      id: "sledai-headache",
      weight: 8,
      criterionEn: "Lupus Headache",
      criterionVi: "Đau đầu Lupus",
      definitionEn:
        "Severe, persistent headache; may be migraine-type, but must be non-responsive to narcotic analgesics.",
      definitionVi:
        "Đau đầu dữ dội, dai dẳng; có thể dạng migraine nhưng không đáp ứng với thuốc giảm đau gây nghiện.",
    },
    {
      id: "sledai-cva",
      weight: 8,
      criterionEn: "CVA (Cerebrovascular Accident)",
      criterionVi: "Tai biến mạch máu não (CVA)",
      definitionEn:
        "New onset of cerebrovascular event. Excludes arteriosclerosis.",
      definitionVi:
        "Khởi phát mới biến cố mạch máu não. Loại trừ do xơ vữa động mạch.",
    },
    {
      id: "sledai-vasculitis",
      weight: 8,
      criterionEn: "Vasculitis",
      criterionVi: "Viêm mạch",
      definitionEn:
        "Ulceration, gangrene, tender fingertip nodules, periungual infarction, splinter hemorrhages, or biopsy/angiogram evidence of vasculitis.",
      definitionVi:
        "Loét, hoại thư, nốt đau đầu ngón tay, nhồi máu quanh móng, xuất huyết mảnh dăm hoặc bằng chứng sinh thiết/chụp mạch.",
    },
    {
      id: "sledai-arthritis",
      weight: 4,
      criterionEn: "Arthritis",
      criterionVi: "Viêm khớp",
      definitionEn:
        "≥2 joints with pain and signs of inflammation (i.e., tenderness, swelling, or effusion).",
      definitionVi:
        "≥2 khớp có đau và dấu hiệu viêm (ấn đau, sưng hoặc tràn dịch).",
    },
    {
      id: "sledai-myositis",
      weight: 4,
      criterionEn: "Myositis",
      criterionVi: "Viêm cơ",
      definitionEn:
        "Proximal muscle weakness, elevated CK/aldolase, or EMG changes or muscle biopsy findings indicative of myositis.",
      definitionVi:
        "Yếu cơ gốc chi, tăng CK/aldolase, hoặc thay đổi điện cơ (EMG)/sinh thiết cơ điển hình của viêm cơ.",
    },
    {
      id: "sledai-casts",
      weight: 4,
      criterionEn: "Urinary Casts",
      criterionVi: "Trụ niệu",
      definitionEn: "Heme-granular or red blood cell casts.",
      definitionVi: "Trụ hạt chứa sắc tố máu hoặc trụ hồng cầu trong nước tiểu.",
    },
    {
      id: "sledai-hematuria",
      weight: 4,
      criterionEn: "Hematuria",
      criterionVi: "Hồng cầu niệu (Tiểu máu)",
      definitionEn:
        ">5 red blood cells/high power field. Excludes stones, infection, or other causes.",
      definitionVi:
        ">5 hồng cầu/vi trường độ phóng đại cao (HPF). Loại trừ sỏi, nhiễm trùng hoặc nguyên nhân khác.",
    },
    {
      id: "sledai-proteinuria",
      weight: 4,
      criterionEn: "Proteinuria",
      criterionVi: "Protein niệu",
      definitionEn: ">0.5 g/24 hours.",
      definitionVi: ">0.5 g/24 giờ.",
    },
    {
      id: "sledai-pyuria",
      weight: 4,
      criterionEn: "Pyuria",
      criterionVi: "Bạch cầu niệu (Tiểu mủ)",
      definitionEn:
        ">5 white blood cells/high power field. Excludes infection.",
      definitionVi:
        ">5 bạch cầu/vi trường độ phóng đại cao (HPF). Loại trừ nhiễm trùng.",
    },
    {
      id: "sledai-rash",
      weight: 2,
      criterionEn: "Rash",
      criterionVi: "Ban da",
      definitionEn: "Inflammatory-type rash.",
      definitionVi: "Ban da kiểu viêm.",
    },
    {
      id: "sledai-alopecia",
      weight: 2,
      criterionEn: "Alopecia",
      criterionVi: "Rụng tóc",
      definitionEn: "Patchy or diffuse hair loss.",
      definitionVi: "Rụng tóc từng mảng hoặc lan tỏa.",
    },
    {
      id: "sledai-ulcers",
      weight: 2,
      criterionEn: "Mucosal Ulcers",
      criterionVi: "Loét niêm mạc",
      definitionEn: "Nasal or oral ulcerations.",
      definitionVi: "Loét niêm mạc mũi hoặc miệng.",
    },
    {
      id: "sledai-pleurisy",
      weight: 2,
      criterionEn: "Pleurisy",
      criterionVi: "Viêm màng phổi",
      definitionEn:
        "Pleuritic chest pain with pleural rub, effusion, or pleural thickening.",
      definitionVi:
        "Đau ngực kiểu màng phổi kèm tiếng cọ màng phổi, tràn dịch hoặc dày màng phổi.",
    },
    {
      id: "sledai-pericarditis",
      weight: 2,
      criterionEn: "Pericarditis",
      criterionVi: "Viêm màng ngoài tim",
      definitionEn:
        "Pericardial-type pain with at least one of the following: pericardial rub, pericardial effusion, or ECG/echocardiogram confirmation.",
      definitionVi:
        "Đau ngực kiểu màng ngoài tim kèm ít nhất: tiếng cọ, tràn dịch màng ngoài tim hoặc xác nhận trên ECG/Siêu âm tim.",
    },
    {
      id: "sledai-low-comp",
      weight: 2,
      criterionEn: "Low Complement",
      criterionVi: "Giảm bổ thể",
      definitionEn:
        "Low C3, C4, or CH50 below the lower limit of normal.",
      definitionVi: "Giảm C3, C4 hoặc CH50 dưới giới hạn dưới bình thường.",
    },
    {
      id: "sledai-dna",
      weight: 2,
      criterionEn: "Increased DNA binding",
      criterionVi: "Tăng gắn kết DNA (Anti-dsDNA)",
      definitionEn:
        "Increased DNA binding by Farr assay above the normal range.",
      definitionVi: "Tăng gắn kết DNA theo xét nghiệm Farr vượt giới hạn bình thường.",
    },
    {
      id: "sledai-fever",
      weight: 1,
      criterionEn: "Fever",
      criterionVi: "Sốt",
      definitionEn: ">38°C. Excludes infection.",
      definitionVi: ">38°C. Loại trừ nhiễm trùng.",
    },
    {
      id: "sledai-thrombocytopenia",
      weight: 1,
      criterionEn: "Thrombocytopenia",
      criterionVi: "Giảm tiểu cầu",
      definitionEn: "<100 x 10⁹/L. Excludes drug-related causes.",
      definitionVi: "<100 x 10⁹/L (G/L). Loại trừ nguyên nhân do thuốc.",
    },
    {
      id: "sledai-leukopenia",
      weight: 1,
      criterionEn: "Leukopenia",
      criterionVi: "Giảm bạch cầu",
      definitionEn: "<3 x 10⁹/L. Excludes drug-related causes.",
      definitionVi: "<3 x 10⁹/L (G/L). Loại trừ nguyên nhân do thuốc.",
    },
  ];

  return items.map((item) => ({
    ...item,
    checked: checkedIds.includes(item.id),
  }));
}

export function buildSkinMucosaItems(
  activeMap: Record<string, string> = {}
): CrfCheckItem[] {
  const defs: [string, string, string][] = [
    ["skin-malar", "Butterfly rash / Malar rash", "Ban cánh bướm / Ban gò má"],
    ["skin-puffy", "Puffy fingers / Dactylitis", "Ngón tay sưng phồng / Viêm ngón"],
    ["skin-calcinosis", "Calcinosis", "Lắng đọng canxi dưới da (Calcinosis)"],
    ["skin-sclerosis", "Skin sclerosis", "Xơ cứng da"],
    ["skin-alopecia", "Alopecia", "Rụng tóc"],
    ["skin-digital-ulcers", "Digital ulcers", "Loét đầu ngón"],
    ["skin-oral-ulcers", "Oral ulcers", "Loét miệng"],
    ["skin-raynaud", "Raynaud", "Hiện tượng Raynaud"],
    ["skin-vasculitis", "Cutaneous vasculitis", "Viêm mạch máu da"],
    ["skin-livedoid", "Livedoid vasculopathy", "Bệnh mạch máu dạng mạng lưới (Livedoid)"],
    ["skin-v-sign", "V sign", "Dấu hiệu chữ V (V sign vùng cổ ngực)"],
    ["skin-shawl", "Shawl sign", "Dấu hiệu khăn choàng (Shawl sign)"],
    ["skin-gottron", "Gottron's sign", "Dấu hiệu Gottron"],
    ["skin-heliotrope", "Heliotrope rash", "Ban Heliotrope quanh mắt"],
    ["skin-mechanic", "Mechanic's hands", "Bàn tay người thợ cơ khí (Mechanic's hands)"],
    ["skin-inverse-gottron", "Inverse Gottron sign", "Dấu hiệu Gottron đảo ngược"],
    [
      "skin-photosensitive",
      "Photosensitive rash / Photosensitivity",
      "Ban nhạy cảm ánh sáng",
    ],
    ["skin-others", "Others", "Biểu hiện da/niêm mạc khác"],
  ];

  return defs.map(([id, labelEn, labelVi]) => ({
    id,
    labelEn,
    labelVi,
    checked: id in activeMap,
    specify: activeMap[id] || "",
  }));
}

export function buildCardiovascularItems(
  activeMap: Record<string, string> = {}
): CrfCheckItem[] {
  const defs: [string, string, string][] = [
    ["cv-myocarditis", "Myocarditis", "Viêm cơ tim"],
    ["cv-pericarditis", "Pericarditis", "Viêm màng ngoài tim"],
    ["cv-endocarditis", "Endocarditis", "Viêm nội tâm mạc (Libman-Sacks)"],
    ["cv-mi", "Myocardial infarction", "Nhồi máu cơ tim"],
    ["cv-effusion", "Pericardial effusion", "Tràn dịch màng ngoài tim"],
    ["cv-pe", "Pulmonary embolism", "Thuyên tắc động mạch phổi"],
    [
      "cv-pah",
      "Elevated Pulmonary artery pressure",
      "Tăng áp lực động mạch phổi",
    ],
    ["cv-others", "Others", "Bất thường tim mạch khác"],
  ];

  return defs.map(([id, labelEn, labelVi]) => ({
    id,
    labelEn,
    labelVi,
    checked: id in activeMap,
    specify: activeMap[id] || "",
  }));
}

export function buildNeuropsychiatricItems(
  activeMap: Record<string, string> = {}
): CrfCheckItem[] {
  const defs: [string, string, string][] = [
    ["np-seizures", "Seizures", "Co giật / Động kinh"],
    ["np-headache", "Headache", "Đau đầu Lupus"],
    ["np-psychosis", "Psychosis", "Loạn thần"],
    ["np-cranial", "Cranial neuropathy", "Bệnh dây thần kinh sọ"],
    [
      "np-embolism",
      "Cranial arterial/venous embolism",
      "Thuyên tắc động/tĩnh mạch nội sọ",
    ],
    ["np-others", "Others", "Rối loạn tâm thần kinh khác"],
  ];

  return defs.map(([id, labelEn, labelVi]) => ({
    id,
    labelEn,
    labelVi,
    checked: id in activeMap,
    specify: activeMap[id] || "",
  }));
}

export function buildGiItems(
  activeMap: Record<string, string> = {}
): CrfCheckItem[] {
  const defs: [string, string, string][] = [
    ["gi-constipation", "Constipation", "Táo bón"],
    ["gi-diarrhoea", "Diarrhoea", "Tiêu chảy"],
    ["gi-ibd", "IBD (UC/Crohn)", "Bệnh viêm ruột (IBD: UC/Crohn)"],
    ["gi-gerd", "GERD", "Trào ngược dạ dày thực quản (GERD)"],
    ["gi-hepatomegaly", "Hepatomegaly", "Gan to"],
    ["gi-splenomegaly", "Splenomegaly", "Lách to"],
    ["gi-uc", "Ulcerative colitis", "Viêm loét đại tràng"],
    ["gi-peptic", "Peptic ulcer", "Loét dạ dày tá tràng"],
    ["gi-dysmotility", "Oesophageal dysmotility", "Rối loạn nhu động thực quản"],
    ["gi-others", "Others", "Biểu hiện tiêu hóa khác"],
  ];

  return defs.map(([id, labelEn, labelVi]) => ({
    id,
    labelEn,
    labelVi,
    checked: id in activeMap,
    specify: activeMap[id] || "",
  }));
}

export const INITIAL_CRF_PATIENTS: SleCrfPatientRecord[] = [
  {
    id: "crf-pat-084",
    uploadedFiles: [
      { id: "f-084-1", name: "Sample_Hospital_Lab_Dossier.pdf", url: null, isImage: false },
    ],
    submittedAt: "2026-11-10 10:30",
    studyId: "VN-0084-26",
    patientName: "Tran Thi Mai",
    age: "29",
    gender: "Female",
    icfSignedDate: "15/10/2026",
    heightCm: "158",
    weightKg: "51.5",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Le Thi Huong",
    lastUpdated: "2026-11-10 10:30 ICT",
    signedOffBy: null,
    signedOffRole: null,

    // Section 2: Medical History
    malignantDisease: "NO",
    malignantSpecify: "",
    otherComorbidities: "YES",
    otherComorbiditiesSpecify:
      "Secondary hypertension controlled on Amlodipine 5mg; Osteopenia",
    familyAutoimmuneHistory: "YES",
    familyRelatives: {
      Father: false,
      Mother: true,
      Brother: false,
      Sister: true,
      Child: false,
      Others: false,
    },
    familyDiseaseSpecify:
      "Mother: Hashimoto thyroiditis; Older sister: Rheumatoid arthritis",
    fever: "YES",
    feverTempC: "38.6",
    feverOnsetDate: "02/11/2026",
    feverType: "prolonged",
    feverTypeSpecify: "",
    historyOfInfection: "YES",
    infectionEpisodes: [
      {
        id: "inf-1",
        factor: "Herpes Zoster (T5 dermatome, resolved prior to flare)",
        dateOfOnset: "10/08/2026",
        dateOfNormalization: "28/08/2026",
      },
    ],
    treatmentStatus: "YES",
    treatments: [
      {
        id: "trt-1",
        group: "Medication",
        name: "Hydroxychloroquine (Plaquenil)",
        route: "PO (Oral)",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "01/03/2025 – Ongoing",
      },
      {
        id: "trt-2",
        group: "Medication",
        name: "Methylprednisolone (Medrol)",
        route: "PO (Oral)",
        dose: "16 mg",
        frequency: "Once daily (morning)",
        duration: "02/11/2026 – Ongoing",
      },
      {
        id: "trt-3",
        group: "Medication",
        name: "Mycophenolate Mofetil (CellCept)",
        route: "PO (Oral)",
        dose: "1000 mg",
        frequency: "BID (2g/day)",
        duration: "08/11/2026 – Ongoing",
      },
      {
        id: "trt-4",
        group: "Vaccine",
        name: "Inactivated Influenza Quadrivalent Vaccine",
        route: "IM",
        dose: "0.5 mL",
        frequency: "Single annual dose",
        duration: "20/09/2026",
      },
    ],

    // Section 3: Organs Damage
    skinMucosaAbnormality: "YES",
    skinMucosaItems: buildSkinMucosaItems({
      "skin-malar": "Erythematous malar rash sparing nasolabial folds",
      "skin-alopecia": "Diffuse non-scarring temporal hair thinning",
      "skin-oral-ulcers": "2 painless palatal mucosal ulcerations",
      "skin-photosensitive": "Triggered by UV exposure",
    }),
    muscleDamage: "NO",
    muscleBiopsyOther: "NO",
    muscleBiopsySpecify: "",
    jointsDamage: "YES",
    swollenJointsCount: "4",
    tenderJointsCount: "6",
    vasScore: "65",
    abnormalXray: "NO",
    abnormalXraySpecify: "No erosive changes on bilateral hand X-ray",
    abnormalUltrasound: "YES",
    abnormalUltrasoundSpecify:
      "Grade 2 synovial hypertrophy with Power Doppler signal in bilateral wrists & MCP 2-3",
    jointDeformity: "NO",
    jointDeformitySpecify: "",
    jointsOther: "NO",
    jointsOtherSpecify: "",
    kidneysDamage: "YES",
    renalBiopsyPerformed: "YES",
    renalBiopsyNote: "Ultrasound-guided percutaneous renal biopsy (18 glomeruli)",
    renalBiopsyClasses: ["Class IV", "IVA"],
    kidneysOther: "NO",
    kidneysOtherSpecify: "",
    haematologicalDisorders: "YES",
    haematologicalSpecify:
      "Leukopenia (2.85 G/L), Lymphopenia (0.72 G/L), Mild normocytic anemia, Positive Direct Coombs",
    cardiovascularAbnormality: "YES",
    cardiovascularItems: buildCardiovascularItems({
      "cv-pericarditis": "Mild anterior pericardial thickening on Transthoracic Echo",
      "cv-effusion": "Trivial pericardial effusion (4mm, no hemodynamic compromise)",
    }),
    lungDamage: "NO",
    lungIld: false,
    lungIldPatterns: [],
    lungPleuritis: false,
    lungPleuritisSpecify: "",
    lungOther: false,
    lungOtherSpecify: "",
    neuropsychiatricDisorders: "NO",
    neuropsychiatricItems: buildNeuropsychiatricItems(),
    giDisorders: "YES",
    giItems: buildGiItems({
      "gi-gerd": "Mild steroid-associated gastroesophageal reflux",
    }),

    // OCR-Extracted Lab & Instrument Fields (demonstrating >90% Auto-Approve, 80-90% Verify, <80% Blank Manual Entry)
    ocrFields: [
      // Section 2: Pregnancy & Infectious Screening
      makeOcrField(
        "crf-betahcg",
        "BETA-HCG",
        "Beta-hCG (Serum Pregnancy)",
        "Beta-hCG (Xét nghiệm thai huyết thanh)",
        "medical_history",
        "Pregnancy",
        "Thai kỳ",
        "infectious",
        "< 1.2 (Negative)",
        "mIU/mL",
        "< 5.0 mIU/mL",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-cmv-igm",
        "CMV-IGM",
        "CMV IgM",
        "CMV IgM",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "0.24 (Negative)",
        "Index",
        "< 0.85",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-cmv-igg",
        "CMV-IGG",
        "CMV IgG",
        "CMV IgG",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "118.4 (Positive)",
        "AU/mL",
        "< 6.0 AU/mL",
        "Positive",
        95
      ),
      makeOcrField(
        "crf-cmv-pcr",
        "CMV-PCR",
        "CMV PCR* (*if IgM positive)",
        "CMV PCR* (*nếu IgM dương tính)",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Not required (IgM Neg)",
        "copies/mL",
        "Undetected",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-hsv-igm",
        "HSV12-IGM",
        "HSV 1+2 IgM",
        "HSV 1+2 IgM",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "0.31 (Negative)",
        "Index",
        "< 0.90",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-hsv-igg",
        "HSV12-IGG",
        "HSV 1+2 IgG",
        "HSV 1+2 IgG",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "14.2 (Positive)",
        "Index",
        "< 0.90",
        "Positive",
        94
      ),
      makeOcrField(
        "crf-ebv-igm",
        "EBV-IGM",
        "EBV IgM",
        "EBV IgM",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Negative",
        "Qualitative",
        "Negative",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-ebv-pcr",
        "EBV-PCR",
        "EBV Real-time PCR*",
        "EBV Real-time PCR*",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Undetected",
        "copies/mL",
        "Undetected",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-hbsag",
        "HBSAG",
        "HBsAg",
        "HBsAg",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Non-reactive (0.18)",
        "S/CO",
        "< 1.00",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-antihbc",
        "ANTI-HBC",
        "Anti-HBc total",
        "Anti-HBc total",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Non-reactive",
        "Qualitative",
        "Non-reactive",
        "Normal",
        93
      ),
      makeOcrField(
        "crf-antihbs",
        "ANTI-HBS",
        "Anti-HBs",
        "Anti-HBs",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "185.0",
        "mIU/mL",
        "> 10.0 Protective",
        "Positive",
        96
      ),
      makeOcrField(
        "crf-hcv",
        "HCV-AGAB",
        "HCV Ag/Ab",
        "HCV Ag/Ab",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Non-reactive",
        "S/CO",
        "< 1.00",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-hiv",
        "HIV-AGAB",
        "HIV Ag/Ab",
        "HIV Ag/Ab",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Non-reactive",
        "S/CO",
        "< 1.00",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-quantiferon",
        "QFT-TB",
        "QuantiFERON-TB Gold Plus",
        "QuantiFERON-TB Gold Plus",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Negative (0.04 IU/mL)",
        "IU/mL",
        "< 0.35 IU/mL",
        "Normal",
        86,
        {
          clinicalNoteEn:
            "86% OCR confidence (80–90% tier) — please verify negative IGRA result before biologic/MMF escalation.",
          clinicalNoteVi:
            "Độ tin cậy OCR 86% (nhóm 80–90%) — vui lòng xác nhận lại kết quả IGRA âm tính trước khi tăng liều ức chế miễn dịch.",
        }
      ),

      // Section 3.2: Muscle
      makeOcrField(
        "crf-ck",
        "CK-TOTAL",
        "Creatine kinase (CK)",
        "Creatine kinase (CK)",
        "organs_damage",
        "Muscle",
        "Cơ",
        "organs",
        "68",
        "U/L",
        "29 – 168 U/L",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-ldh",
        "LDH",
        "Lactate dehydrogenase (LDH)",
        "Lactate dehydrogenase (LDH)",
        "organs_damage",
        "Muscle",
        "Cơ",
        "organs",
        "218",
        "U/L",
        "125 – 220 U/L",
        "Normal",
        94
      ),
      makeOcrField(
        "crf-emg",
        "EMG",
        "Electromyography (EMG)",
        "Điện cơ đồ (EMG)",
        "organs_damage",
        "Muscle",
        "Cơ",
        "organs",
        "Normal motor unit potentials",
        "Report",
        "No myopathic pattern",
        "Normal",
        92
      ),
      makeOcrField(
        "crf-muscle-mri",
        "MRI-MUSCLE",
        "Muscle MRI",
        "Cộng hưởng từ cơ (Muscle MRI)",
        "organs_damage",
        "Muscle",
        "Cơ",
        "organs",
        "Not performed",
        "Report",
        "Normal",
        "Normal",
        99
      ),

      // Section 3.4: Kidneys (Synced with Report #2)
      makeOcrField(
        "crf-upcr",
        "UPCR-SPOT",
        "Urine Protein Creatinine Ratio (UPCR)",
        "Tỷ lệ Protein/Creatinine niệu (UPCR)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "148",
        "mg/mmol",
        "< 15 mg/mmol",
        "High",
        84,
        {
          clinicalNoteEn:
            "84% OCR confidence (80–90% tier): Handwritten lab note near value '148' — verify against original scan.",
          clinicalNoteVi:
            "Độ tin cậy OCR 84% (nhóm 80–90%): Có chữ viết tay gần số '148' — vui lòng xác nhận lại.",
        }
      ),
      makeOcrField(
        "crf-hematuria",
        "URINE-RBC",
        "Haematuria (RBC in urine)",
        "Hồng cầu niệu (RBC trong nước tiểu)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "18",
        "cells/HPF",
        "0 – 4 cells/HPF",
        "High",
        74,
        {
          clinicalNoteEn:
            "74% OCR confidence (<80% tier): Smudged microscopy printout on original scan. Check scan ('18 cells/HPF') and enter manually.",
          clinicalNoteVi:
            "Độ tin cậy OCR 74% (nhóm <80%): Bản in soi cặn bị mờ. Hãy kiểm tra bản gốc ('18 cells/HPF') và nhập thủ công.",
        }
      ),
      makeOcrField(
        "crf-pyuria",
        "URINE-WBC",
        "Pyuria (WBC in urine)",
        "Bạch cầu niệu (WBC trong nước tiểu)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "8",
        "cells/HPF",
        "0 – 5 cells/HPF",
        "High",
        91
      ),
      makeOcrField(
        "crf-urea",
        "SER-UREA",
        "Urea",
        "Urea máu",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "6.8",
        "mmol/L",
        "2.8 – 7.2 mmol/L",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-creatinine",
        "SER-CREAT",
        "Creatinine",
        "Creatinine huyết thanh",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "86.0",
        "µmol/L",
        "45.0 – 84.0 µmol/L",
        "High",
        98
      ),
      makeOcrField(
        "crf-egfr",
        "EGFR-CKDEPI",
        "Estimated glomerular filtration rate (eGFR)",
        "Độ lọc cầu thận ước tính (eGFR)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "78",
        "ml/min/1.73 m²",
        "> 90 ml/min/1.73 m²",
        "Low",
        97
      ),
      makeOcrField(
        "crf-up24",
        "UPROT-24H",
        "24 hour Proteinuria",
        "Protein niệu 24 giờ",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "1.35",
        "g/24h",
        "< 0.15 g/24h",
        "High",
        95
      ),
      makeOcrField(
        "crf-albumin",
        "SER-ALB",
        "Albumin",
        "Albumin huyết thanh",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "31.4",
        "g/L",
        "35.0 – 52.0 g/L",
        "Low",
        94
      ),

      // Section 3.5: Haematology (Synced with Report #3)
      makeOcrField(
        "crf-rbc",
        "RBC-COUNT",
        "RBC (T/L)",
        "Số lượng Hồng cầu RBC (T/L)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "3.82",
        "T/L",
        "4.00 – 5.20 T/L",
        "Low",
        96
      ),
      makeOcrField(
        "crf-hb",
        "HGB-CONC",
        "Hb (Hemoglobin)",
        "Huyết sắc tố Hb",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "112",
        "g/L",
        "120 – 155 g/L",
        "Low",
        98
      ),
      makeOcrField(
        "crf-mcv",
        "MCV",
        "MCV",
        "Thể tích trung bình hồng cầu (MCV)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "86.4",
        "fL",
        "80.0 – 100.0 fL",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-mchc",
        "MCHC",
        "MCHC (g/L)",
        "Nồng độ Hb trung bình hồng cầu (MCHC)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "332",
        "g/L",
        "320 – 360 g/L",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-wbc",
        "WBC-TOTAL",
        "WBC",
        "Số lượng Bạch cầu (WBC)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "2.85",
        "G/L",
        "4.00 – 10.00 G/L",
        "Low",
        99
      ),
      makeOcrField(
        "crf-ne",
        "NEU-ABS",
        "NE (Neutrophils)",
        "Bạch cầu đa nhân trung tính (NE)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "1.82",
        "G/L",
        "1.80 – 7.50 G/L",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-ly",
        "ALC-ABS",
        "LY (Lymphocytes)",
        "Bạch cầu Lympho (LY)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "0.72",
        "G/L",
        "1.00 – 4.00 G/L",
        "Low",
        83,
        {
          clinicalNoteEn:
            "83% OCR confidence (80–90% tier): Marked lymphopenia — please verify '0.72 G/L'.",
          clinicalNoteVi:
            "Độ tin cậy OCR 83% (nhóm 80–90%): Giảm lympho rõ rệt — vui lòng xác nhận lại '0.72 G/L'.",
        }
      ),
      makeOcrField(
        "crf-mo",
        "MONO-ABS",
        "MO (Monocytes)",
        "Bạch cầu Mono (MO)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "0.24",
        "G/L",
        "0.20 – 0.80 G/L",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-eo",
        "EOS-ABS",
        "EO (Eosinophils)",
        "Bạch cầu Ái toan (EO)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "0.05",
        "G/L",
        "0.02 – 0.50 G/L",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-ba",
        "BASO-ABS",
        "BA (Basophils)",
        "Bạch cầu Ái kiềm (BA)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "0.02",
        "G/L",
        "0.00 – 0.10 G/L",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-plt",
        "PLT-COUNT",
        "PLT (Platelets)",
        "Số lượng Tiểu cầu (PLT)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "184",
        "G/L",
        "150 – 400 G/L",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-coombs",
        "DAT-COOMBS",
        "Direct Coombs test",
        "Nghiệm pháp Coombs trực tiếp",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "Weak Positive (IgG)",
        "Qualitative",
        "Negative",
        "Positive",
        94
      ),

      // Section 3.7: Lungs (Dual-column PFT values: Measured & % Predicted as in docx)
      makeOcrField(
        "crf-vc",
        "PFT-VC",
        "VC (L)",
        "Dung tích sống VC (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "3.12",
        "L (%Pred)",
        "> 80% Pred",
        "Normal",
        94,
        { printedSecondaryValue: "92%" }
      ),
      makeOcrField(
        "crf-fvc",
        "PFT-FVC",
        "FVC (L)",
        "Dung tích sống gắng sức FVC (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "3.08",
        "L (%Pred)",
        "> 80% Pred",
        "Normal",
        95,
        { printedSecondaryValue: "91%" }
      ),
      makeOcrField(
        "crf-fev1",
        "PFT-FEV1",
        "FEV1 (L)",
        "Thể tích thở ra gắng sức giây đầu FEV1 (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "2.64",
        "L (%Pred)",
        "> 80% Pred",
        "Normal",
        96,
        { printedSecondaryValue: "93%" }
      ),
      makeOcrField(
        "crf-fev1-vc",
        "PFT-FEV1-VC",
        "FEV1/VC (%)",
        "Chỉ số FEV1/VC (%)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "84.6",
        "%",
        "> 70%",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-fev1-fvc",
        "PFT-FEV1-FVC",
        "FEV1/FVC (%)",
        "Chỉ số Gaensler FEV1/FVC (%)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "85.7",
        "%",
        "> 70%",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-tlc",
        "PFT-TLC",
        "TLC (L)",
        "Tổng dung tích phổi TLC (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "4.42",
        "L (%Pred)",
        "80 – 120% Pred",
        "Normal",
        92,
        { printedSecondaryValue: "89%" }
      ),
      makeOcrField(
        "crf-rv",
        "PFT-RV",
        "RV (L)",
        "Thể tích khí cặn RV (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "1.30",
        "L (%Pred)",
        "80 – 120% Pred",
        "Normal",
        91,
        { printedSecondaryValue: "87%" }
      ),
      makeOcrField(
        "crf-rv-tlc",
        "PFT-RV-TLC",
        "RV/TLC",
        "Tỷ lệ RV/TLC (%)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "29.4",
        "%",
        "< 35%",
        "Normal",
        93
      ),
      makeOcrField(
        "crf-va",
        "PFT-VA",
        "VA (L)",
        "Thể tích phế nang VA (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "4.15",
        "L (%Pred)",
        "> 80% Pred",
        "Normal",
        92,
        { printedSecondaryValue: "88%" }
      ),
      makeOcrField(
        "crf-kco",
        "PFT-KCO",
        "Kco Hb (mL/mmHg/Min/L)",
        "Hệ số khuếch tán Kco Hb",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "4.85",
        "mL/mmHg/Min/L",
        "> 80% Pred",
        "Normal",
        91,
        { printedSecondaryValue: "90%" }
      ),
      makeOcrField(
        "crf-dlco",
        "PFT-DLCO",
        "DLCO Hb (or TLco)",
        "Khả năng khuếch tán khí CO (DLCO Hb / TLco)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "20.1",
        "mL/min/mmHg",
        "> 80% Pred",
        "Normal",
        85,
        {
          printedSecondaryValue: "84%",
          clinicalNoteEn:
            "85% OCR confidence (80–90% tier) — verify DLCO Hb value '20.1' and '84%' predicted.",
          clinicalNoteVi:
            "Độ tin cậy OCR 85% (nhóm 80–90%) — vui lòng xác nhận lại giá trị DLCO Hb '20.1' (84%).",
        }
      ),

      // Section 3.9: Gastrointestinal system
      makeOcrField(
        "crf-asat",
        "ASAT-GOT",
        "ASAT (GOT)",
        "Men gan ASAT (GOT)",
        "organs_damage",
        "Gastrointestinal system",
        "Hệ tiêu hóa",
        "organs",
        "24",
        "U/L",
        "< 32 U/L",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-alat",
        "ALAT-GPT",
        "ALAT (GPT)",
        "Men gan ALAT (GPT)",
        "organs_damage",
        "Gastrointestinal system",
        "Hệ tiêu hóa",
        "organs",
        "21",
        "U/L",
        "< 33 U/L",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-ggt",
        "GGT",
        "GGT",
        "Men gan GGT",
        "organs_damage",
        "Gastrointestinal system",
        "Hệ tiêu hóa",
        "organs",
        "29",
        "U/L",
        "< 40 U/L",
        "Normal",
        97
      ),

      // Section 4.1: Core Quantitative Immunology (21 tests from docx)
      makeOcrField(
        "crf-ana-pat",
        "ANA-HEP2",
        "ANA (pattern)",
        "Kháng thể kháng nhân ANA (kiểu hình)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "1:320 Homogeneous",
        "Titer",
        "< 1:80 Negative",
        "Positive",
        98
      ),
      makeOcrField(
        "crf-anticcp",
        "ANTI-CCP",
        "Anti CCP",
        "Kháng thể Anti-CCP",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "4.2",
        "U/mL",
        "< 17.0 U/mL",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-rf",
        "RF-IGM",
        "RF (Rheumatoid Factor)",
        "Yếu tố dạng thấp (RF)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "11.5",
        "IU/mL",
        "< 14.0 IU/mL",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-dsdna",
        "ANTI-DSDNA",
        "dsDNA (ImmunoCAP / ELISA)",
        "Kháng thể kháng dsDNA (ImmunoCAP / ELISA)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "142.5",
        "IU/mL",
        "< 30.0 IU/mL",
        "High",
        96
      ),
      makeOcrField(
        "crf-acl-igg",
        "ACL-IGG",
        "Anticardiolipin IgG",
        "Kháng thể Anticardiolipin IgG",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "28.4",
        "GPL-U/mL",
        "< 20.0 GPL-U/mL",
        "Positive",
        92
      ),
      makeOcrField(
        "crf-acl-igm",
        "ACL-IGM",
        "Anticardiolipin IgM",
        "Kháng thể Anticardiolipin IgM",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "9.1",
        "MPL-U/mL",
        "< 20.0 MPL-U/mL",
        "Normal",
        94
      ),
      makeOcrField(
        "crf-b2gp1-igg",
        "B2GP1-IGG",
        "Anti-beta2-glycoprotein I IgG",
        "Kháng thể Anti-beta2-glycoprotein I IgG",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "6.5",
        "U/mL",
        "< 20.0 U/mL",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-b2gp1-igm",
        "B2GP1-IGM",
        "Anti-beta2-glycoprotein I IgM",
        "Kháng thể Anti-beta2-glycoprotein I IgM",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "4.8",
        "U/mL",
        "< 20.0 U/mL",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-lac-screen",
        "LAC-SCREEN",
        "Lupus anticoagulant screening (LAC/LA screen)",
        "Sàng lọc kháng đông Lupus (LAC/LA screen)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "46.2",
        "sec",
        "31.0 – 44.0 sec",
        "High",
        91
      ),
      makeOcrField(
        "crf-lac-confirm",
        "LAC-CONFIRM",
        "Lupus anticoagulant confirmation (LAC/LA confirm)",
        "Khẳng định kháng đông Lupus (LAC/LA confirm)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "1.28 (Weak Positive)",
        "Normalized Ratio",
        "< 1.20",
        "Positive",
        88,
        {
          clinicalNoteEn:
            "88% OCR confidence (80–90% tier): Borderline dRVVT confirmation ratio — please verify '1.28 (Weak Positive)'.",
          clinicalNoteVi:
            "Độ tin cậy OCR 88% (nhóm 80–90%): Tỷ lệ khẳng định dRVVT ranh giới — vui lòng xác nhận lại '1.28'.",
        }
      ),
      makeOcrField(
        "crf-c3",
        "COMP-C3",
        "C3 (Complement C3)",
        "Bổ thể C3",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "0.58",
        "g/L",
        "0.90 – 1.80 g/L",
        "Low",
        76,
        {
          clinicalNoteEn:
            "76% OCR confidence (<80% tier): Faint thermal decimal print on source report. Please check original scan ('0.58 g/L') and enter manually.",
          clinicalNoteVi:
            "Độ tin cậy OCR 76% (nhóm <80%): Dấu thập phân in nhiệt bị mờ trên bản gốc. Vui lòng kiểm tra bản quét ('0.58 g/L') và nhập thủ công.",
        }
      ),
      makeOcrField(
        "crf-c4",
        "COMP-C4",
        "C4 (Complement C4)",
        "Bổ thể C4",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "0.09",
        "g/L",
        "0.10 – 0.40 g/L",
        "Low",
        82,
        {
          clinicalNoteEn:
            "82% OCR confidence (80–90% tier): Low C4 complement consumption — please click Verify after checking '0.09 g/L'.",
          clinicalNoteVi:
            "Độ tin cậy OCR 82% (nhóm 80–90%): Giảm bổ thể C4 — vui lòng nhấn Xác thực sau khi đối chiếu '0.09 g/L'.",
        }
      ),
      makeOcrField(
        "crf-ige",
        "IGE-TOTAL",
        "IgE",
        "Globulin miễn dịch IgE",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "94.0",
        "IU/mL",
        "< 100.0 IU/mL",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-iga",
        "IGA-SER",
        "IgA",
        "Globulin miễn dịch IgA",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "2.45",
        "g/L",
        "0.70 – 4.00 g/L",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-igg",
        "IGG-SER",
        "IgG",
        "Globulin miễn dịch IgG",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "18.4",
        "g/L",
        "7.00 – 16.00 g/L",
        "High",
        95
      ),
      makeOcrField(
        "crf-igm",
        "IGM-SER",
        "IgM",
        "Globulin miễn dịch IgM",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "1.32",
        "g/L",
        "0.40 – 2.30 g/L",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-il6",
        "IL-6",
        "IL-6 (Interleukin-6)",
        "Interleukin-6 (IL-6)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "14.8",
        "pg/mL",
        "< 7.0 pg/mL",
        "High",
        93
      ),
      makeOcrField(
        "crf-kl6",
        "KL-6",
        "KL-6 (Krebs von den Lungen-6)",
        "Chỉ điểm phổi kẽ KL-6",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "245",
        "U/mL",
        "< 500 U/mL",
        "Normal",
        94
      ),
      makeOcrField(
        "crf-crp",
        "HS-CRP",
        "CRP",
        "Protein phản ứng C (CRP)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "4.2",
        "mg/L",
        "< 5.0 mg/L",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-esr",
        "ESR-1HR",
        "ESR",
        "Tốc độ máu lắng (ESR 1h)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "44",
        "mm/hr",
        "0 – 20 mm/hr",
        "High",
        97
      ),
      makeOcrField(
        "crf-ferritin",
        "FERRITIN",
        "Ferritin",
        "Ferritin huyết thanh",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "312",
        "ng/mL",
        "13 – 150 ng/mL",
        "High",
        95
      ),
    ],

    // Section 4.2 & 4.3: ANA Profile 23 & Autoimmune Myositis 16 Blot Panels
    antibodyBlots: [
      // ANA Profile 23 (23 antibodies in exact docx order)
      makeBlotRow("ana23-dsdna", "ANA23-01", "dsDNA", "ana23", "Positive", "+++ (92)", 97),
      makeBlotRow("ana23-nucleosome", "ANA23-02", "Nucleosome", "ana23", "Positive", "++ (64)", 94),
      makeBlotRow("ana23-histone", "ANA23-03", "Histone", "ana23", "Positive", "+ (38)", 85),
      makeBlotRow("ana23-ssa", "ANA23-04", "SS-A (Ro60)", "ana23", "Positive", "+++ (88)", 96),
      makeBlotRow("ana23-ro52", "ANA23-05", "Ro-52", "ana23", "Positive", "++ (57)", 95),
      makeBlotRow("ana23-rrb", "ANA23-06", "SS-B (La)", "ana23", "Negative", "0 (3)", 98),
      makeBlotRow("ana23-nrnp", "ANA23-07", "nRNP/Sm", "ana23", "Positive", "++ (52)", 92),
      makeBlotRow("ana23-sm", "ANA23-08", "Sm", "ana23", "Positive", "+ (29)", 77), // <80% tier -> user checks original blot scan
      makeBlotRow("ana23-mialpha", "ANA23-09", "Mi-anpha protein", "ana23", "Negative", "0 (2)", 99),
      makeBlotRow("ana23-mi2beta", "ANA23-10", "Mi-2 beta protein", "ana23", "Negative", "0 (1)", 99),
      makeBlotRow("ana23-ku", "ANA23-11", "Ku protein", "ana23", "Negative", "0 (4)", 98),
      makeBlotRow("ana23-cenpa", "ANA23-12", "CENP A", "ana23", "Negative", "0 (2)", 99),
      makeBlotRow("ana23-cenpb", "ANA23-13", "CENP B", "ana23", "Negative", "0 (1)", 99),
      makeBlotRow("ana23-sp100", "ANA23-14", "Sp100 protein", "ana23", "Negative", "0 (3)", 98),
      makeBlotRow("ana23-pml", "ANA23-15", "PML protein", "ana23", "Negative", "0 (2)", 99),
      makeBlotRow("ana23-scl70", "ANA23-16", "Scl-70", "ana23", "Negative", "0 (2)", 99),
      makeBlotRow("ana23-pmscl100", "ANA23-17", "PM-Scl100 protein", "ana23", "Negative", "0 (1)", 98),
      makeBlotRow("ana23-pmscl75", "ANA23-18", "PM-Scl75 protein", "ana23", "Negative", "0 (2)", 98),
      makeBlotRow("ana23-rp11", "ANA23-19", "RP11", "ana23", "Negative", "0 (1)", 99),
      makeBlotRow("ana23-rp155", "ANA23-20", "RP155", "ana23", "Negative", "0 (2)", 99),
      makeBlotRow("ana23-gp210", "ANA23-21", "Gp210 protein", "ana23", "Negative", "0 (1)", 99),
      makeBlotRow("ana23-pcna", "ANA23-22", "PCNA", "ana23", "Borderline", "(+) (14)", 84),
      makeBlotRow("ana23-dfs70", "ANA23-23", "DFS70", "ana23", "Negative", "0 (2)", 97),

      // Autoimmune Myositis Antibody Panel (16 antibodies in exact docx order)
      makeBlotRow("myo-mi2a", "MYO16-01", "Mi-2 alpha", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-mi2b", "MYO16-02", "Mi-2 beta", "myositis16", "Negative", "0 (2)", 99),
      makeBlotRow("myo-tif1g", "MYO16-03", "TIFI-gamma", "myositis16", "Negative", "0 (1)", 98),
      makeBlotRow("myo-mda5", "MYO16-04", "MDA5", "myositis16", "Negative", "0 (3)", 98),
      makeBlotRow("myo-sae1", "MYO16-05", "SAE1", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-ku", "MYO16-06", "Ku", "myositis16", "Negative", "0 (4)", 98),
      makeBlotRow("myo-pmscl100", "MYO16-07", "PM-Scl100 protein", "myositis16", "Negative", "0 (2)", 99),
      makeBlotRow("myo-pmscl75", "MYO16-08", "PM-Scl75 protein", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-jo1", "MYO16-09", "Jo-1", "myositis16", "Negative", "0 (2)", 99),
      makeBlotRow("myo-srp", "MYO16-10", "SRP", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-pl7", "MYO16-11", "PL-7", "myositis16", "Negative", "0 (2)", 99),
      makeBlotRow("myo-pl12", "MYO16-12", "PL-12", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-ej", "MYO16-13", "EJ", "myositis16", "Negative", "0 (1)", 99),
      makeBlotRow("myo-ro52", "MYO16-14", "Ro-52", "myositis16", "Positive", "++ (55)", 95),
      makeBlotRow("myo-cn1a", "MYO16-15", "cN-1A", "myositis16", "Negative", "0 (2)", 98),
      makeBlotRow("myo-hmgcr", "MYO16-16", "HMGCR", "myositis16", "Negative", "0 (1)", 99),
    ],

    // Section 5: EULAR/ACR 2019
    anaEntryCriterionMet: true,
    eularAcrCriteria: buildDefaultEularAcrCriteria([
      "eular-fever",
      "eular-leukopenia",
      "eular-alopecia",
      "eular-oral-ulcers",
      "eular-acute-cutaneous",
      "eular-joint",
      "eular-proteinuria",
      "eular-biopsy-3-4",
      "eular-apl",
      "eular-comp-both",
      "eular-sle-ab",
    ]),

    // Section 6: SLEDAI-2K
    sledai2kCriteria: buildDefaultSledai2kCriteria([
      "sledai-arthritis",
      "sledai-hematuria",
      "sledai-proteinuria",
      "sledai-pyuria",
      "sledai-rash",
      "sledai-alopecia",
      "sledai-ulcers",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-fever",
      "sledai-leukopenia",
    ]),
  },
  {
    id: "crf-pat-102",
    uploadedFiles: [
      { id: "f-102-1", name: "LeVanHung_Lab_Results.pdf", url: null, isImage: false },
    ],
    submittedAt: "2026-11-09 15:40",
    studyId: "VN-0102-26",
    patientName: "Le Van Hung",
    age: "36",
    gender: "Male",
    icfSignedDate: "22/10/2026",
    heightCm: "171",
    weightKg: "64.0",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Pham Thi Lan",
    lastUpdated: "2026-11-09 16:15 ICT",
    signedOffBy: "Dr. Nguyen Minh, MD, PhD",
    signedOffRole: "specialist",

    malignantDisease: "NO",
    malignantSpecify: "",
    otherComorbidities: "YES",
    otherComorbiditiesSpecify: "Pulmonary hypertension mild; History of pleuritis",
    familyAutoimmuneHistory: "NO",
    familyRelatives: {
      Father: false,
      Mother: false,
      Brother: false,
      Sister: false,
      Child: false,
      Others: false,
    },
    familyDiseaseSpecify: "",
    fever: "NO",
    feverTempC: "",
    feverOnsetDate: "",
    feverType: "periodic",
    feverTypeSpecify: "",
    historyOfInfection: "NO",
    infectionEpisodes: [],
    treatmentStatus: "YES",
    treatments: [
      {
        id: "trt-102-1",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "BID",
        duration: "10/01/2026 – Ongoing",
      },
      {
        id: "trt-102-2",
        group: "Medication",
        name: "Azathioprine (Imuran)",
        route: "PO",
        dose: "100 mg",
        frequency: "Once daily",
        duration: "15/04/2026 – Ongoing",
      },
    ],

    skinMucosaAbnormality: "YES",
    skinMucosaItems: buildSkinMucosaItems({
      "skin-raynaud": "Biphasic digital color change in cold exposure",
      "skin-photosensitive": "Mild malar erythema",
    }),
    muscleDamage: "YES",
    muscleBiopsyOther: "NO",
    muscleBiopsySpecify: "",
    jointsDamage: "YES",
    swollenJointsCount: "2",
    tenderJointsCount: "3",
    vasScore: "40",
    abnormalXray: "NO",
    abnormalXraySpecify: "",
    abnormalUltrasound: "YES",
    abnormalUltrasoundSpecify: "Mild bilateral knee effusion",
    jointDeformity: "NO",
    jointDeformitySpecify: "",
    jointsOther: "NO",
    jointsOtherSpecify: "",
    kidneysDamage: "NO",
    renalBiopsyPerformed: "NO",
    renalBiopsyNote: "",
    renalBiopsyClasses: [],
    kidneysOther: "NO",
    kidneysOtherSpecify: "",
    haematologicalDisorders: "YES",
    haematologicalSpecify: "Thrombocytopenia (88 G/L)",
    cardiovascularAbnormality: "YES",
    cardiovascularItems: buildCardiovascularItems({
      "cv-pah": "Estimated PAPs 42 mmHg on Doppler Echocardiography",
    }),
    lungDamage: "YES",
    lungIld: true,
    lungIldPatterns: ["NSIP"],
    lungPleuritis: true,
    lungPleuritisSpecify: "Small right-sided blunting of costophrenic angle",
    lungOther: false,
    lungOtherSpecify: "",
    neuropsychiatricDisorders: "NO",
    neuropsychiatricItems: buildNeuropsychiatricItems(),
    giDisorders: "NO",
    giItems: buildGiItems(),

    ocrFields: [
      makeOcrField(
        "crf-102-hbsag",
        "HBSAG",
        "HBsAg",
        "HBsAg",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Non-reactive",
        "S/CO",
        "< 1.00",
        "Normal",
        99
      ),
      makeOcrField(
        "crf-102-qft",
        "QFT-TB",
        "QuantiFERON-TB Gold Plus",
        "QuantiFERON-TB Gold Plus",
        "medical_history",
        "Infectious diseases screening",
        "Sàng lọc bệnh truyền nhiễm",
        "infectious",
        "Negative",
        "IU/mL",
        "< 0.35 IU/mL",
        "Normal",
        96
      ),
      makeOcrField(
        "crf-102-ck",
        "CK-TOTAL",
        "Creatine kinase (CK)",
        "Creatine kinase (CK)",
        "organs_damage",
        "Muscle",
        "Cơ",
        "organs",
        "412",
        "U/L",
        "39 – 190 U/L",
        "High",
        94
      ),
      makeOcrField(
        "crf-102-upcr",
        "UPCR-SPOT",
        "Urine Protein Creatinine Ratio (UPCR)",
        "Tỷ lệ Protein/Creatinine niệu (UPCR)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "12",
        "mg/mmol",
        "< 15 mg/mmol",
        "Normal",
        97
      ),
      makeOcrField(
        "crf-102-creat",
        "SER-CREAT",
        "Creatinine",
        "Creatinine huyết thanh",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "79.0",
        "µmol/L",
        "62.0 – 106.0 µmol/L",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-102-egfr",
        "EGFR-CKDEPI",
        "Estimated glomerular filtration rate (eGFR)",
        "Độ lọc cầu thận ước tính (eGFR)",
        "organs_damage",
        "Kidneys",
        "Thận",
        "renal",
        "104",
        "ml/min/1.73 m²",
        "> 90 ml/min/1.73 m²",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-102-wbc",
        "WBC-TOTAL",
        "WBC",
        "Số lượng Bạch cầu (WBC)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "4.60",
        "G/L",
        "4.00 – 10.00 G/L",
        "Normal",
        98
      ),
      makeOcrField(
        "crf-102-plt",
        "PLT-COUNT",
        "PLT (Platelets)",
        "Số lượng Tiểu cầu (PLT)",
        "organs_damage",
        "Haematology",
        "Huyết học",
        "hematology",
        "88",
        "G/L",
        "150 – 400 G/L",
        "Low",
        95
      ),
      makeOcrField(
        "crf-102-fvc",
        "PFT-FVC",
        "FVC (L)",
        "Dung tích sống gắng sức FVC (L)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "2.85",
        "L (%Pred)",
        "> 80% Pred",
        "Low",
        93,
        { printedSecondaryValue: "72%" }
      ),
      makeOcrField(
        "crf-102-dlco",
        "PFT-DLCO",
        "DLCO Hb (or TLco)",
        "Khả năng khuếch tán khí CO (DLCO Hb / TLco)",
        "organs_damage",
        "Lungs",
        "Phổi",
        "pft",
        "14.8",
        "mL/min/mmHg",
        "> 80% Pred",
        "Low",
        92,
        { printedSecondaryValue: "64%" }
      ),
      makeOcrField(
        "crf-102-ana",
        "ANA-HEP2",
        "ANA (pattern)",
        "Kháng thể kháng nhân ANA (kiểu hình)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "1:640 Speckled",
        "Titer",
        "< 1:80 Negative",
        "Positive",
        98
      ),
      makeOcrField(
        "crf-102-dsdna",
        "ANTI-DSDNA",
        "dsDNA (ImmunoCAP / ELISA)",
        "Kháng thể kháng dsDNA (ImmunoCAP / ELISA)",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "68.0",
        "IU/mL",
        "< 30.0 IU/mL",
        "High",
        96
      ),
      makeOcrField(
        "crf-102-c3",
        "COMP-C3",
        "C3 (Complement C3)",
        "Bổ thể C3",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "0.74",
        "g/L",
        "0.90 – 1.80 g/L",
        "Low",
        94
      ),
      makeOcrField(
        "crf-102-c4",
        "COMP-C4",
        "C4 (Complement C4)",
        "Bổ thể C4",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "0.14",
        "g/L",
        "0.10 – 0.40 g/L",
        "Normal",
        95
      ),
      makeOcrField(
        "crf-102-kl6",
        "KL-6",
        "KL-6 (Krebs von den Lungen-6)",
        "Chỉ điểm phổi kẽ KL-6",
        "immunology",
        "Immunology",
        "Miễn dịch học",
        "immunology",
        "840",
        "U/mL",
        "< 500 U/mL",
        "High",
        95
      ),
    ],

    antibodyBlots: [
      makeBlotRow("ana23-102-dsdna", "ANA23-01", "dsDNA", "ana23", "Positive", "++ (58)", 96),
      makeBlotRow("ana23-102-nrnp", "ANA23-07", "nRNP/Sm", "ana23", "Positive", "+++ (95)", 98),
      makeBlotRow("ana23-102-sm", "ANA23-08", "Sm", "ana23", "Positive", "++ (61)", 95),
      makeBlotRow("ana23-102-ro52", "ANA23-05", "Ro-52", "ana23", "Positive", "++ (60)", 96),
      makeBlotRow("myo-102-ro52", "MYO16-14", "Ro-52", "myositis16", "Positive", "++ (62)", 96),
    ],

    anaEntryCriterionMet: true,
    eularAcrCriteria: buildDefaultEularAcrCriteria([
      "eular-thrombocytopenia",
      "eular-effusion",
      "eular-joint",
      "eular-comp-single",
      "eular-sle-ab",
    ]),

    sledai2kCriteria: buildDefaultSledai2kCriteria([
      "sledai-arthritis",
      "sledai-myositis",
      "sledai-pleurisy",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-thrombocytopenia",
    ]),
  },
];

/**
 * Computes EULAR/ACR 2019 total score according to official domain-maximum rule:
 * Within each domain, only the highest-weighted checked criterion is counted toward the total score.
 */
export function calculateEularAcrSummary(
  criteria: EularAcrCriterionItem[],
  anaEntryCriterionMet: boolean
) {
  const domainMaxMap: Record<
    string,
    { maxWeight: number; category: "clinical" | "immunological"; labelEn: string; labelVi: string }
  > = {};

  for (const item of criteria) {
    if (!item.checked) continue;
    const existing = domainMaxMap[item.domainId];
    if (!existing || item.weight > existing.maxWeight) {
      domainMaxMap[item.domainId] = {
        maxWeight: item.weight,
        category: item.domainCategory,
        labelEn: item.domainLabelEn,
        labelVi: item.domainLabelVi,
      };
    }
  }

  let clinicalScore = 0;
  let immunologicalScore = 0;
  for (const dom of Object.values(domainMaxMap)) {
    if (dom.category === "clinical") {
      clinicalScore += dom.maxWeight;
    } else {
      immunologicalScore += dom.maxWeight;
    }
  }

  const totalScore = clinicalScore + immunologicalScore;
  const hasClinicalCriterion = clinicalScore > 0;
  const isClassifiedSle =
    anaEntryCriterionMet && hasClinicalCriterion && totalScore >= 10;

  return {
    clinicalScore,
    immunologicalScore,
    totalScore,
    hasClinicalCriterion,
    isClassifiedSle,
    domainMaxMap,
  };
}

export function calculateSledai2kSummary(criteria: Sledai2kCriterionItem[]) {
  const totalScore = criteria.reduce(
    (sum, item) => (item.checked ? sum + item.weight : sum),
    0
  );

  let activityTierEn = "No Activity (0 pts)";
  let activityTierVi = "Không hoạt tính (0 điểm)";
  let badgeTone: "teal" | "amber" | "rose" = "teal";

  if (totalScore >= 20) {
    activityTierEn = "Very High Activity (≥20 pts)";
    activityTierVi = "Hoạt tính Rất cao (≥20 điểm)";
    badgeTone = "rose";
  } else if (totalScore >= 11) {
    activityTierEn = "High Activity (11–19 pts)";
    activityTierVi = "Hoạt tính Cao (11–19 điểm)";
    badgeTone = "rose";
  } else if (totalScore >= 6) {
    activityTierEn = "Moderate Activity (6–10 pts)";
    activityTierVi = "Hoạt tính Trung bình (6–10 điểm)";
    badgeTone = "amber";
  } else if (totalScore >= 1) {
    activityTierEn = "Mild Activity (1–5 pts)";
    activityTierVi = "Hoạt tính Nhẹ (1–5 điểm)";
    badgeTone = "amber";
  }

  return {
    totalScore,
    activityTierEn,
    activityTierVi,
    badgeTone,
  };
}

/**
 * Syncs 2019 EULAR/ACR and SLEDAI-2K classification/activity criteria from
 * verified OCR lab biomarkers and structured organ findings.
 */
export function syncCriteriaFromVerifiedCrf(
  prev: SleCrfPatientRecord
): SleCrfPatientRecord {
  const getField = (code: string) =>
    prev.ocrFields.find((f) => f.code === code);
  const getFieldVal = (code: string) => getField(code)?.value || "";
  const numVal = (code: string) => parseFloat(getFieldVal(code));

  const anaField = getField("ANA-HEP2");
  const anaEntryCriterionMet = anaField
    ? anaField.flag === "Positive" ||
      (anaField.value.trim().length > 0 &&
        !anaField.value.toLowerCase().includes("neg"))
    : prev.anaEntryCriterionMet;

  const hasFever =
    prev.fever === "YES" && parseFloat(prev.feverTempC || "0") > 38.0;
  const wbc = numVal("WBC-TOTAL");
  const plt = numVal("PLT-COUNT");
  const up24 = numVal("UPROT-24H");
  const upcr = numVal("UPCR-SPOT");
  const c3 = numVal("COMP-C3");
  const c4 = numVal("COMP-C4");
  const dsdna = numVal("ANTI-DSDNA");
  const urineRbc = numVal("URINE-RBC");
  const urineWbc = numVal("URINE-WBC");
  const coombsPos = getFieldVal("DAT-COOMBS").toLowerCase().includes("pos");
  const smPos = prev.antibodyBlots.some(
    (b) => b.name === "Sm" && b.result === "Positive"
  );
  const aplPos =
    numVal("ACL-IGG") > 20 ||
    numVal("ACL-IGM") > 20 ||
    numVal("B2GP1-IGG") > 20 ||
    getFieldVal("LAC-CONFIRM").toLowerCase().includes("pos");

  const malarChecked = prev.skinMucosaItems.some(
    (i) => i.id === "skin-malar" && i.checked
  );
  const alopeciaChecked = prev.skinMucosaItems.some(
    (i) => i.id === "skin-alopecia" && i.checked
  );
  const oralUlcerChecked = prev.skinMucosaItems.some(
    (i) => i.id === "skin-oral-ulcers" && i.checked
  );
  const pericarditisChecked = prev.cardiovascularItems.some(
    (i) => i.id === "cv-pericarditis" && i.checked
  );
  const effusionChecked =
    prev.cardiovascularItems.some(
      (i) => i.id === "cv-effusion" && i.checked
    ) || prev.lungPleuritis;
  const arthritisChecked =
    prev.jointsDamage === "YES" &&
    (parseInt(prev.swollenJointsCount || "0", 10) >= 2 ||
      parseInt(prev.tenderJointsCount || "0", 10) >= 2);
  const biopsyClass3or4 = prev.renalBiopsyClasses.some((c) =>
    [
      "Class III",
      "Class IV",
      "IIIA",
      "IVA",
      "IIIC",
      "IVC",
      "IIIA/C",
      "IVA/C",
    ].includes(c)
  );
  const biopsyClass2or5 = prev.renalBiopsyClasses.some((c) =>
    ["Class II", "Class V"].includes(c)
  );

  const lowC3 = !isNaN(c3) && c3 < 0.9;
  const lowC4 = !isNaN(c4) && c4 < 0.1;

  const nextEular = prev.eularAcrCriteria.map((item) => {
    let shouldCheck = item.checked;
    if (item.id === "eular-fever") shouldCheck = hasFever;
    if (item.id === "eular-leukopenia") shouldCheck = !isNaN(wbc) && wbc < 4.0;
    if (item.id === "eular-thrombocytopenia")
      shouldCheck = !isNaN(plt) && plt < 100;
    if (item.id === "eular-hemolysis") shouldCheck = coombsPos;
    if (item.id === "eular-alopecia") shouldCheck = alopeciaChecked;
    if (item.id === "eular-oral-ulcers") shouldCheck = oralUlcerChecked;
    if (item.id === "eular-acute-cutaneous") shouldCheck = malarChecked;
    if (item.id === "eular-effusion") shouldCheck = effusionChecked;
    if (item.id === "eular-pericarditis") shouldCheck = pericarditisChecked;
    if (item.id === "eular-joint") shouldCheck = arthritisChecked;
    if (item.id === "eular-proteinuria")
      shouldCheck =
        (!isNaN(up24) && up24 > 0.5) || (!isNaN(upcr) && upcr > 50);
    if (item.id === "eular-biopsy-2-5") shouldCheck = biopsyClass2or5;
    if (item.id === "eular-biopsy-3-4") shouldCheck = biopsyClass3or4;
    if (item.id === "eular-apl") shouldCheck = aplPos;
    if (item.id === "eular-comp-single")
      shouldCheck = (lowC3 || lowC4) && !(lowC3 && lowC4);
    if (item.id === "eular-comp-both") shouldCheck = lowC3 && lowC4;
    if (item.id === "eular-sle-ab")
      shouldCheck = (!isNaN(dsdna) && dsdna >= 30) || smPos;
    return { ...item, checked: shouldCheck };
  });

  const nextSledai = prev.sledai2kCriteria.map((item) => {
    let shouldCheck = item.checked;
    if (item.id === "sledai-arthritis") shouldCheck = arthritisChecked;
    if (item.id === "sledai-hematuria")
      shouldCheck = !isNaN(urineRbc) && urineRbc > 5;
    if (item.id === "sledai-proteinuria")
      shouldCheck = !isNaN(up24) && up24 > 0.5;
    if (item.id === "sledai-pyuria")
      shouldCheck = !isNaN(urineWbc) && urineWbc > 5;
    if (item.id === "sledai-rash") shouldCheck = malarChecked;
    if (item.id === "sledai-alopecia") shouldCheck = alopeciaChecked;
    if (item.id === "sledai-ulcers") shouldCheck = oralUlcerChecked;
    if (item.id === "sledai-pleurisy") shouldCheck = prev.lungPleuritis;
    if (item.id === "sledai-pericarditis") shouldCheck = pericarditisChecked;
    if (item.id === "sledai-low-comp") shouldCheck = lowC3 || lowC4;
    if (item.id === "sledai-dna")
      shouldCheck = !isNaN(dsdna) && dsdna >= 30;
    if (item.id === "sledai-fever") shouldCheck = hasFever;
    if (item.id === "sledai-thrombocytopenia")
      shouldCheck = !isNaN(plt) && plt < 100;
    if (item.id === "sledai-leukopenia")
      shouldCheck = !isNaN(wbc) && wbc < 3.0;
    return { ...item, checked: shouldCheck };
  });

  return {
    ...prev,
    anaEntryCriterionMet,
    eularAcrCriteria: nextEular,
    sledai2kCriteria: nextSledai,
  };
}
