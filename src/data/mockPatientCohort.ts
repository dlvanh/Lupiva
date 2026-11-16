import type { ClinicalFlag } from "./mockData";
import type {
  CrfAntibodyBlotRow,
  CrfCheckItem,
  CrfOcrField,
  CrfSectionId,
  CrfTreatmentRow,
  EularAcrCriterionItem,
  SleCrfPatientRecord,
  Sledai2kCriterionItem,
  UploadedDocFile,
  YesNoUnknown,
} from "./crfData";

export interface CohortBuilders {
  makeOcrField: (
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
  ) => CrfOcrField;
  makeBlotRow: (
    id: string,
    code: string,
    name: string,
    panel: "ana23" | "myositis16",
    printedResult: "Negative" | "Positive" | "Borderline",
    printedIntensity: string,
    confidence: number
  ) => CrfAntibodyBlotRow;
  buildSkinMucosaItems: (activeMap?: Record<string, string>) => CrfCheckItem[];
  buildCardiovascularItems: (activeMap?: Record<string, string>) => CrfCheckItem[];
  buildNeuropsychiatricItems: (activeMap?: Record<string, string>) => CrfCheckItem[];
  buildGiItems: (activeMap?: Record<string, string>) => CrfCheckItem[];
  buildDefaultEularAcrCriteria: (checkedIds?: string[]) => EularAcrCriterionItem[];
  buildDefaultSledai2kCriteria: (checkedIds?: string[]) => Sledai2kCriterionItem[];
}

interface LabOverride {
  value: string;
  flag: ClinicalFlag;
  confidence: number;
  noteEn?: string;
  noteVi?: string;
}

interface CohortSpec {
  id: string;
  studyId: string;
  patientName: string;
  age: string;
  gender: "Female" | "Male";
  icfSignedDate: string;
  heightCm: string;
  weightKg: string;
  submittedAt: string;
  lastUpdated: string;
  physician: string;
  nurse: string;
  approved: boolean;
  uploadedFiles: UploadedDocFile[];
  comorbidities?: string;
  fever?: { tempC: string; onsetDate: string; type?: "periodic" | "prolonged" | "others" };
  treatments: CrfTreatmentRow[];
  skin?: Record<string, string>;
  muscle?: YesNoUnknown;
  joints?: { swollen: string; tender: string; vas: string };
  renal?: { classes: string[]; note?: string };
  hematology?: string;
  cardio?: Record<string, string>;
  lung?: { ildPatterns?: string[]; pleuritisSpecify?: string };
  neuro?: Record<string, string>;
  gi?: Record<string, string>;
  labs: {
    hiv: LabOverride;
    ck?: LabOverride;
    uprot24: LabOverride;
    creat: LabOverride;
    egfr: LabOverride;
    wbc: LabOverride;
    plt: LabOverride;
    hb: LabOverride;
    ana: LabOverride;
    dsdna: LabOverride;
    c3: LabOverride;
    c4: LabOverride;
  };
  blots: Array<{
    code: string;
    name: string;
    panel: "ana23" | "myositis16";
    result: "Negative" | "Positive" | "Borderline";
    intensity: string;
    confidence: number;
  }>;
  anaEntryCriterionMet: boolean;
  eularChecked: string[];
  sledaiChecked: string[];
}

function buildCohortRecord(spec: CohortSpec, b: CohortBuilders): SleCrfPatientRecord {
  const prefix = spec.id;
  const fieldDefs: Array<{
    key: keyof CohortSpec["labs"];
    idSuffix: string;
    code: string;
    labelEn: string;
    labelVi: string;
    sectionId: CrfSectionId;
    subEn: string;
    subVi: string;
    group: CrfOcrField["panelGroup"];
    unit: string;
    ref: string;
  }> = [
    {
      key: "hiv",
      idSuffix: "hiv",
      code: "HIV-AGAB",
      labelEn: "HIV Ag/Ab",
      labelVi: "HIV Ag/Ab",
      sectionId: "medical_history",
      subEn: "Infectious diseases screening",
      subVi: "Sàng lọc bệnh truyền nhiễm",
      group: "infectious",
      unit: "S/CO",
      ref: "< 1.00",
    },
    {
      key: "ck",
      idSuffix: "ck",
      code: "CK-TOTAL",
      labelEn: "Creatine kinase (CK)",
      labelVi: "Creatine kinase (CK)",
      sectionId: "organs_damage",
      subEn: "Muscle",
      subVi: "Cơ",
      group: "organs",
      unit: "U/L",
      ref: "29 – 168 U/L",
    },
    {
      key: "uprot24",
      idSuffix: "up24",
      code: "UPROT-24H",
      labelEn: "24 hour Proteinuria",
      labelVi: "Protein niệu 24 giờ",
      sectionId: "organs_damage",
      subEn: "Kidneys",
      subVi: "Thận",
      group: "renal",
      unit: "g/24h",
      ref: "< 0.15 g/24h",
    },
    {
      key: "creat",
      idSuffix: "creat",
      code: "SER-CREAT",
      labelEn: "Creatinine",
      labelVi: "Creatinine huyết thanh",
      sectionId: "organs_damage",
      subEn: "Kidneys",
      subVi: "Thận",
      group: "renal",
      unit: "µmol/L",
      ref: "45.0 – 84.0 µmol/L",
    },
    {
      key: "egfr",
      idSuffix: "egfr",
      code: "EGFR-CKDEPI",
      labelEn: "Estimated glomerular filtration rate (eGFR)",
      labelVi: "Độ lọc cầu thận ước tính (eGFR)",
      sectionId: "organs_damage",
      subEn: "Kidneys",
      subVi: "Thận",
      group: "renal",
      unit: "ml/min/1.73 m²",
      ref: "> 90 ml/min/1.73 m²",
    },
    {
      key: "hb",
      idSuffix: "hb",
      code: "HGB-CONC",
      labelEn: "Hb (Hemoglobin)",
      labelVi: "Huyết sắc tố Hb",
      sectionId: "organs_damage",
      subEn: "Haematology",
      subVi: "Huyết học",
      group: "hematology",
      unit: "g/L",
      ref: "120 – 155 g/L",
    },
    {
      key: "wbc",
      idSuffix: "wbc",
      code: "WBC-TOTAL",
      labelEn: "WBC",
      labelVi: "Số lượng Bạch cầu (WBC)",
      sectionId: "organs_damage",
      subEn: "Haematology",
      subVi: "Huyết học",
      group: "hematology",
      unit: "G/L",
      ref: "4.00 – 10.00 G/L",
    },
    {
      key: "plt",
      idSuffix: "plt",
      code: "PLT-COUNT",
      labelEn: "PLT (Platelets)",
      labelVi: "Số lượng Tiểu cầu (PLT)",
      sectionId: "organs_damage",
      subEn: "Haematology",
      subVi: "Huyết học",
      group: "hematology",
      unit: "G/L",
      ref: "150 – 400 G/L",
    },
    {
      key: "ana",
      idSuffix: "ana",
      code: "ANA-HEP2",
      labelEn: "ANA (pattern)",
      labelVi: "Kháng thể kháng nhân ANA (kiểu hình)",
      sectionId: "immunology",
      subEn: "Immunology",
      subVi: "Miễn dịch học",
      group: "immunology",
      unit: "Titer",
      ref: "< 1:80 Negative",
    },
    {
      key: "dsdna",
      idSuffix: "dsdna",
      code: "ANTI-DSDNA",
      labelEn: "dsDNA (ImmunoCAP / ELISA)",
      labelVi: "Kháng thể kháng dsDNA (ImmunoCAP / ELISA)",
      sectionId: "immunology",
      subEn: "Immunology",
      subVi: "Miễn dịch học",
      group: "immunology",
      unit: "IU/mL",
      ref: "< 30.0 IU/mL",
    },
    {
      key: "c3",
      idSuffix: "c3",
      code: "COMP-C3",
      labelEn: "C3 (Complement C3)",
      labelVi: "Bổ thể C3",
      sectionId: "immunology",
      subEn: "Immunology",
      subVi: "Miễn dịch học",
      group: "immunology",
      unit: "g/L",
      ref: "0.90 – 1.80 g/L",
    },
    {
      key: "c4",
      idSuffix: "c4",
      code: "COMP-C4",
      labelEn: "C4 (Complement C4)",
      labelVi: "Bổ thể C4",
      sectionId: "immunology",
      subEn: "Immunology",
      subVi: "Miễn dịch học",
      group: "immunology",
      unit: "g/L",
      ref: "0.10 – 0.40 g/L",
    },
  ];

  const ocrFields: CrfOcrField[] = [];
  for (const def of fieldDefs) {
    const val = spec.labs[def.key];
    if (!val) continue;
    const field = b.makeOcrField(
      `${prefix}-${def.idSuffix}`,
      def.code,
      def.labelEn,
      def.labelVi,
      def.sectionId,
      def.subEn,
      def.subVi,
      def.group,
      val.value,
      def.unit,
      def.ref,
      val.flag,
      val.confidence,
      val.noteEn || val.noteVi
        ? { clinicalNoteEn: val.noteEn, clinicalNoteVi: val.noteVi }
        : undefined
    );
    if (spec.approved) {
      field.status = "user_verified";
      field.value = field.printedValue;
    }
    ocrFields.push(field);
  }

  const antibodyBlots: CrfAntibodyBlotRow[] = spec.blots.map((bl, idx) => {
    const row = b.makeBlotRow(
      `${prefix}-blot-${idx + 1}`,
      bl.code,
      bl.name,
      bl.panel,
      bl.result,
      bl.intensity,
      bl.confidence
    );
    if (spec.approved) {
      row.status = "user_verified";
      row.result = row.printedResult;
      row.intensity = row.printedIntensity;
    }
    return row;
  });

  return {
    id: spec.id,
    uploadedFiles: spec.uploadedFiles,
    submittedAt: spec.submittedAt,
    submissionStatus: spec.approved ? "approved" : "pending_doctor_review",
    studyId: spec.studyId,
    patientName: spec.patientName,
    age: spec.age,
    gender: spec.gender,
    icfSignedDate: spec.icfSignedDate,
    heightCm: spec.heightCm,
    weightKg: spec.weightKg,
    physician: spec.physician,
    nurse: spec.nurse,
    lastUpdated: spec.lastUpdated,
    signedOffBy: spec.approved ? spec.physician : null,
    signedOffRole: spec.approved ? "specialist" : null,

    malignantDisease: "NO",
    malignantSpecify: "",
    otherComorbidities: spec.comorbidities ? "YES" : "NO",
    otherComorbiditiesSpecify: spec.comorbidities ?? "",
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
    fever: spec.fever ? "YES" : "NO",
    feverTempC: spec.fever?.tempC ?? "",
    feverOnsetDate: spec.fever?.onsetDate ?? "",
    feverType: spec.fever?.type ?? "periodic",
    feverTypeSpecify: "",
    historyOfInfection: "NO",
    infectionEpisodes: [],
    treatmentStatus: spec.treatments.length > 0 ? "YES" : "NO",
    treatments: spec.treatments,

    skinMucosaAbnormality: spec.skin ? "YES" : "NO",
    skinMucosaItems: b.buildSkinMucosaItems(spec.skin),
    muscleDamage: spec.muscle ?? "NO",
    muscleBiopsyOther: "NO",
    muscleBiopsySpecify: "",
    jointsDamage: spec.joints ? "YES" : "NO",
    swollenJointsCount: spec.joints?.swollen ?? "0",
    tenderJointsCount: spec.joints?.tender ?? "0",
    vasScore: spec.joints?.vas ?? "0",
    abnormalXray: "NO",
    abnormalXraySpecify: "",
    abnormalUltrasound: "NO",
    abnormalUltrasoundSpecify: "",
    jointDeformity: "NO",
    jointDeformitySpecify: "",
    jointsOther: "NO",
    jointsOtherSpecify: "",
    kidneysDamage: spec.renal ? "YES" : "NO",
    renalBiopsyPerformed: spec.renal && spec.renal.classes.length > 0 ? "YES" : "NO",
    renalBiopsyNote: spec.renal?.note ?? "",
    renalBiopsyClasses: spec.renal?.classes ?? [],
    kidneysOther: "NO",
    kidneysOtherSpecify: "",
    haematologicalDisorders: spec.hematology ? "YES" : "NO",
    haematologicalSpecify: spec.hematology ?? "",
    cardiovascularAbnormality: spec.cardio ? "YES" : "NO",
    cardiovascularItems: b.buildCardiovascularItems(spec.cardio),
    lungDamage: spec.lung ? "YES" : "NO",
    lungIld: Boolean(spec.lung?.ildPatterns && spec.lung.ildPatterns.length > 0),
    lungIldPatterns: spec.lung?.ildPatterns ?? [],
    lungPleuritis: Boolean(spec.lung?.pleuritisSpecify),
    lungPleuritisSpecify: spec.lung?.pleuritisSpecify ?? "",
    lungOther: false,
    lungOtherSpecify: "",
    neuropsychiatricDisorders: spec.neuro ? "YES" : "NO",
    neuropsychiatricItems: b.buildNeuropsychiatricItems(spec.neuro),
    giDisorders: spec.gi ? "YES" : "NO",
    giItems: b.buildGiItems(spec.gi),

    ocrFields,
    antibodyBlots,
    anaEntryCriterionMet: spec.anaEntryCriterionMet,
    eularAcrCriteria: b.buildDefaultEularAcrCriteria(spec.eularChecked),
    sledai2kCriteria: b.buildDefaultSledai2kCriteria(spec.sledaiChecked),
  };
}

const COHORT_SPECS: CohortSpec[] = [
  {
    id: "crf-pat-103",
    studyId: "VN-0084-F2-26",
    patientName: "Tran Thi Mai",
    age: "29",
    gender: "Female",
    icfSignedDate: "15/10/2026",
    heightCm: "158",
    weightKg: "51.0",
    submittedAt: "2026-11-16 08:45",
    lastUpdated: "2026-11-16 08:45 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Le Thi Huong",
    approved: false,
    uploadedFiles: [
      {
        id: "f-103-1",
        name: "Vinmec_Renal_FollowUp_2026_11_16_Morning_Panel.pdf",
        url: null,
        isImage: false,
      },
      {
        id: "f-103-2",
        name: "Urine_Microscopy_Scan_084F2.png",
        url: null,
        isImage: true,
      },
    ],
    comorbidities: "Steroid-induced osteopenia; Controlled hypertension",
    fever: { tempC: "38.4", onsetDate: "14/11/2026", type: "periodic" },
    treatments: [
      {
        id: "trt-103-1",
        group: "Medication",
        name: "Mycophenolate Mofetil (CellCept)",
        route: "PO",
        dose: "1000 mg",
        frequency: "BID",
        duration: "08/11/2026 – Ongoing",
      },
      {
        id: "trt-103-2",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "01/03/2025 – Ongoing",
      },
    ],
    skin: { "skin-malar": "Residual malar erythema" },
    joints: { swollen: "2", tender: "4", vas: "50" },
    renal: {
      classes: ["Class IV", "IVA"],
      note: "Repeat 24h proteinuria monitoring during MMF induction",
    },
    hematology: "Mild lymphopenia (0.85 G/L)",
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: {
        value: "1.62",
        flag: "High",
        confidence: 73,
        noteEn: "Blurred decimal on thermal urine slip — verify '1.62 g/24h' manually.",
        noteVi: "Số thập phân bị mờ trên giấy in nhiệt — nhập tay '1.62 g/24h'.",
      },
      creat: { value: "88.0", flag: "High", confidence: 96 },
      egfr: { value: "74", flag: "Low", confidence: 95 },
      hb: { value: "109", flag: "Low", confidence: 97 },
      wbc: { value: "3.45", flag: "Low", confidence: 84 },
      plt: { value: "178", flag: "Normal", confidence: 98 },
      ana: { value: "1:320 Homogeneous", flag: "Positive", confidence: 98 },
      dsdna: {
        value: "156.0",
        flag: "High",
        confidence: 77,
        noteEn: "Low OCR contrast on immunoassay strip — enter '156.0 IU/mL'.",
        noteVi: "Độ tương phản thấp trên phiếu miễn dịch — nhập '156.0 IU/mL'.",
      },
      c3: { value: "0.54", flag: "Low", confidence: 75 },
      c4: { value: "0.08", flag: "Low", confidence: 85 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "+++ (92)", confidence: 96 },
      { code: "ANA23-08", name: "Sm", panel: "ana23", result: "Positive", intensity: "++ (55)", confidence: 86 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: [
      "eular-fever",
      "eular-leukopenia",
      "eular-acute-cutaneous",
      "eular-joint",
      "eular-proteinuria",
      "eular-biopsy-3-4",
      "eular-comp-both",
      "eular-sle-ab",
    ],
    sledaiChecked: [
      "sledai-arthritis",
      "sledai-proteinuria",
      "sledai-hematuria",
      "sledai-rash",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-fever",
    ],
  },
  {
    id: "crf-pat-104",
    studyId: "VN-0105-26",
    patientName: "Pham Minh Tuan",
    age: "44",
    gender: "Male",
    icfSignedDate: "12/11/2026",
    heightCm: "169",
    weightKg: "66.5",
    submittedAt: "2026-11-16 07:20",
    lastUpdated: "2026-11-16 07:20 ICT",
    physician: "Dr. Tran Quoc Bao, MD",
    nurse: "RN. Pham Thi Lan",
    approved: false,
    uploadedFiles: [
      {
        id: "f-104-1",
        name: "Echo_Pericardial_Serology_VN0105.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "Pericarditis with moderate effusion; Dyslipidemia",
    fever: { tempC: "38.5", onsetDate: "13/11/2026", type: "prolonged" },
    treatments: [
      {
        id: "trt-104-1",
        group: "Medication",
        name: "Colchicine",
        route: "PO",
        dose: "0.5 mg",
        frequency: "BID",
        duration: "14/11/2026 – Ongoing",
      },
      {
        id: "trt-104-2",
        group: "Medication",
        name: "Prednisolone",
        route: "PO",
        dose: "30 mg",
        frequency: "Once daily",
        duration: "14/11/2026 – Ongoing",
      },
    ],
    joints: { swollen: "3", tender: "5", vas: "55" },
    cardio: {
      "cv-pericarditis": "Acute fibrinous pericarditis with chest pain",
      "cv-effusion": "Moderate circumferential pericardial effusion (11 mm)",
    },
    lung: { pleuritisSpecify: "Bilateral small pleural effusions on chest CT" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.21", flag: "High", confidence: 86 },
      creat: { value: "82.5", flag: "Normal", confidence: 97 },
      egfr: { value: "96", flag: "Normal", confidence: 98 },
      hb: { value: "124", flag: "Low", confidence: 95 },
      wbc: { value: "4.15", flag: "Normal", confidence: 93 },
      plt: { value: "184", flag: "Normal", confidence: 96 },
      ana: { value: "1:640 Speckled", flag: "Positive", confidence: 94 },
      dsdna: { value: "84.2", flag: "High", confidence: 84 },
      c3: { value: "0.69", flag: "Low", confidence: 83 },
      c4: { value: "0.11", flag: "Normal", confidence: 88 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "++ (64)", confidence: 87 },
      { code: "ANA23-07", name: "nRNP/Sm", panel: "ana23", result: "Positive", intensity: "+ (34)", confidence: 93 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: [
      "eular-fever",
      "eular-effusion",
      "eular-pericarditis",
      "eular-joint",
      "eular-comp-single",
      "eular-sle-ab",
    ],
    sledaiChecked: [
      "sledai-arthritis",
      "sledai-pleurisy",
      "sledai-pericarditis",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-fever",
    ],
  },
  {
    id: "crf-pat-105",
    studyId: "VN-0108-26",
    patientName: "Nguyen Ngoc Lan",
    age: "22",
    gender: "Female",
    icfSignedDate: "14/11/2026",
    heightCm: "162",
    weightKg: "48.5",
    submittedAt: "2026-11-15 16:10",
    lastUpdated: "2026-11-15 16:10 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Le Thi Huong",
    approved: false,
    uploadedFiles: [
      {
        id: "f-105-1",
        name: "Emergency_NPSLE_Neuro_Consult_MRI.pdf",
        url: null,
        isImage: false,
      },
      {
        id: "f-105-2",
        name: "CSF_Immunology_Scanned_Photo.jpg",
        url: null,
        isImage: true,
      },
    ],
    comorbidities: "Acute lupus psychosis; Generalized tonic-clonic seizure",
    fever: { tempC: "39.1", onsetDate: "13/11/2026", type: "prolonged" },
    treatments: [
      {
        id: "trt-105-1",
        group: "Medication",
        name: "Methylprednisolone Pulse IV",
        route: "IV",
        dose: "500 mg",
        frequency: "Once daily x 3 days",
        duration: "15/11/2026 – Ongoing",
      },
      {
        id: "trt-105-2",
        group: "Medication",
        name: "Cyclophosphamide (Endoxan)",
        route: "IV",
        dose: "750 mg",
        frequency: "Monthly",
        duration: "15/11/2026 – Ongoing",
      },
    ],
    skin: {
      "skin-malar": "Florid butterfly rash",
      "skin-oral-ulcers": "Multiple palatal ulcers",
    },
    renal: { classes: ["Class III", "IIIA"], note: "Active proliferative nephritis" },
    hematology: "Severe lymphopenia (0.48 G/L), Thrombocytopenia (82 G/L)",
    neuro: {
      "np-seizures": "New-onset generalized seizure (ruled out CNS infection)",
      "np-psychosis": "Acute visual hallucinations & paranoid ideation",
    },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "2.45", flag: "High", confidence: 68 },
      creat: { value: "112.0", flag: "High", confidence: 76 },
      egfr: { value: "58", flag: "Low", confidence: 79 },
      hb: { value: "96", flag: "Low", confidence: 92 },
      wbc: { value: "2.40", flag: "Low", confidence: 74 },
      plt: { value: "82", flag: "Low", confidence: 86 },
      ana: { value: "1:1280 Homogeneous", flag: "Positive", confidence: 96 },
      dsdna: { value: "240.0", flag: "High", confidence: 72 },
      c3: { value: "0.41", flag: "Low", confidence: 78 },
      c4: { value: "0.05", flag: "Low", confidence: 83 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "+++ (104)", confidence: 94 },
      { code: "ANA23-12", name: "Ribosomal P", panel: "ana23", result: "Positive", intensity: "+++ (89)", confidence: 85 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: [
      "eular-fever",
      "eular-thrombocytopenia",
      "eular-seizure",
      "eular-psychosis",
      "eular-acute-cutaneous",
      "eular-proteinuria",
      "eular-biopsy-3-4",
      "eular-comp-both",
      "eular-sle-ab",
    ],
    sledaiChecked: [
      "sledai-seizure",
      "sledai-psychosis",
      "sledai-proteinuria",
      "sledai-rash",
      "sledai-ulcers",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-fever",
      "sledai-thrombocytopenia",
      "sledai-leukopenia",
    ],
  },
  {
    id: "crf-pat-106",
    studyId: "VN-0111-26",
    patientName: "Hoang Thi Bich",
    age: "38",
    gender: "Female",
    icfSignedDate: "10/11/2026",
    heightCm: "156",
    weightKg: "52.0",
    submittedAt: "2026-11-13 11:05",
    lastUpdated: "2026-11-13 11:05 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Pham Thi Lan",
    approved: false,
    uploadedFiles: [
      {
        id: "f-106-1",
        name: "Hematology_Coombs_AIHA_Report.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "Autoimmune hemolytic anemia + Immune thrombocytopenia (Evans phenotype)",
    treatments: [
      {
        id: "trt-106-1",
        group: "Medication",
        name: "Prednisolone",
        route: "PO",
        dose: "40 mg",
        frequency: "Once daily",
        duration: "11/11/2026 – Ongoing",
      },
      {
        id: "trt-106-2",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "01/06/2025 – Ongoing",
      },
    ],
    joints: { swollen: "2", tender: "2", vas: "35" },
    hematology: "AIHA (Hb 82 g/L, DAT IgG +++) and Thrombocytopenia (46 G/L)",
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.11", flag: "Normal", confidence: 97 },
      creat: { value: "68.0", flag: "Normal", confidence: 98 },
      egfr: { value: "99", flag: "Normal", confidence: 98 },
      hb: { value: "82", flag: "Low", confidence: 97 },
      wbc: { value: "3.10", flag: "Low", confidence: 96 },
      plt: { value: "46", flag: "Low", confidence: 95 },
      ana: { value: "1:320 Speckled", flag: "Positive", confidence: 98 },
      dsdna: { value: "54.0", flag: "High", confidence: 94 },
      c3: { value: "0.71", flag: "Low", confidence: 93 },
      c4: { value: "0.09", flag: "Low", confidence: 92 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "++ (52)", confidence: 95 },
      { code: "ANA23-04", name: "SS-A", panel: "ana23", result: "Positive", intensity: "++ (61)", confidence: 96 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: [
      "eular-thrombocytopenia",
      "eular-hemolysis",
      "eular-joint",
      "eular-comp-both",
      "eular-sle-ab",
    ],
    sledaiChecked: [
      "sledai-arthritis",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-thrombocytopenia",
    ],
  },
  {
    id: "crf-pat-107",
    studyId: "VN-0114-26",
    patientName: "Vo Van Khanh",
    age: "58",
    gender: "Male",
    icfSignedDate: "05/11/2026",
    heightCm: "167",
    weightKg: "61.0",
    submittedAt: "2026-11-11 09:30",
    lastUpdated: "2026-11-11 14:20 ICT",
    physician: "Dr. Tran Quoc Bao, MD",
    nurse: "RN. Le Thi Huong",
    approved: true,
    uploadedFiles: [
      {
        id: "f-107-1",
        name: "HRCT_Chest_PFT_Spirometry_VoVanKhanh.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "Late-onset SLE with UIP interstitial lung disease; Chronic pleuritis",
    treatments: [
      {
        id: "trt-107-1",
        group: "Medication",
        name: "Mycophenolate Mofetil",
        route: "PO",
        dose: "750 mg",
        frequency: "BID",
        duration: "01/09/2026 – Ongoing",
      },
    ],
    joints: { swollen: "1", tender: "3", vas: "30" },
    lung: {
      ildPatterns: ["UIP"],
      pleuritisSpecify: "Bilateral basal pleural thickening & mild effusion",
    },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.14", flag: "Normal", confidence: 98 },
      creat: { value: "91.0", flag: "Normal", confidence: 98 },
      egfr: { value: "81", flag: "Low", confidence: 97 },
      hb: { value: "129", flag: "Low", confidence: 96 },
      wbc: { value: "5.20", flag: "Normal", confidence: 99 },
      plt: { value: "215", flag: "Normal", confidence: 99 },
      ana: { value: "1:160 Nucleolar", flag: "Positive", confidence: 97 },
      dsdna: { value: "42.0", flag: "High", confidence: 95 },
      c3: { value: "0.86", flag: "Low", confidence: 94 },
      c4: { value: "0.15", flag: "Normal", confidence: 96 },
    },
    blots: [
      { code: "ANA23-05", name: "Ro-52", panel: "ana23", result: "Positive", intensity: "+++ (82)", confidence: 97 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: ["eular-effusion", "eular-comp-single", "eular-sle-ab"],
    sledaiChecked: ["sledai-pleurisy", "sledai-low-comp", "sledai-dna"],
  },
  {
    id: "crf-pat-108",
    studyId: "VN-0084-F1-26",
    patientName: "Tran Thi Mai",
    age: "29",
    gender: "Female",
    icfSignedDate: "15/10/2026",
    heightCm: "158",
    weightKg: "52.2",
    submittedAt: "2026-10-24 14:15",
    lastUpdated: "2026-10-24 16:40 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Le Thi Huong",
    approved: true,
    uploadedFiles: [
      {
        id: "f-108-1",
        name: "Baseline_Maintenance_Lab_Check_Oct2026.pdf",
        url: null,
        isImage: false,
      },
    ],
    treatments: [
      {
        id: "trt-108-1",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "01/03/2025 – Ongoing",
      },
    ],
    skin: { "skin-photosensitive": "Mild photosensitivity in summer" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.12", flag: "Normal", confidence: 98 },
      creat: { value: "66.0", flag: "Normal", confidence: 99 },
      egfr: { value: "106", flag: "Normal", confidence: 99 },
      hb: { value: "126", flag: "Normal", confidence: 98 },
      wbc: { value: "4.80", flag: "Normal", confidence: 98 },
      plt: { value: "235", flag: "Normal", confidence: 99 },
      ana: { value: "1:160 Homogeneous", flag: "Positive", confidence: 97 },
      dsdna: { value: "36.5", flag: "High", confidence: 95 },
      c3: { value: "0.94", flag: "Normal", confidence: 96 },
      c4: { value: "0.18", flag: "Normal", confidence: 97 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "+ (32)", confidence: 95 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: ["eular-acute-cutaneous", "eular-sle-ab"],
    sledaiChecked: ["sledai-dna"],
  },
  {
    id: "crf-pat-109",
    studyId: "VN-0119-26",
    patientName: "Dang Thu Ha",
    age: "19",
    gender: "Female",
    icfSignedDate: "02/11/2026",
    heightCm: "160",
    weightKg: "47.0",
    submittedAt: "2026-11-04 13:50",
    lastUpdated: "2026-11-04 13:50 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Pham Thi Lan",
    approved: false,
    uploadedFiles: [
      {
        id: "f-109-1",
        name: "Dermatology_Malar_Rash_Serology.pdf",
        url: null,
        isImage: false,
      },
      {
        id: "f-109-2",
        name: "Clinical_CBC_Scan_DangThuHa.png",
        url: null,
        isImage: true,
      },
    ],
    fever: { tempC: "38.3", onsetDate: "30/10/2026", type: "periodic" },
    treatments: [
      {
        id: "trt-109-1",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "04/11/2026 – Ongoing",
      },
      {
        id: "trt-109-2",
        group: "Medication",
        name: "Topical Tacrolimus 0.1%",
        route: "Topical",
        dose: "Thin layer",
        frequency: "BID",
        duration: "04/11/2026 – Ongoing",
      },
    ],
    skin: {
      "skin-malar": "Acute erythematous butterfly rash across cheeks",
      "skin-alopecia": "Diffuse frontal non-scarring alopecia",
      "skin-oral-ulcers": "Painless hard palate ulcers",
    },
    joints: { swollen: "3", tender: "4", vas: "50" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.09", flag: "Normal", confidence: 95 },
      creat: { value: "62.0", flag: "Normal", confidence: 98 },
      egfr: { value: "118", flag: "Normal", confidence: 98 },
      hb: { value: "116", flag: "Low", confidence: 87 },
      wbc: { value: "3.75", flag: "Low", confidence: 76 },
      plt: { value: "190", flag: "Normal", confidence: 96 },
      ana: { value: "1:640 Homogeneous", flag: "Positive", confidence: 97 },
      dsdna: { value: "74.0", flag: "High", confidence: 88 },
      c3: { value: "0.79", flag: "Low", confidence: 91 },
      c4: { value: "0.12", flag: "Normal", confidence: 94 },
    },
    blots: [
      { code: "ANA23-01", name: "dsDNA", panel: "ana23", result: "Positive", intensity: "++ (60)", confidence: 92 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: [
      "eular-fever",
      "eular-leukopenia",
      "eular-alopecia",
      "eular-oral-ulcers",
      "eular-acute-cutaneous",
      "eular-joint",
      "eular-comp-single",
      "eular-sle-ab",
    ],
    sledaiChecked: [
      "sledai-arthritis",
      "sledai-rash",
      "sledai-alopecia",
      "sledai-ulcers",
      "sledai-low-comp",
      "sledai-dna",
      "sledai-fever",
    ],
  },
  {
    id: "crf-pat-110",
    studyId: "VN-0123-26",
    patientName: "Bui Quoc Bao",
    age: "41",
    gender: "Male",
    icfSignedDate: "28/10/2026",
    heightCm: "174",
    weightKg: "70.0",
    submittedAt: "2026-10-29 10:00",
    lastUpdated: "2026-10-29 15:10 ICT",
    physician: "Dr. Tran Quoc Bao, MD",
    nurse: "RN. Pham Thi Lan",
    approved: true,
    uploadedFiles: [
      {
        id: "f-110-1",
        name: "UCTD_PreSLE_Screening_Panel_VN0123.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "Undifferentiated connective tissue disease (Pre-SLE monitoring)",
    treatments: [
      {
        id: "trt-110-1",
        group: "Medication",
        name: "Celecoxib",
        route: "PO",
        dose: "200 mg",
        frequency: "PRN arthralgia",
        duration: "29/10/2026 – Ongoing",
      },
    ],
    joints: { swollen: "2", tender: "3", vas: "35" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.08", flag: "Normal", confidence: 98 },
      creat: { value: "84.0", flag: "Normal", confidence: 99 },
      egfr: { value: "95", flag: "Normal", confidence: 99 },
      hb: { value: "142", flag: "Normal", confidence: 99 },
      wbc: { value: "5.80", flag: "Normal", confidence: 98 },
      plt: { value: "248", flag: "Normal", confidence: 99 },
      ana: { value: "1:80 Speckled", flag: "Positive", confidence: 96 },
      dsdna: { value: "11.2", flag: "Normal", confidence: 97 },
      c3: { value: "1.12", flag: "Normal", confidence: 98 },
      c4: { value: "0.24", flag: "Normal", confidence: 98 },
    },
    blots: [
      { code: "ANA23-04", name: "SS-A", panel: "ana23", result: "Borderline", intensity: "(+) 18", confidence: 94 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: ["eular-joint"],
    sledaiChecked: ["sledai-arthritis"],
  },
  {
    id: "crf-pat-111",
    studyId: "VN-0127-26",
    patientName: "Doan Thi Kim Chi",
    age: "34",
    gender: "Female",
    icfSignedDate: "18/10/2026",
    heightCm: "161",
    weightKg: "54.5",
    submittedAt: "2026-10-19 16:45",
    lastUpdated: "2026-10-19 16:45 ICT",
    physician: "Dr. Nguyen Minh, MD, PhD",
    nurse: "RN. Le Thi Huong",
    approved: false,
    uploadedFiles: [
      {
        id: "f-111-1",
        name: "Myositis16_Immunoblot_CK_Overlap_Panel.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "SLE–Polymyositis overlap syndrome; Proximal muscle weakness",
    treatments: [
      {
        id: "trt-111-1",
        group: "Medication",
        name: "Methotrexate",
        route: "PO",
        dose: "15 mg",
        frequency: "Weekly",
        duration: "19/10/2026 – Ongoing",
      },
      {
        id: "trt-111-2",
        group: "Medication",
        name: "Methylprednisolone",
        route: "PO",
        dose: "24 mg",
        frequency: "Once daily",
        duration: "19/10/2026 – Ongoing",
      },
    ],
    skin: { "skin-raynaud": "Raynaud phenomenon" },
    muscle: "YES",
    joints: { swollen: "4", tender: "6", vas: "60" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      ck: { value: "1240", flag: "High", confidence: 84 },
      uprot24: { value: "0.14", flag: "Normal", confidence: 96 },
      creat: { value: "59.0", flag: "Normal", confidence: 97 },
      egfr: { value: "112", flag: "Normal", confidence: 98 },
      hb: { value: "118", flag: "Low", confidence: 95 },
      wbc: { value: "5.40", flag: "Normal", confidence: 97 },
      plt: { value: "260", flag: "Normal", confidence: 98 },
      ana: { value: "1:320 Speckled", flag: "Positive", confidence: 96 },
      dsdna: { value: "48.0", flag: "High", confidence: 85 },
      c3: { value: "0.82", flag: "Low", confidence: 86 },
      c4: { value: "0.13", flag: "Normal", confidence: 94 },
    },
    blots: [
      { code: "MYO16-01", name: "Mi-2α", panel: "myositis16", result: "Positive", intensity: "+++ (88)", confidence: 83 },
      { code: "MYO16-05", name: "Jo-1", panel: "myositis16", result: "Positive", intensity: "++ (61)", confidence: 94 },
      { code: "ANA23-07", name: "nRNP/Sm", panel: "ana23", result: "Positive", intensity: "+++ (91)", confidence: 95 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: ["eular-joint", "eular-comp-single", "eular-sle-ab"],
    sledaiChecked: ["sledai-arthritis", "sledai-myositis", "sledai-low-comp", "sledai-dna"],
  },
  {
    id: "crf-pat-112",
    studyId: "VN-0131-26",
    patientName: "Truong Thi Yen Nhi",
    age: "27",
    gender: "Female",
    icfSignedDate: "01/10/2026",
    heightCm: "155",
    weightKg: "49.0",
    submittedAt: "2026-10-05 08:30",
    lastUpdated: "2026-10-06 11:20 ICT",
    physician: "Dr. Tran Quoc Bao, MD",
    nurse: "RN. Pham Thi Lan",
    approved: true,
    uploadedFiles: [
      {
        id: "f-112-1",
        name: "Membranous_Lupus_Nephritis_ClassV_Oct2026.pdf",
        url: null,
        isImage: false,
      },
    ],
    comorbidities: "Membranous Lupus Nephritis (Class V); Lupus enteritis history",
    treatments: [
      {
        id: "trt-112-1",
        group: "Medication",
        name: "Tacrolimus",
        route: "PO",
        dose: "2 mg",
        frequency: "BID",
        duration: "01/08/2026 – Ongoing",
      },
      {
        id: "trt-112-2",
        group: "Medication",
        name: "Hydroxychloroquine",
        route: "PO",
        dose: "200 mg",
        frequency: "Once daily",
        duration: "01/05/2025 – Ongoing",
      },
    ],
    skin: { "skin-oral-ulcers": "History of painless oral mucosal ulcers" },
    renal: {
      classes: ["Class V"],
      note: "Pure membranous lupus nephritis responding to calcineurin inhibitor",
    },
    gi: { "gi-gerd": "Controlled PPI therapy" },
    labs: {
      hiv: { value: "Non-reactive", flag: "Normal", confidence: 99 },
      uprot24: { value: "0.78", flag: "High", confidence: 95 },
      creat: { value: "72.0", flag: "Normal", confidence: 98 },
      egfr: { value: "102", flag: "Normal", confidence: 99 },
      hb: { value: "121", flag: "Normal", confidence: 97 },
      wbc: { value: "4.90", flag: "Normal", confidence: 98 },
      plt: { value: "218", flag: "Normal", confidence: 98 },
      ana: { value: "1:160 Speckled", flag: "Positive", confidence: 97 },
      dsdna: { value: "22.5", flag: "Normal", confidence: 96 },
      c3: { value: "0.96", flag: "Normal", confidence: 96 },
      c4: { value: "0.19", flag: "Normal", confidence: 97 },
    },
    blots: [
      { code: "ANA23-05", name: "Ro-52", panel: "ana23", result: "Positive", intensity: "+ (38)", confidence: 95 },
    ],
    anaEntryCriterionMet: true,
    eularChecked: ["eular-oral-ulcers", "eular-proteinuria", "eular-biopsy-2-5"],
    sledaiChecked: ["sledai-proteinuria"],
  },
];

export function buildAdditionalCohortPatients(
  builders: CohortBuilders
): SleCrfPatientRecord[] {
  return COHORT_SPECS.map((spec) => buildCohortRecord(spec, builders));
}
