"use client";

import React, { useState, useMemo, useRef } from "react";
import { useLupiva } from "@/context/LupivaContext";
import {
  CrfSectionId,
  CrfOcrField,
  CrfAntibodyBlotRow,
  BlotResultStatus,
  YesNoUnknown,
  RENAL_BIOPSY_CLASS_OPTIONS,
  ILD_HRCT_PATTERN_OPTIONS,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
  getInitialOcrTierStatus,
  getSubmissionStatus,
} from "@/data/crfData";
import { ClinicalFlag } from "@/data/mockData";
import { DocxCrfView } from "@/components/DocxCrfView";

type TriageFilter = "all" | "manual_under_80" | "verify_80_90" | "approved_over_90";
type ScanDossierFilter =
  | "all"
  | "immunology"
  | "renal"
  | "hematology"
  | "infectious"
  | "pft";

type DoctorWorkflowStep = "step1_triage" | "step2_review" | "step3_signoff";

export default function SleCrfManagerPage() {
  const {
    language,
    currentUser,
    crfPatients,
    activeCrfPatientId,
    setActiveCrfPatientId,
    updateCrfPatient,
    createNewCrfPatient,
    showToast,
  } = useLupiva();

  const isVi = language === "vi";

  const activePatient = useMemo(
    () =>
      crfPatients.find((p) => p.id === activeCrfPatientId) || crfPatients[0],
    [crfPatients, activeCrfPatientId]
  );

  const [activeSection, setActiveSection] = useState<CrfSectionId | "all">(
    "demographics"
  );
  const [triageFilter, setTriageFilter] = useState<TriageFilter>("all");
  const [scanPanelFilter, setScanPanelFilter] =
    useState<ScanDossierFilter>("all");
  const [showDocViewer, setShowDocViewer] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [selectedGroundingId, setSelectedGroundingId] = useState<string>("crf-c3");
  const [uploadedScan, setUploadedScan] = useState<{
    name: string;
    url: string | null;
  } | null>(null);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] =
    useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>("");
  const [newStudyId, setNewStudyId] = useState<string>("");
  const [isJsonModalOpen, setIsJsonModalOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"edit" | "clean">("edit");
  const [viewerTabOverride, setViewerTabOverride] = useState<
    "uploaded" | "grounded" | null
  >(null);
  const [workflowStep, setWorkflowStep] =
    useState<DoctorWorkflowStep>("step1_triage");
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-calculated BMI from Height (cm) & Weight (kg)
  const calculatedBmi = useMemo(() => {
    const h = parseFloat(activePatient.heightCm);
    const w = parseFloat(activePatient.weightKg);
    if (!h || !w || h <= 0 || w <= 0) return "—";
    const bmi = w / Math.pow(h / 100, 2);
    return bmi.toFixed(1);
  }, [activePatient.heightCm, activePatient.weightKg]);

  // 3-Tier OCR Triage Counts across both ocrFields and antibodyBlots
  const triageStats = useMemo(() => {
    let manualUnder80 = 0;
    let verify80to90 = 0;
    let approved = 0;

    for (const f of activePatient.ocrFields) {
      if (f.status === "manual_required" || !f.value.trim()) {
        manualUnder80++;
      } else if (f.status === "needs_verify") {
        verify80to90++;
      } else {
        approved++;
      }
    }

    for (const b of activePatient.antibodyBlots) {
      if (b.status === "manual_required" || !b.result) {
        manualUnder80++;
      } else if (b.status === "needs_verify") {
        verify80to90++;
      } else {
        approved++;
      }
    }

    return {
      manualUnder80,
      verify80to90,
      approved,
      total: activePatient.ocrFields.length + activePatient.antibodyBlots.length,
      unresolved: manualUnder80 + verify80to90,
    };
  }, [activePatient.ocrFields, activePatient.antibodyBlots]);

  // EULAR/ACR 2019 & SLEDAI-2K Live Summaries
  const eularSummary = useMemo(
    () =>
      calculateEularAcrSummary(
        activePatient.eularAcrCriteria,
        activePatient.anaEntryCriterionMet
      ),
    [activePatient.eularAcrCriteria, activePatient.anaEntryCriterionMet]
  );

  const sledaiSummary = useMemo(
    () => calculateSledai2kSummary(activePatient.sledai2kCriteria),
    [activePatient.sledai2kCriteria]
  );

  // Helper to update current patient record
  const patchPatient = (
    updater: (prev: typeof activePatient) => typeof activePatient
  ) => {
    updateCrfPatient(activePatient.id, (prev) => ({
      ...updater(prev),
      lastUpdated: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  };

  // Update an OCR-extracted field value (typing into a <80% blank field or editing 80-90% field)
  const handleUpdateOcrField = (
    fieldId: string,
    updates: Partial<CrfOcrField>
  ) => {
    patchPatient((prev) => ({
      ...prev,
      ocrFields: prev.ocrFields.map((f) => {
        if (f.id !== fieldId) return f;
        const nextVal =
          updates.value !== undefined ? updates.value : f.value;
        const hasVal = nextVal.trim().length > 0;
        const nextStatus =
          updates.status ??
          (hasVal ? "user_verified" : getInitialOcrTierStatus(f.confidence));
        return {
          ...f,
          ...updates,
          status: nextStatus,
        };
      }),
    }));
  };

  // Verify a single 80-90% field or confirm a filled <80% field
  const handleVerifyOcrField = (field: CrfOcrField) => {
    if (!field.value.trim()) {
      setShowDocViewer(true);
      setSelectedGroundingId(field.id);
      showToast(
        isVi
          ? "Cần kiểm tra bản gốc & nhập tay (<80%)"
          : "Check Original Scan & Add Manually (<80%)",
        isVi
          ? `Chỉ số ${field.code} có độ tin cậy ${field.confidence}% (<80%). Vui lòng xem bản gốc bên trái ('${field.printedValue}') và nhập vào ô.`
          : `Field ${field.code} has ${field.confidence}% confidence (<80%). Please check the original scan on the left ('${field.printedValue}') and type it in.`,
        "amber"
      );
      return;
    }

    handleUpdateOcrField(field.id, { status: "user_verified" });
    showToast(
      isVi ? `Đã xác nhận ${field.code}` : `Verified ${field.code}`,
      isVi
        ? `Đã phê duyệt giá trị "${field.value} ${field.unit}" trong e-CRF.`
        : `Confirmed value "${field.value} ${field.unit}" in e-CRF.`,
      "teal"
    );
  };

  // Update an antibody blot row (ANA Profile 23 / Myositis 16)
  const handleUpdateBlotRow = (
    blotId: string,
    updates: Partial<CrfAntibodyBlotRow>
  ) => {
    patchPatient((prev) => ({
      ...prev,
      antibodyBlots: prev.antibodyBlots.map((b) => {
        if (b.id !== blotId) return b;
        const nextResult =
          updates.result !== undefined ? updates.result : b.result;
        const nextStatus =
          updates.status ??
          (nextResult ? "user_verified" : getInitialOcrTierStatus(b.confidence));
        return {
          ...b,
          ...updates,
          status: nextStatus,
        };
      }),
    }));
  };

  // Run AI OCR Scan simulation on the dossier or uploaded document
  const handleRunOcrOnCrf = () => {
    setIsScanning(true);
    setShowDocViewer(true);
    setTimeout(() => {
      patchPatient((prev) => ({
        ...prev,
        ocrFields: prev.ocrFields.map((f) => {
          const initialStatus = getInitialOcrTierStatus(f.confidence);
          return {
            ...f,
            value: initialStatus === "manual_required" ? "" : f.printedValue,
            secondaryValue:
              initialStatus === "manual_required"
                ? ""
                : f.printedSecondaryValue,
            status: initialStatus,
          };
        }),
        antibodyBlots: prev.antibodyBlots.map((b) => {
          const initialStatus = getInitialOcrTierStatus(b.confidence);
          return {
            ...b,
            result: initialStatus === "manual_required" ? "" : b.printedResult,
            intensity:
              initialStatus === "manual_required" ? "" : b.printedIntensity,
            status: initialStatus,
          };
        }),
      }));
      setIsScanning(false);
      showToast(
        isVi
          ? "Hoàn tất Quét OCR & Phân tầng 3 Mức"
          : "AI OCR Scan & 3-Tier Triage Complete",
        isVi
          ? "Đã tự động duyệt các chỉ số >90%, đánh dấu vàng nhóm 80–90% để xác nhận lại, và để trống nhóm <80% để đối chiếu bản gốc."
          : "Auto-approved >90% fields, flagged 80–90% fields for verification, and left <80% fields blank for manual entry from the original scan.",
        "teal"
      );
    }, 1050);
  };

  // Batch verify all 80-90% pre-filled fields (leaving <80% blank fields for explicit check, or optionally filling them if user clicks Resolve All)
  const handleVerifyAll80To90 = () => {
    patchPatient((prev) => ({
      ...prev,
      ocrFields: prev.ocrFields.map((f) =>
        f.status === "needs_verify" && f.value.trim()
          ? { ...f, status: "user_verified" }
          : f
      ),
      antibodyBlots: prev.antibodyBlots.map((b) =>
        b.status === "needs_verify" && b.result
          ? { ...b, status: "user_verified" }
          : b
      ),
    }));
    showToast(
      isVi
        ? "Đã xác nhận toàn bộ chỉ số nhóm 80–90%"
        : "Verified All 80–90% Confidence Fields",
      isVi
        ? "Các chỉ số 80–90% đã được phê duyệt. Vui lòng kiểm tra các mục <80% còn trống."
        : "All 80–90% fields are now verified. Please check any remaining <80% manual-entry fields.",
      "teal"
    );
  };

  // Jump to the next unresolved (<80% or 80-90%) field and highlight on original scan
  const handleJumpNextUnresolved = () => {
    setWorkflowStep("step1_triage");
    const nextField = activePatient.ocrFields.find(
      (f) =>
        f.status === "manual_required" ||
        !f.value.trim() ||
        f.status === "needs_verify"
    );
    if (nextField) {
      setActiveSection(nextField.sectionId);
      setSelectedGroundingId(nextField.id);
      setShowDocViewer(true);
      const el = document.getElementById(`crf-input-${nextField.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return;
    }

    const nextBlot = activePatient.antibodyBlots.find(
      (b) =>
        b.status === "manual_required" ||
        !b.result ||
        b.status === "needs_verify"
    );
    if (nextBlot) {
      setActiveSection("immunology");
      setSelectedGroundingId(nextBlot.id);
      setShowDocViewer(true);
      return;
    }

    showToast(
      isVi ? "Toàn bộ trường OCR đã hoàn tất!" : "All OCR Fields Resolved!",
      isVi
        ? "Không còn trường <80% hoặc 80–90% nào cần xử lý."
        : "No remaining <80% manual entry or 80–90% verification fields.",
      "teal"
    );
  };

  // Auto-suggest 2019 EULAR/ACR & SLEDAI-2K checkboxes from verified CRF labs & clinical findings
  const handleAutoSuggestScores = () => {
    patchPatient((prev) => {
      const getFieldVal = (code: string) =>
        prev.ocrFields.find((f) => f.code === code)?.value || "";
      const numVal = (code: string) => parseFloat(getFieldVal(code));

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
      const coombsPos = getFieldVal("DAT-COOMBS")
        .toLowerCase()
        .includes("pos");
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
        ["Class III", "Class IV", "IIIA", "IVA", "IIIC", "IVC", "IIIA/C", "IVA/C"].includes(c)
      );
      const biopsyClass2or5 = prev.renalBiopsyClasses.some((c) =>
        ["Class II", "Class V"].includes(c)
      );

      const lowC3 = !isNaN(c3) && c3 < 0.9;
      const lowC4 = !isNaN(c4) && c4 < 0.1;

      const nextEular = prev.eularAcrCriteria.map((item) => {
        let shouldCheck = item.checked;
        if (item.id === "eular-fever") shouldCheck = hasFever;
        if (item.id === "eular-leukopenia")
          shouldCheck = !isNaN(wbc) && wbc < 4.0;
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
          shouldCheck = (!isNaN(up24) && up24 > 0.5) || (!isNaN(upcr) && upcr > 50);
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
        if (item.id === "sledai-pericarditis")
          shouldCheck = pericarditisChecked;
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
        eularAcrCriteria: nextEular,
        sledai2kCriteria: nextSledai,
      };
    });

    showToast(
      isVi
        ? "Đã tự động tính điểm EULAR/ACR 2019 & SLEDAI-2K"
        : "Auto-Calculated 2019 EULAR/ACR & SLEDAI-2K Scores",
      isVi
        ? "Đã đồng bộ các chỉ số xét nghiệm và lâm sàng vào bảng điểm phân loại & hoạt tính bệnh."
        : "Synced verified lab biomarkers and organ findings into EULAR/ACR and SLEDAI-2K calculators.",
      "teal"
    );
  };

  // Sign Off & Commit the complete SLE Case Report Form
  const handleSignOffCrf = () => {
    if (triageStats.unresolved > 0) {
      showToast(
        isVi
          ? `Còn ${triageStats.unresolved} mục OCR chưa hoàn tất`
          : `${triageStats.unresolved} OCR Field(s) Require Action Before Sign-Off`,
        isVi
          ? `Có ${triageStats.manualUnder80} mục <80% cần xem bản gốc để nhập tay và ${triageStats.verify80to90} mục 80–90% cần nhấn xác nhận.`
          : `Please resolve ${triageStats.manualUnder80} blank (<80%) field(s) and verify ${triageStats.verify80to90} (80–90%) field(s) first.`,
        "amber"
      );
      handleJumpNextUnresolved();
      return;
    }

    const signerName = currentUser
      ? currentUser.name
      : isVi
      ? "Chuyên gia Đánh giá Lâm sàng"
      : "Clinical Specialist Evaluator";
    const signerRole = currentUser ? currentUser.role : "specialist";

    patchPatient((prev) => ({
      ...prev,
      signedOffBy: signerName,
      signedOffRole: signerRole,
      submissionStatus: "approved" as const,
    }));

    showToast(
      isVi
        ? `Đã Ký duyệt Hồ sơ Bệnh án SLE (${activePatient.studyId})`
        : `Signed Off SLE Case Report Form (${activePatient.studyId})`,
      isVi
        ? `Người ký: ${signerName} • EULAR/ACR: ${eularSummary.totalScore} điểm • SLEDAI-2K: ${sledaiSummary.totalScore} điểm.`
        : `Signed by ${signerName} • EULAR/ACR: ${eularSummary.totalScore} pts • SLEDAI-2K: ${sledaiSummary.totalScore} pts.`,
      "teal"
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const objectUrl = isImage ? URL.createObjectURL(file) : null;
    setUploadedScan({ name: file.name, url: objectUrl });
    handleRunOcrOnCrf();
  };

  const handleCreatePatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createNewCrfPatient(
      newPatientName.trim() || "Nguyen Thi Thu",
      newStudyId.trim() || `VN-012${crfPatients.length}-26`
    );
    setNewPatientName("");
    setNewStudyId("");
    setIsNewPatientModalOpen(false);
    showToast(
      isVi
        ? `Đã tạo Hồ sơ CRF mới: ${created.studyId}`
        : `Created New SLE CRF: ${created.studyId}`,
      isVi
        ? `Bệnh nhân: ${created.patientName}. Hãy nhấn 'Chạy AI OCR' để trích xuất xét nghiệm.`
        : `Patient: ${created.patientName}. Click 'Run AI OCR' to populate extracted lab fields.`,
      "teal"
    );
  };

  const crfSections: { id: CrfSectionId | "all"; labelEn: string; labelVi: string }[] = [
    { id: "demographics", labelEn: "1. Demographics", labelVi: "1. Hành chính & Nhân trắc" },
    { id: "medical_history", labelEn: "2. Medical History", labelVi: "2. Tiền sử & Truyền nhiễm" },
    { id: "organs_damage", labelEn: "3. Organs Damage (9)", labelVi: "3. Tổn thương Cơ quan (9)" },
    { id: "immunology", labelEn: "4. Immunology & Blots", labelVi: "4. Miễn dịch & ANA-23/Myositis" },
    { id: "eular_acr", labelEn: "5. EULAR/ACR 2019", labelVi: "5. Chẩn đoán EULAR/ACR 2019" },
    { id: "sledai_2k", labelEn: "6. SLEDAI-2K", labelVi: "6. Hoạt tính SLEDAI-2K" },
    { id: "all", labelEn: "View Full CRF", labelVi: "Xem Toàn bộ CRF" },
  ];

  // Filter helper for OCR fields when a Triage Filter is active
  const matchesTriageFilter = (status: CrfOcrField["status"], hasValue: boolean) => {
    if (triageFilter === "all") return true;
    if (triageFilter === "manual_under_80") {
      return status === "manual_required" || !hasValue;
    }
    if (triageFilter === "verify_80_90") {
      return status === "needs_verify" && hasValue;
    }
    if (triageFilter === "approved_over_90") {
      return (status === "auto_approved" || status === "user_verified") && hasValue;
    }
    return true;
  };

  // Reusable renderer for an OCR-extracted field card/row with 3-tier confidence rules
  const renderOcrFieldRow = (field: CrfOcrField) => {
    const isManualRequired =
      field.status === "manual_required" || !field.value.trim();
    const isNeedsVerify =
      field.status === "needs_verify" && field.value.trim().length > 0;
    const isSelected = selectedGroundingId === field.id;

    if (!matchesTriageFilter(field.status, field.value.trim().length > 0)) {
      return null;
    }

    return (
      <div
        key={field.id}
        onClick={() => setSelectedGroundingId(field.id)}
        className={`rounded-xl border p-3 transition cursor-pointer ${
          isSelected
            ? "border-teal-700 bg-teal-50/40 ring-2 ring-teal-600/25"
            : isManualRequired
            ? "border-rose-300 bg-rose-50/40 hover:bg-rose-50/70"
            : isNeedsVerify
            ? "border-amber-300 bg-amber-50/40 hover:bg-amber-50/70"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  isManualRequired
                    ? "bg-rose-600"
                    : isNeedsVerify
                    ? "bg-amber-500"
                    : "bg-teal-600"
                }`}
              />
              <span className="font-mono text-[10px] font-bold text-slate-500">
                {field.code}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9px] text-slate-600">
                {isVi ? "Trích xuất OCR" : "OCR Extracted"}
              </span>
            </div>
            <label
              htmlFor={`crf-input-${field.id}`}
              className="mt-0.5 block text-xs font-bold text-slate-900 cursor-pointer"
            >
              {isVi ? field.labelVi : field.labelEn}
            </label>
            <p className="font-mono text-[10px] text-slate-500">
              Ref: {field.referenceRange} ({field.unit})
            </p>
          </div>

          {/* 3-Tier Confidence Badge */}
          <div className="text-right">
            {isManualRequired ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-900">
                🔴 &lt;80% ({field.confidence}%) •{" "}
                {isVi ? "Xem bản gốc & Nhập" : "Check Scan & Add"}
              </span>
            ) : isNeedsVerify ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-950">
                🟡 80–90% ({field.confidence}%) •{" "}
                {isVi ? "Cần xác nhận lại" : "Verify Again"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-800">
                🟢{" "}
                {field.status === "auto_approved"
                  ? isVi
                    ? `>90% Tự động duyệt (${field.confidence}%)`
                    : `>90% Auto-Approved (${field.confidence}%)`
                  : isVi
                  ? `Đã xác nhận (${field.confidence}%)`
                  : `User Verified (${field.confidence}%)`}
              </span>
            )}
          </div>
        </div>

        {/* Input Controls Row */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`crf-input-${field.id}`}
              type="text"
              value={field.value}
              placeholder={
                isManualRequired
                  ? isVi
                    ? "Kiểm tra bản gốc & nhập giá trị..."
                    : "Check original scan & type value..."
                  : undefined
              }
              onChange={(e) =>
                handleUpdateOcrField(field.id, { value: e.target.value })
              }
              className={`w-44 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold focus:outline-none ${
                isManualRequired
                  ? "border-rose-400 bg-white text-rose-950 placeholder:font-sans placeholder:text-[10px] placeholder:font-normal placeholder:text-rose-500 focus:border-rose-600"
                  : isNeedsVerify
                  ? "border-amber-400 bg-white text-amber-950 focus:border-amber-600"
                  : "border-slate-200 bg-slate-50/70 text-slate-900 focus:border-teal-700 focus:bg-white"
              }`}
            />

            {field.printedSecondaryValue !== undefined && (
              <input
                type="text"
                aria-label={`${field.labelEn} % predicted`}
                value={field.secondaryValue || ""}
                placeholder="% Pred"
                onChange={(e) =>
                  handleUpdateOcrField(field.id, {
                    secondaryValue: e.target.value,
                  })
                }
                className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-semibold text-slate-700 focus:border-teal-700 focus:bg-white focus:outline-none"
              />
            )}

            <select
              aria-label={`Flag for ${field.labelEn}`}
              value={field.flag}
              onChange={(e) =>
                handleUpdateOcrField(field.id, {
                  flag: e.target.value as ClinicalFlag,
                })
              }
              className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${
                field.flag === "Normal"
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : "border-rose-200 bg-rose-100 text-rose-900"
              }`}
            >
              <option value="Normal">{isVi ? "Bình thường" : "Normal"}</option>
              <option value="High">{isVi ? "Cao" : "High"}</option>
              <option value="Low">{isVi ? "Thấp" : "Low"}</option>
              <option value="Positive">{isVi ? "Dương tính" : "Positive"}</option>
            </select>
          </div>

          {/* Action Buttons for <80% and 80-90% */}
          <div className="flex items-center gap-1.5">
            {isManualRequired && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpdateOcrField(field.id, {
                      value: field.printedValue,
                      secondaryValue: field.printedSecondaryValue,
                      status: "user_verified",
                    });
                    showToast(
                      isVi
                        ? `Đã điền ${field.code} từ bản gốc`
                        : `Added ${field.code} from Original Scan`,
                      `${field.printedValue} ${field.unit}`,
                      "teal"
                    );
                  }}
                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 cursor-pointer"
                >
                  {isVi
                    ? `+ Nhập "${field.printedValue}"`
                    : `+ Fill "${field.printedValue}"`}
                </button>
              </>
            )}

            {isNeedsVerify && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleVerifyOcrField(field);
                }}
                className="rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-amber-700 cursor-pointer"
              >
                {isVi
                  ? `✓ Xác nhận (${field.confidence}%)`
                  : `✓ Verify (${field.confidence}%)`}
              </button>
            )}
          </div>
        </div>

        {(field.clinicalNoteEn || field.clinicalNoteVi) && (
          <p className="mt-2 rounded bg-slate-100/80 px-2.5 py-1 text-[11px] text-slate-600">
            {isVi ? field.clinicalNoteVi : field.clinicalNoteEn}
          </p>
        )}
      </div>
    );
  };

  // Filtered list of items shown on the simulated Original Document Viewer (Left Pane)
  const docViewerFields = useMemo(() => {
    if (scanPanelFilter === "all") return activePatient.ocrFields;
    return activePatient.ocrFields.filter(
      (f) => f.panelGroup === scanPanelFilter
    );
  }, [activePatient.ocrFields, scanPanelFilter]);

  const uploadedFiles = activePatient.uploadedFiles ?? [];
  const hasUploadedImage = uploadedFiles.some((f) => f.url);
  const viewerTab: "uploaded" | "grounded" =
    viewerTabOverride ?? (hasUploadedImage ? "uploaded" : "grounded");
  const currentFile = uploadedFiles[activeFileIdx] ?? uploadedFiles[0];

  const showSection = (sec: CrfSectionId) =>
    workflowStep === "step2_review" && (activeSection === "all" || activeSection === sec);

  const fullCrfJsonPayload = {
    schema: "vinmec-mddu-sle-crf-2026-v1",
    studyId: activePatient.studyId,
    patientName: activePatient.patientName,
    demographics: {
      age: activePatient.age,
      gender: activePatient.gender,
      icfSignedDate: activePatient.icfSignedDate,
      heightCm: activePatient.heightCm,
      weightKg: activePatient.weightKg,
      bmi: calculatedBmi,
      physician: activePatient.physician,
      nurse: activePatient.nurse,
    },
    signOff: {
      signedOffBy: activePatient.signedOffBy,
      signedOffRole: activePatient.signedOffRole,
      lastUpdated: activePatient.lastUpdated,
      unresolvedOcrCount: triageStats.unresolved,
    },
    scores: {
      eularAcr2019: {
        anaEntryCriterionMet: activePatient.anaEntryCriterionMet,
        clinicalScore: eularSummary.clinicalScore,
        immunologicalScore: eularSummary.immunologicalScore,
        totalScore: eularSummary.totalScore,
        classifiedAsSle: eularSummary.isClassifiedSle,
      },
      sledai2k: {
        totalScore: sledaiSummary.totalScore,
        activityTier: sledaiSummary.activityTierEn,
      },
    },
    ocrExtractedFields: activePatient.ocrFields.map((f) => ({
      code: f.code,
      label: f.labelEn,
      value: f.value,
      secondaryValue: f.secondaryValue,
      unit: f.unit,
      flag: f.flag,
      ocrConfidence: f.confidence,
      triageStatus: f.status,
    })),
    antibodyBlotPanels: activePatient.antibodyBlots.map((b) => ({
      panel: b.panel,
      antibody: b.name,
      result: b.result,
      intensity: b.intensity,
      ocrConfidence: b.confidence,
      triageStatus: b.status,
    })),
  };

  const handleDownloadCrfJson = () => {
    const blob = new Blob([JSON.stringify(fullCrfJsonPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activePatient.studyId}-sle-crf.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      isVi ? "Đã tải xuống JSON Hồ sơ CRF" : "Downloaded SLE CRF JSON",
      `${activePatient.studyId}-sle-crf.json`,
      "teal"
    );
  };

  return (
    <main className="flex-1 bg-slate-100/80 pb-14">
      {/* Compact context bar: patient + status + utilities (one row) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div
            role="toolbar"
            aria-label={isVi ? "Bệnh nhân và công cụ" : "Patient and tools"}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor="crf-patient-select">
                {isVi ? "Chọn bệnh nhân" : "Select patient"}
              </label>
              <select
                id="crf-patient-select"
                value={activePatient.id}
                onChange={(e) => {
                  setActiveCrfPatientId(e.target.value);
                  setViewerTabOverride(null);
                  setActiveFileIdx(0);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                {crfPatients.map((pat) => (
                  <option key={pat.id} value={pat.id}>
                    {pat.studyId} • {pat.patientName} ({pat.age}
                    {pat.gender === "Female" ? "F" : "M"}) —{" "}
                    {getSubmissionStatus(pat) === "approved"
                      ? isVi ? "Đã duyệt" : "Approved"
                      : isVi ? "Chờ duyệt" : "Pending"}
                  </option>
                ))}
              </select>
              {activePatient.signedOffBy ? (
                <span className="rounded bg-teal-700 px-2 py-1 text-xs font-bold text-white">
                  ✓ {isVi ? "Đã ký duyệt:" : "Signed off:"} {activePatient.signedOffBy}
                </span>
              ) : (
                <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                  {isVi ? "Bản nháp" : "Draft"}
                </span>
              )}
              <span className="hidden gap-2 font-mono text-xs sm:flex">
                <span
                  className={`rounded px-2 py-1 font-bold ${
                    eularSummary.isClassifiedSle
                      ? "bg-teal-100 text-teal-900"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  EULAR/ACR {eularSummary.totalScore}
                </span>
                <span className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-900">
                  SLEDAI-2K {sledaiSummary.totalScore}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="crf-btn-toggle-viewer"
                aria-pressed={showDocViewer}
                onClick={() => setShowDocViewer((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  showDocViewer
                    ? "border-teal-700/40 bg-teal-50 text-teal-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {isVi ? "Bản quét gốc" : "Original scan"}
              </button>
              <details className="relative">
                <summary
                  aria-label={isVi ? "Thêm thao tác" : "More actions"}
                  className="flex cursor-pointer list-none items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {isVi ? "Thêm ⋯" : "More ⋯"}
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg">
                  {[
                    {
                      id: "crf-menu-docx",
                      label: isVi ? "📄 Xem bản .docx" : "📄 Preview .docx",
                      run: () => {
                        setWorkflowStep("step3_signoff");
                        setViewMode("clean");
                      },
                    },
                    {
                      id: "crf-btn-print",
                      label: isVi ? "🖨 In" : "🖨 Print",
                      run: () => {
                        setWorkflowStep("step3_signoff");
                        setViewMode("clean");
                        setTimeout(() => window.print(), 150);
                      },
                    },
                    {
                      id: "crf-btn-export-json",
                      label: isVi ? "{ } Xem trước / Xuất JSON" : "{ } Preview / Export JSON",
                      run: () => setIsJsonModalOpen(true),
                    },
                    {
                      id: "crf-menu-rerun",
                      label: isVi ? "⚡ Chạy lại AI OCR" : "⚡ Re-run AI OCR",
                      run: handleRunOcrOnCrf,
                    },
                    {
                      id: "crf-menu-new",
                      label: isVi ? "+ Hồ sơ CRF mới" : "+ New patient CRF",
                      run: () => setIsNewPatientModalOpen(true),
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      id={item.id}
                      onClick={(e) => {
                        item.run();
                        e.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* Guided 3-step workflow stepper */}
          <ol
            aria-label={isVi ? "Quy trình" : "Workflow"}
            className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3"
          >
            {(
              [
                {
                  key: "step1_triage",
                  n: 1,
                  title: isVi ? "Xử lý mục OCR cần kiểm tra" : "Resolve flagged OCR",
                  badge:
                    triageStats.unresolved > 0
                      ? isVi
                        ? `${triageStats.unresolved} cần xử lý`
                        : `${triageStats.unresolved} to resolve`
                      : isVi ? "✓ Hoàn tất" : "✓ All resolved",
                  ok: triageStats.unresolved === 0,
                },
                {
                  key: "step2_review",
                  n: 2,
                  title: isVi ? "Rà soát CRF & điểm số" : "Review CRF & scores",
                  badge: `EULAR ${eularSummary.totalScore} • SLEDAI ${sledaiSummary.totalScore}`,
                  ok: true,
                },
                {
                  key: "step3_signoff",
                  n: 3,
                  title: isVi ? "Phê duyệt & xuất" : "Approve & export",
                  badge: activePatient.signedOffBy
                    ? isVi ? "✓ Đã ký" : "✓ Signed"
                    : isVi ? "Chưa ký" : "Not signed",
                  ok: Boolean(activePatient.signedOffBy),
                },
              ] as {
                key: DoctorWorkflowStep;
                n: number;
                title: string;
                badge: string;
                ok: boolean;
              }[]
            ).map((s) => {
              const current = workflowStep === s.key;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    id={`crf-step-${s.n}`}
                    aria-current={current ? "step" : undefined}
                    onClick={() => setWorkflowStep(s.key)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer ${
                      current
                        ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700/30"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        current ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {s.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {s.title}
                      </span>
                      <span
                        className={`block text-[11px] font-medium ${
                          s.ok ? "text-teal-800" : "text-rose-700"
                        }`}
                      >
                        {s.badge}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Step 2 only: section tabs */}
          {workflowStep === "step2_review" && (
            <div
              role="group"
              aria-label={isVi ? "Mục CRF" : "CRF sections"}
              className="mt-3 flex gap-1.5 overflow-x-auto border-t border-slate-200 pt-3"
            >
              {crfSections.map((sec) => {
                const isCurrent = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    id={`crf-sec-tab-${sec.id}`}
                    aria-pressed={isCurrent}
                    onClick={() => setActiveSection(sec.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      isCurrent
                        ? "bg-teal-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
                    }`}
                  >
                    {isVi ? sec.labelVi : sec.labelEn}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Split-Screen Workspace: Original Scan Grounding (Left) + 6-Section CRF (Right) */}
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT PANE: Collapsible Side-by-Side Original Document Viewer */}
          {showDocViewer && (
            <aside
              aria-label="Original Clinical Dossier Scan Viewer"
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
            >
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                    <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      {isVi
                        ? "Bản Quét Hồ sơ Xét nghiệm Gốc (Đối chiếu OCR)"
                        : "Original Document Scan (Source Grounding)"}
                    </h2>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    {activePatient.studyId}
                  </span>
                </div>

                {/* Viewer source tabs: patient-uploaded files vs grounded scan sheets */}
                <div className="mt-2 flex gap-1">
                  {(
                    [
                      ["uploaded", isVi ? "Tệp bệnh nhân tải lên" : "Patient uploaded files"],
                      ["grounded", isVi ? "Bản quét có khung đối chiếu" : "Grounded scan sheets"],
                    ] as ["uploaded" | "grounded", string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      id={`crf-viewer-tab-${key}`}
                      onClick={() => setViewerTabOverride(key)}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                        viewerTab === key
                          ? "bg-teal-700 text-white"
                          : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Dossier Sheet Switcher */}
                <div
                  className={`mt-2 flex flex-wrap gap-1 ${
                    viewerTab === "grounded" ? "" : "hidden"
                  }`}
                >
                  {(
                    [
                      ["all", isVi ? "Toàn bộ" : "All Panels"],
                      ["immunology", isVi ? "Miễn dịch" : "Immunology"],
                      ["renal", isVi ? "Thận" : "Renal"],
                      ["hematology", isVi ? "Huyết học" : "CBC"],
                      ["infectious", isVi ? "Truyền nhiễm" : "Infectious"],
                      ["pft", isVi ? "Hô hấp PFT" : "PFTs"],
                    ] as [ScanDossierFilter, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setScanPanelFilter(key)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition cursor-pointer ${
                        scanPanelFilter === key
                          ? "bg-slate-900 text-white"
                          : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {viewerTab === "uploaded" && (
                <div className="relative flex-1 overflow-y-auto bg-slate-200/75 p-4">
                  {uploadedFiles.length === 0 ? (
                    <p className="rounded-lg bg-white p-4 text-xs text-slate-600">
                      {isVi
                        ? "Bệnh nhân chưa tải tệp nào."
                        : "This patient has not uploaded any file."}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {uploadedFiles.map((f, i) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setActiveFileIdx(i)}
                            className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                              currentFile?.id === f.id
                                ? "bg-slate-900 text-white"
                                : "bg-white text-slate-700"
                            }`}
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                      {currentFile?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentFile.url}
                          alt={currentFile.name}
                          className="w-full rounded border border-slate-300 bg-white object-contain"
                        />
                      ) : (
                        <div className="rounded-lg border border-slate-300 bg-white p-4 text-xs text-slate-600">
                          <p className="font-semibold text-slate-900">
                            {currentFile?.name}
                          </p>
                          <p className="mt-1">
                            {isVi
                              ? "Không có bản xem trước cho tệp này. Dùng tab “Bản quét có khung đối chiếu” để đối chiếu từng chỉ số."
                              : "No inline preview for this file. Use the “Grounded scan sheets” tab to compare each field."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Simulated Scanned Hospital Lab Paper */}
              <div
                className={`relative flex-1 overflow-y-auto bg-slate-200/75 p-4 ${
                  viewerTab === "grounded" ? "" : "hidden"
                }`}
              >
                <div className="relative mx-auto rounded-lg border border-slate-300 bg-[#fcfcfa] p-4 text-slate-800 shadow-md">
                  {isScanning && (
                    <div className="animate-ocr-scan pointer-events-none absolute left-0 right-0 z-30 h-1 bg-teal-500 shadow-[0_0_16px_3px_rgba(13,148,136,0.65)]" />
                  )}

                  {uploadedScan?.url ? (
                    <div className="mb-3 space-y-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>
                          {isVi ? "Tệp đã tải lên:" : "Uploaded file:"}{" "}
                          <strong>{uploadedScan.name}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setUploadedScan(null)}
                          className="font-semibold text-teal-800 underline cursor-pointer"
                        >
                          {isVi ? "Đóng ảnh" : "Close preview"}
                        </button>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedScan.url}
                        alt={uploadedScan.name}
                        className="max-h-56 w-full rounded border border-slate-200 object-contain"
                      />
                    </div>
                  ) : null}

                  {/* Hospital Sheet Header */}
                  <div className="border-b-2 border-slate-800 pb-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono text-[10px] font-bold uppercase text-teal-900">
                          VINMEC CENTRAL LABORATORY • SLE DOSSIER
                        </p>
                        <h3 className="text-xs font-bold text-slate-900">
                          {isVi
                            ? "Phiếu Kết quả Xét nghiệm & Thăm dò Chức năng (Bản gốc)"
                            : "Official Clinical Lab & Diagnostic Printout"}
                        </h3>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-slate-700">
                        {activePatient.studyId}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between rounded bg-slate-100 px-2 py-1 font-mono text-[10px]">
                      <span>
                        PT: <strong>{activePatient.patientName}</strong> (
                        {activePatient.age}
                        {activePatient.gender === "Female" ? "F" : "M"})
                      </span>
                      <span>ICF: {activePatient.icfSignedDate}</span>
                    </div>
                  </div>

                  {/* Interactive Printed Rows on Original Scan */}
                  <div className="mt-2.5 space-y-1.5">
                    {docViewerFields.map((field) => {
                      const isSelected = selectedGroundingId === field.id;
                      const isManual =
                        field.status === "manual_required" ||
                        !field.value.trim();
                      const isVerify =
                        field.status === "needs_verify" &&
                        field.value.trim().length > 0;

                      return (
                        <div
                          key={field.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedGroundingId(field.id);
                            setActiveSection(field.sectionId);
                            setTimeout(() => {
                              const el = document.getElementById(
                                `crf-input-${field.id}`
                              );
                              el?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                              el?.focus();
                            }, 80);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedGroundingId(field.id);
                              setActiveSection(field.sectionId);
                            }
                          }}
                          className={`relative grid grid-cols-12 items-center rounded border-2 px-2 py-1.5 font-mono text-[10px] transition cursor-pointer ${
                            isSelected
                              ? isManual
                                ? "border-rose-600 bg-rose-100/60 ring-2 ring-rose-500/40"
                                : isVerify
                                ? "border-amber-600 bg-amber-100/60 ring-2 ring-amber-500/40"
                                : "border-teal-700 bg-teal-50/70 ring-2 ring-teal-600/35"
                              : isManual
                              ? "border-dashed border-rose-500 bg-rose-50/40 hover:bg-rose-50"
                              : isVerify
                              ? "border-dashed border-amber-500 bg-amber-50/35 hover:bg-amber-50"
                              : "border-teal-600/35 bg-white hover:border-teal-700"
                          }`}
                        >
                          <div className="col-span-6 pr-1">
                            <span className="font-sans font-semibold text-slate-900">
                              {isVi ? field.labelVi : field.labelEn}
                            </span>
                            <span className="ml-1 text-[9px] text-slate-500">
                              [{field.code}]
                            </span>
                          </div>
                          <div className="col-span-4 text-right font-bold text-slate-900">
                            {field.printedValue}
                            {field.printedSecondaryValue
                              ? ` (${field.printedSecondaryValue})`
                              : ""}{" "}
                            <span className="font-normal text-[9px] text-slate-500">
                              {field.unit}
                            </span>
                          </div>
                          <div className="col-span-2 text-right">
                            <span
                              className={`rounded px-1 py-0.2 text-[9px] font-bold ${
                                isManual
                                  ? "bg-rose-600 text-white"
                                  : isVerify
                                  ? "bg-amber-500 text-white"
                                  : "bg-teal-100 text-teal-900"
                              }`}
                            >
                              {field.confidence}%
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Antibody Blot Grounding Strip */}
                    <div className="mt-3 border-t border-slate-300 pt-2">
                      <p className="font-mono text-[9px] font-bold uppercase text-slate-500">
                        {isVi
                          ? "Bản In Immunoblot (ANA Profile 23 & Myositis)"
                          : "Immunoblot Strip Printout (ANA-23 & Myositis)"}
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        {activePatient.antibodyBlots
                          .filter(
                            (b) =>
                              b.printedResult !== "Negative" ||
                              b.confidence <= 90
                          )
                          .map((b) => {
                            const isManual =
                              b.status === "manual_required" || !b.result;
                            const isVerify =
                              b.status === "needs_verify" && Boolean(b.result);
                            return (
                              <div
                                key={b.id}
                                onClick={() => {
                                  setSelectedGroundingId(b.id);
                                  setActiveSection("immunology");
                                }}
                                className={`rounded border px-2 py-1 font-mono text-[10px] cursor-pointer ${
                                  isManual
                                    ? "border-rose-500 bg-rose-50 text-rose-950"
                                    : isVerify
                                    ? "border-amber-500 bg-amber-50 text-amber-950"
                                    : "border-slate-300 bg-white text-slate-800"
                                }`}
                              >
                                <div className="flex justify-between font-bold">
                                  <span>{b.name}</span>
                                  <span>{b.confidence}%</span>
                                </div>
                                <div className="text-[9px]">
                                  Print: <strong>{b.printedResult}</strong>{" "}
                                  {b.printedIntensity}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Viewer Legend */}
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    🔴 <strong>&lt;80%</strong>:{" "}
                    {isVi ? "Đọc số in & nhập tay" : "Read scan & add"}
                  </span>
                  <span>
                    🟡 <strong>80–90%</strong>:{" "}
                    {isVi ? "Xác nhận lại" : "Verify"}
                  </span>
                  <span>
                    🟢 <strong>&gt;90%</strong>:{" "}
                    {isVi ? "Tự động duyệt" : "Auto-approve"}
                  </span>
                </div>
              </div>
            </aside>
          )}

          {/* RIGHT PANE: Complete 6-Section SLE Case Report Form */}
          <div
            className={`space-y-6 ${
              showDocViewer ? "lg:col-span-7" : "lg:col-span-12"
            }`}
          >
            {/* STEP 1: focused triage queue */}
            {workflowStep === "step1_triage" && (
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="border-b border-slate-200 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    {isVi ? "Bước 1 — Xử lý mục OCR cần kiểm tra" : "Step 1 — Resolve flagged OCR fields"}
                  </h2>
                  <p className="text-xs text-slate-600">
                    {isVi
                      ? `Đã xử lý ${triageStats.total - triageStats.unresolved}/${triageStats.total}. Đối chiếu từng mục với bản quét gốc.`
                      : `${triageStats.total - triageStats.unresolved} of ${triageStats.total} resolved. Compare each item with the original scan.`}
                  </p>
                </div>

                {triageStats.unresolved === 0 && (
                  <p className="rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-900">
                    ✓ {isVi ? "Mọi mục đã được xác thực. Tiếp tục sang Bước 2." : "Everything is resolved. Continue to Step 2."}
                  </p>
                )}

                {triageStats.manualUnder80 > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-rose-800">
                      🔴 {isVi ? "Xem bản gốc & nhập tay (<80%)" : "Check scan & enter value (<80%)"}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {activePatient.ocrFields
                        .filter((f) => f.status === "manual_required" || !f.value.trim())
                        .map(renderOcrFieldRow)}
                    </div>
                  </div>
                )}

                {activePatient.antibodyBlots.some(
                  (b) => b.status === "manual_required" || !b.result || b.status === "needs_verify"
                ) && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      {isVi ? "Kháng thể immunoblot cần xử lý" : "Immunoblot antibodies to resolve"}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activePatient.antibodyBlots
                        .filter((b) => b.status === "manual_required" || !b.result || b.status === "needs_verify")
                        .map((b) => {
                          const manual = b.status === "manual_required" || !b.result;
                          return (
                            <div
                              key={b.id}
                              onClick={() => setSelectedGroundingId(b.id)}
                              className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                                manual ? "border-rose-300 bg-rose-50/40" : "border-amber-300 bg-amber-50/40"
                              }`}
                            >
                              <span>
                                <strong className="text-slate-900">{b.name}</strong>{" "}
                                <span className="text-slate-500">({b.confidence}%)</span>
                                <span className="block text-slate-600">
                                  {isVi ? "Bản in" : "Printed"}: {b.printedResult} {b.printedIntensity}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateBlotRow(
                                    b.id,
                                    manual
                                      ? { result: b.printedResult, intensity: b.printedIntensity, status: "user_verified" }
                                      : { status: "user_verified" }
                                  );
                                }}
                                className={`rounded-lg px-3 py-1.5 font-semibold text-white cursor-pointer ${
                                  manual ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                                }`}
                              >
                                {manual
                                  ? isVi ? `+ Nhập "${b.printedResult}"` : `+ Fill "${b.printedResult}"`
                                  : isVi ? "✓ Xác nhận" : "✓ Verify"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {triageStats.verify80to90 > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">
                        🟡 {isVi ? "Xác nhận giá trị điền sẵn (80–90%)" : "Confirm pre-filled values (80–90%)"}
                      </h3>
                      <button
                        type="button"
                        onClick={handleVerifyAll80To90}
                        className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 cursor-pointer"
                      >
                        {isVi ? "✓ Xác nhận tất cả 80–90%" : "✓ Verify all 80–90%"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {activePatient.ocrFields
                        .filter((f) => f.status === "needs_verify" && f.value.trim())
                        .map(renderOcrFieldRow)}
                    </div>
                  </div>
                )}

                <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <summary className="cursor-pointer text-xs font-bold text-teal-900">
                    🟢 {isVi ? "Đã tự động duyệt / xác nhận" : "Auto-approved & verified"} ({triageStats.approved})
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {activePatient.ocrFields
                      .filter(
                        (f) =>
                          (f.status === "auto_approved" || f.status === "user_verified") &&
                          f.value.trim()
                      )
                      .map(renderOcrFieldRow)}
                  </div>
                </details>
              </section>
            )}

            {/* STEP 3: readiness summary */}
            {workflowStep === "step3_signoff" && (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <h2 className="text-base font-bold text-slate-900">
                  {isVi ? "Bước 3 — Phê duyệt & xuất" : "Step 3 — Approve & export"}
                </h2>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <dt className="text-xs text-slate-500">{isVi ? "Xác thực OCR" : "OCR verification"}</dt>
                    <dd className={`text-sm font-bold ${triageStats.unresolved ? "text-rose-700" : "text-teal-800"}`}>
                      {triageStats.total - triageStats.unresolved}/{triageStats.total}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <dt className="text-xs text-slate-500">EULAR/ACR 2019</dt>
                    <dd className="text-sm font-bold text-slate-900">
                      {eularSummary.totalScore} — {eularSummary.isClassifiedSle ? (isVi ? "Đủ tiêu chuẩn SLE" : "SLE classified") : (isVi ? "Chưa đủ" : "Below threshold")}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <dt className="text-xs text-slate-500">SLEDAI-2K</dt>
                    <dd className="text-sm font-bold text-slate-900">
                      {sledaiSummary.totalScore} — {isVi ? sledaiSummary.activityTierVi : sledaiSummary.activityTierEn}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    id="crf-mode-clean"
                    aria-pressed={viewMode === "clean"}
                    onClick={() => setViewMode(viewMode === "clean" ? "edit" : "clean")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    {viewMode === "clean"
                      ? isVi ? "Ẩn bản .docx" : "Hide .docx preview"
                      : isVi ? "📄 Xem bản .docx" : "📄 Show .docx preview"}
                  </button>
                </div>
              </section>
            )}

            {/* .docx-FORMATTED DOCUMENT VIEW (Step 3 only) */}
            {workflowStep === "step3_signoff" && viewMode === "clean" && (
              <DocxCrfView
                patient={activePatient}
                isVi={isVi}
                bmi={calculatedBmi}
                selectedId={selectedGroundingId}
                onSelect={setSelectedGroundingId}
                onUpdateField={handleUpdateOcrField}
                onVerifyField={handleVerifyOcrField}
                onUpdateBlot={handleUpdateBlotRow}
              />
            )}

            {/* SECTION 1: ADMINISTRATIVE & DEMOGRAPHICS */}
            {showSection("demographics") && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                      SECTION 01 • CASE REPORT FORM HEADER
                    </span>
                    <h2 className="text-base font-bold text-slate-900">
                      {isVi
                        ? "Thông tin Hành chính & Nhân trắc học"
                        : "Administrative & Patient Demographics"}
                    </h2>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800">
                    BMI: {calculatedBmi} kg/m²
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Study ID (XX-XXXX-XX)
                    </label>
                    <input
                      type="text"
                      value={activePatient.studyId}
                      onChange={(e) =>
                        patchPatient((p) => ({ ...p, studyId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {isVi ? "Họ và Tên Bệnh nhân" : "Patient Full Name"}
                    </label>
                    <input
                      type="text"
                      value={activePatient.patientName}
                      onChange={(e) =>
                        patchPatient((p) => ({
                          ...p,
                          patientName: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {isVi ? "Tuổi (Age)" : "Age"}
                      </label>
                      <input
                        type="number"
                        value={activePatient.age}
                        onChange={(e) =>
                          patchPatient((p) => ({ ...p, age: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {isVi ? "Giới tính" : "Gender"}
                      </label>
                      <select
                        value={activePatient.gender}
                        onChange={(e) =>
                          patchPatient((p) => ({
                            ...p,
                            gender: e.target.value as "Female" | "Male",
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900"
                      >
                        <option value="Female">
                          {isVi ? "Nữ (Female)" : "Female"}
                        </option>
                        <option value="Male">
                          {isVi ? "Nam (Male)" : "Male"}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {isVi
                        ? "Ngày ký ICF (DD/MM/YYYY)"
                        : "ICF Signed Date (DD/MM/YYYY)"}
                    </label>
                    <input
                      type="text"
                      value={activePatient.icfSignedDate}
                      onChange={(e) =>
                        patchPatient((p) => ({
                          ...p,
                          icfSignedDate: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {isVi ? "Chiều cao (cm)" : "Height (cm)"}
                      </label>
                      <input
                        type="number"
                        value={activePatient.heightCm}
                        onChange={(e) =>
                          patchPatient((p) => ({
                            ...p,
                            heightCm: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        {isVi ? "Cân nặng (kg)" : "Weight (kg)"}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={activePatient.weightKg}
                        onChange={(e) =>
                          patchPatient((p) => ({
                            ...p,
                            weightKg: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {isVi ? "Chỉ số BMI (Tự động)" : "BMI (Auto-calculated)"}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${calculatedBmi} kg/m²`}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs font-bold text-teal-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {isVi ? "Bác sĩ điều trị (Physician)" : "Physician"}
                    </label>
                    <input
                      type="text"
                      value={activePatient.physician}
                      onChange={(e) =>
                        patchPatient((p) => ({
                          ...p,
                          physician: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {isVi ? "Điều dưỡng (Nurse)" : "Nurse"}
                    </label>
                    <input
                      type="text"
                      value={activePatient.nurse}
                      onChange={(e) =>
                        patchPatient((p) => ({ ...p, nurse: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 2: MEDICAL HISTORY & INFECTIOUS SCREENING */}
            {showSection("medical_history") && (
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="border-b border-slate-200 pb-3">
                  <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                    SECTION 02 • MEDICAL HISTORY
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    {isVi
                      ? "Tiền sử Y khoa, Sàng lọc Nhiễm trùng & Điều trị"
                      : "Medical History, Infectious Screening & Treatments"}
                  </h2>
                </div>

                {/* Pregnancy (If Female) */}
                {activePatient.gender === "Female" && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      {isVi
                        ? "Thai kỳ (Nếu là Nữ) — Beta-hCG"
                        : "Pregnancy (If Female) — Beta-hCG"}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {activePatient.ocrFields
                        .filter((f) => f.code === "BETA-HCG")
                        .map(renderOcrFieldRow)}
                    </div>
                  </div>
                )}

                {/* Malignant Disease & Other Comorbidities */}
                <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi ? "Bệnh ác tính (Malignant disease)" : "Malignant disease"}
                      </span>
                      <div className="flex gap-2">
                        {(["NO", "YES"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              patchPatient((p) => ({
                                ...p,
                                malignantDisease: opt,
                              }))
                            }
                            className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                              activePatient.malignantDisease === opt
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    {activePatient.malignantDisease === "YES" && (
                      <input
                        type="text"
                        placeholder={isVi ? "Ghi rõ bệnh ác tính..." : "Specify malignant disease..."}
                        value={activePatient.malignantSpecify}
                        onChange={(e) =>
                          patchPatient((p) => ({
                            ...p,
                            malignantSpecify: e.target.value,
                          }))
                        }
                        className="mt-2.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi ? "Bệnh đồng mắc khác (Other comorbidities)" : "Other comorbidities"}
                      </span>
                      <div className="flex gap-2">
                        {(["NO", "YES"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              patchPatient((p) => ({
                                ...p,
                                otherComorbidities: opt,
                              }))
                            }
                            className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                              activePatient.otherComorbidities === opt
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    {activePatient.otherComorbidities === "YES" && (
                      <input
                        type="text"
                        placeholder={isVi ? "Ghi rõ bệnh đồng mắc..." : "Specify comorbidities..."}
                        value={activePatient.otherComorbiditiesSpecify}
                        onChange={(e) =>
                          patchPatient((p) => ({
                            ...p,
                            otherComorbiditiesSpecify: e.target.value,
                          }))
                        }
                        className="mt-2.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      />
                    )}
                  </div>
                </div>

                {/* Family Autoimmune Disease History */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {isVi
                        ? "Tiền sử Gia đình mắc Bệnh Tự miễn (Family Autoimmune Disease History)"
                        : "Family Autoimmune Disease History"}
                    </span>
                    <div className="flex gap-2">
                      {(["NO", "YES"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({
                              ...p,
                              familyAutoimmuneHistory: opt,
                            }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.familyAutoimmuneHistory === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activePatient.familyAutoimmuneHistory === "YES" && (
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        {(
                          [
                            ["Father", isVi ? "Bố (Father)" : "Father"],
                            ["Mother", isVi ? "Mẹ (Mother)" : "Mother"],
                            ["Brother", isVi ? "Anh/Em trai (Brother)" : "Brother"],
                            ["Sister", isVi ? "Chị/Em gái (Sister)" : "Sister"],
                            ["Child", isVi ? "Con (Child)" : "Child"],
                            ["Others", isVi ? "Khác (Others)" : "Others"],
                          ] as [keyof typeof activePatient.familyRelatives, string][]
                        ).map(([relKey, relLabel]) => (
                          <label
                            key={relKey}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={activePatient.familyRelatives[relKey]}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  familyRelatives: {
                                    ...p.familyRelatives,
                                    [relKey]: e.target.checked,
                                  },
                                }))
                              }
                            />
                            <span>{relLabel}</span>
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          {isVi
                            ? "Ai mắc? Bệnh tự miễn gì? (Who? Which diseases?)"
                            : "Who? Which diseases?"}
                        </label>
                        <input
                          type="text"
                          value={activePatient.familyDiseaseSpecify}
                          onChange={(e) =>
                            patchPatient((p) => ({
                              ...p,
                              familyDiseaseSpecify: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Fever & History of Infection */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi ? "Sốt (Fever)" : "Fever"}
                      </span>
                      <div className="flex gap-2">
                        {(["YES", "NO"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              patchPatient((p) => ({ ...p, fever: opt }))
                            }
                            className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                              activePatient.fever === opt
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activePatient.fever === "YES" && (
                      <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              {isVi ? "Nhiệt độ cao nhất (°C)" : "Temperature °C (highest)"}
                            </label>
                            <input
                              type="text"
                              value={activePatient.feverTempC}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  feverTempC: e.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              {isVi ? "Ngày khởi phát" : "Date of onset"}
                            </label>
                            <input
                              type="text"
                              value={activePatient.feverOnsetDate}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  feverOnsetDate: e.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600">
                            {isVi ? "Kiểu sốt (Type)" : "Fever Type"}
                          </label>
                          <select
                            value={activePatient.feverType}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                feverType: e.target.value as
                                  | "periodic"
                                  | "prolonged"
                                  | "others",
                              }))
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1"
                          >
                            <option value="periodic">
                              {isVi ? "Sốt chu kỳ (Periodic fever)" : "Periodic fever"}
                            </option>
                            <option value="prolonged">
                              {isVi ? "Sốt kéo dài (Prolonged fever)" : "Prolonged fever"}
                            </option>
                            <option value="others">
                              {isVi ? "Khác (Others)" : "Others"}
                            </option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* History of Infection */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi ? "Tiền sử Nhiễm trùng (History of Infection)" : "History of Infection"}
                      </span>
                      <div className="flex gap-1.5">
                        {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              patchPatient((p) => ({
                                ...p,
                                historyOfInfection: opt,
                              }))
                            }
                            className={`rounded px-2 py-1 font-mono text-[11px] font-bold cursor-pointer ${
                              activePatient.historyOfInfection === opt
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activePatient.historyOfInfection === "YES" && (
                      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                        {activePatient.infectionEpisodes.map((ep, idx) => (
                          <div
                            key={ep.id}
                            className="space-y-1.5 rounded border border-slate-200 bg-white p-2 text-xs"
                          >
                            <input
                              type="text"
                              placeholder="Factor / Pathogen"
                              value={ep.factor}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  infectionEpisodes: p.infectionEpisodes.map(
                                    (item, i) =>
                                      i === idx
                                        ? { ...item, factor: e.target.value }
                                        : item
                                  ),
                                }))
                              }
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium"
                            />
                            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                              <input
                                type="text"
                                placeholder="Onset DD/MM/YYYY"
                                value={ep.dateOfOnset}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    infectionEpisodes: p.infectionEpisodes.map(
                                      (item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              dateOfOnset: e.target.value,
                                            }
                                          : item
                                    ),
                                  }))
                                }
                                className="rounded border border-slate-200 px-2 py-1"
                              />
                              <input
                                type="text"
                                placeholder="Normalized DD/MM/YYYY"
                                value={ep.dateOfNormalization}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    infectionEpisodes: p.infectionEpisodes.map(
                                      (item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              dateOfNormalization:
                                                e.target.value,
                                            }
                                          : item
                                    ),
                                  }))
                                }
                                className="rounded border border-slate-200 px-2 py-1"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({
                              ...p,
                              infectionEpisodes: [
                                ...p.infectionEpisodes,
                                {
                                  id: `inf-${Date.now()}`,
                                  factor: "",
                                  dateOfOnset: "",
                                  dateOfNormalization: "",
                                },
                              ],
                            }))
                          }
                          className="text-xs font-semibold text-teal-800 hover:underline cursor-pointer"
                        >
                          {isVi ? "+ Thêm đợt nhiễm trùng" : "+ Add infection episode"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 13 Infectious Diseases Screening OCR Fields */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      {isVi
                        ? "Sàng lọc Bệnh Truyền nhiễm (Trích xuất từ Hệ thống / Bản cứng OCR)"
                        : "Infectious Diseases Screening (OCR Extracted from Lab Sheet)"}
                    </h3>
                    <span className="font-mono text-[10px] text-slate-500">
                      *Performed if IgM positive
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {activePatient.ocrFields
                      .filter(
                        (f) =>
                          f.sectionId === "medical_history" &&
                          f.code !== "BETA-HCG"
                      )
                      .map(renderOcrFieldRow)}
                  </div>
                </div>

                {/* Current / Previous Treatment / Vaccination Table */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      {isVi
                        ? "Điều trị / Tiêm chủng Hiện tại & Trước đây"
                        : "Current / Previous Treatment & Vaccination"}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        patchPatient((p) => ({
                          ...p,
                          treatmentStatus: "YES",
                          treatments: [
                            ...p.treatments,
                            {
                              id: `trt-${Date.now()}`,
                              group: "Medication",
                              name: "",
                              route: "PO",
                              dose: "",
                              frequency: "",
                              duration: "",
                            },
                          ],
                        }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {isVi ? "+ Thêm Thuốc / Vắc-xin" : "+ Add Medication / Vaccine"}
                    </button>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                          <th className="px-3 py-2">{isVi ? "Nhóm" : "Group"}</th>
                          <th className="px-3 py-2">{isVi ? "Tên thuốc / Vắc-xin" : "Name"}</th>
                          <th className="px-3 py-2">{isVi ? "Đường dùng" : "Route"}</th>
                          <th className="px-3 py-2">{isVi ? "Liều" : "Dose"}</th>
                          <th className="px-3 py-2">{isVi ? "Tần suất" : "Frequency"}</th>
                          <th className="px-3 py-2">{isVi ? "Thời gian (Bắt đầu/Kết thúc)" : "Duration (Begin/End)"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activePatient.treatments.map((trt, idx) => (
                          <tr key={trt.id}>
                            <td className="p-2">
                              <select
                                value={trt.group}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? {
                                            ...t,
                                            group: e.target.value as
                                              | "Medication"
                                              | "Vaccine"
                                              | "Other",
                                          }
                                        : t
                                    ),
                                  }))
                                }
                                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                              >
                                <option value="Medication">Medication</option>
                                <option value="Vaccine">Vaccine</option>
                                <option value="Other">Other</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={trt.name}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? { ...t, name: e.target.value }
                                        : t
                                    ),
                                  }))
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-semibold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={trt.route}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? { ...t, route: e.target.value }
                                        : t
                                    ),
                                  }))
                                }
                                className="w-20 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={trt.dose}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? { ...t, dose: e.target.value }
                                        : t
                                    ),
                                  }))
                                }
                                className="w-24 rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={trt.frequency}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? { ...t, frequency: e.target.value }
                                        : t
                                    ),
                                  }))
                                }
                                className="w-28 rounded border border-slate-200 px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={trt.duration}
                                onChange={(e) =>
                                  patchPatient((p) => ({
                                    ...p,
                                    treatments: p.treatments.map((t, i) =>
                                      i === idx
                                        ? { ...t, duration: e.target.value }
                                        : t
                                    ),
                                  }))
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 3: ORGANS DAMAGE (9 ORGAN SYSTEMS) */}
            {showSection("organs_damage") && (
              <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="border-b border-slate-200 pb-3">
                  <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                    SECTION 03 • ORGANS DAMAGE ASSESSMENT
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    {isVi
                      ? "Đánh giá Tổn thương 9 Hệ Cơ quan & Cận lâm sàng"
                      : "9-System Organ Damage & Diagnostic Assessment"}
                  </h2>
                </div>

                {/* 3.1 Skin and Mucosa */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.1 {isVi ? "Da và Niêm mạc (Skin and Mucosa)" : "Skin and Mucosa"}
                    </h3>
                    <div className="flex gap-1.5">
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({
                              ...p,
                              skinMucosaAbnormality: opt,
                            }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.skinMucosaAbnormality === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activePatient.skinMucosaAbnormality === "YES" && (
                    <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-3 sm:grid-cols-2">
                      {activePatient.skinMucosaItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-2.5 text-xs ${
                            item.checked
                              ? "border-teal-600/50 bg-teal-50/40"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  skinMucosaItems: p.skinMucosaItems.map(
                                    (it, i) =>
                                      i === idx
                                        ? { ...it, checked: e.target.checked }
                                        : it
                                  ),
                                }))
                              }
                            />
                            <span>{isVi ? item.labelVi : item.labelEn}</span>
                          </label>
                          {item.checked && (
                            <input
                              type="text"
                              placeholder={
                                isVi ? "Mô tả chi tiết..." : "Specify details..."
                              }
                              value={item.specify}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  skinMucosaItems: p.skinMucosaItems.map(
                                    (it, i) =>
                                      i === idx
                                        ? { ...it, specify: e.target.value }
                                        : it
                                  ),
                                }))
                              }
                              className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3.2 Muscle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.2 {isVi ? "Cơ (Muscle)" : "Muscle"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {isVi ? "Tổn thương cơ?" : "Muscle damage?"}
                      </span>
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({ ...p, muscleDamage: opt }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.muscleDamage === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activePatient.ocrFields
                      .filter((f) => f.subSectionEn === "Muscle")
                      .map(renderOcrFieldRow)}
                  </div>
                </div>

                {/* 3.3 Joints */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.3 {isVi ? "Khớp (Joints)" : "Joints"}
                    </h3>
                    <div className="flex gap-1.5">
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({ ...p, jointsDamage: opt }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.jointsDamage === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activePatient.jointsDamage === "YES" && (
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            {isVi
                              ? "Số khớp sưng (Swollen joints)"
                              : "Number of swollen joints"}
                          </label>
                          <input
                            type="number"
                            value={activePatient.swollenJointsCount}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                swollenJointsCount: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            {isVi
                              ? "Số khớp đau (Tender joints)"
                              : "Number of tender joints"}
                          </label>
                          <input
                            type="number"
                            value={activePatient.tenderJointsCount}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                tenderJointsCount: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            {isVi
                              ? "Thang điểm đau VAS (/100)"
                              : "Visual Analogue Scale (VAS /100)"}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={activePatient.vasScore}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                vasScore: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>
                              {isVi
                                ? "Siêu âm khớp bất thường?"
                                : "Abnormal ultrasound?"}
                            </span>
                            <span className="font-mono text-teal-800">
                              {activePatient.abnormalUltrasound}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={activePatient.abnormalUltrasoundSpecify}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                abnormalUltrasoundSpecify: e.target.value,
                              }))
                            }
                            className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>
                              {isVi ? "X-quang bất thường?" : "Abnormal X-ray?"}
                            </span>
                            <span className="font-mono text-slate-700">
                              {activePatient.abnormalXray}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={activePatient.abnormalXraySpecify}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                abnormalXraySpecify: e.target.value,
                              }))
                            }
                            className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3.4 Kidneys & Lupus Nephritis Biopsy Class */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.4 {isVi ? "Thận & Sinh thiết Thận (Kidneys)" : "Kidneys & Renal Biopsy"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {isVi ? "Tổn thương thận?" : "Kidneys damage?"}
                      </span>
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({ ...p, kidneysDamage: opt }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.kidneysDamage === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activePatient.ocrFields
                      .filter((f) => f.subSectionEn === "Kidneys")
                      .map(renderOcrFieldRow)}
                  </div>

                  {/* Renal Biopsy ISN/RPS Classes I - VI */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi
                          ? "Sinh thiết thận (Renal Biopsy — Phân loại ISN/RPS)"
                          : "Renal Biopsy (ISN/RPS Lupus Nephritis Classification)"}
                      </span>
                      <div className="flex gap-2">
                        {(["NO", "YES"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              patchPatient((p) => ({
                                ...p,
                                renalBiopsyPerformed: opt,
                              }))
                            }
                            className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                              activePatient.renalBiopsyPerformed === opt
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activePatient.renalBiopsyPerformed === "YES" && (
                      <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3">
                        <div className="flex flex-wrap gap-2">
                          {RENAL_BIOPSY_CLASS_OPTIONS.map((cls) => {
                            const checked =
                              activePatient.renalBiopsyClasses.includes(cls);
                            return (
                              <button
                                key={cls}
                                type="button"
                                onClick={() =>
                                  patchPatient((p) => ({
                                    ...p,
                                    renalBiopsyClasses: checked
                                      ? p.renalBiopsyClasses.filter(
                                          (c) => c !== cls
                                        )
                                      : [...p.renalBiopsyClasses, cls],
                                  }))
                                }
                                className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition cursor-pointer ${
                                  checked
                                    ? "border-teal-700 bg-teal-700 text-white"
                                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                {cls}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          value={activePatient.renalBiopsyNote}
                          onChange={(e) =>
                            patchPatient((p) => ({
                              ...p,
                              renalBiopsyNote: e.target.value,
                            }))
                          }
                          placeholder={
                            isVi
                              ? "Ghi chú giải phẫu bệnh sinh thiết thận..."
                              : "Renal biopsy histopathology notes..."
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 3.5 Haematology */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.5 {isVi ? "Huyết học & Coombs Trực tiếp (Haematology)" : "Haematology & Direct Coombs"}
                    </h3>
                    <span className="font-mono text-xs font-semibold text-teal-800">
                      12 {isVi ? "Chỉ số OCR" : "OCR Biomarkers"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activePatient.ocrFields
                      .filter((f) => f.subSectionEn === "Haematology")
                      .map(renderOcrFieldRow)}
                  </div>
                </div>

                {/* 3.6 Cardiovascular */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.6{" "}
                      {isVi
                        ? "Tim mạch (Siêu âm tim / Điện tâm đồ)"
                        : "Cardiovascular (Echocardiography / ECG)"}
                    </h3>
                    <div className="flex gap-1.5">
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({
                              ...p,
                              cardiovascularAbnormality: opt,
                            }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.cardiovascularAbnormality === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activePatient.cardiovascularAbnormality === "YES" && (
                    <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-3 sm:grid-cols-2">
                      {activePatient.cardiovascularItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-2.5 text-xs ${
                            item.checked
                              ? "border-teal-600/50 bg-teal-50/40"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  cardiovascularItems:
                                    p.cardiovascularItems.map((it, i) =>
                                      i === idx
                                        ? { ...it, checked: e.target.checked }
                                        : it
                                    ),
                                }))
                              }
                            />
                            <span>{isVi ? item.labelVi : item.labelEn}</span>
                          </label>
                          {item.checked && (
                            <input
                              type="text"
                              value={item.specify}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  cardiovascularItems:
                                    p.cardiovascularItems.map((it, i) =>
                                      i === idx
                                        ? { ...it, specify: e.target.value }
                                        : it
                                    ),
                                }))
                              }
                              className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3.7 Lungs (PFTs & HRCT ILD Pattern) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      3.7{" "}
                      {isVi
                        ? "Phổi — Chức năng Hô hấp & HRCT Phổi kẽ (Lungs)"
                        : "Lungs — Spirometry / DLCO & ILD HRCT Pattern"}
                    </h3>
                    <div className="flex gap-1.5">
                      {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            patchPatient((p) => ({ ...p, lungDamage: opt }))
                          }
                          className={`rounded px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                            activePatient.lungDamage === opt
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activePatient.ocrFields
                      .filter((f) => f.subSectionEn === "Lungs")
                      .map(renderOcrFieldRow)}
                  </div>

                  {activePatient.lungDamage === "YES" && (
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 font-bold text-slate-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activePatient.lungIld}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                lungIld: e.target.checked,
                              }))
                            }
                          />
                          <span>
                            {isVi
                              ? "Bệnh phổi mô kẽ (Interstitial lung disease - ILD)"
                              : "Interstitial lung disease (ILD) — HRCT Pattern:"}
                          </span>
                        </label>

                        <label className="flex items-center gap-2 font-bold text-slate-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activePatient.lungPleuritis}
                            onChange={(e) =>
                              patchPatient((p) => ({
                                ...p,
                                lungPleuritis: e.target.checked,
                              }))
                            }
                          />
                          <span>
                            {isVi
                              ? "Viêm màng phổi / Tràn dịch màng phổi"
                              : "Pleuritis / Pleural effusion"}
                          </span>
                        </label>
                      </div>

                      {activePatient.lungIld && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ILD_HRCT_PATTERN_OPTIONS.map((pat) => {
                            const active =
                              activePatient.lungIldPatterns.includes(pat);
                            return (
                              <button
                                key={pat}
                                type="button"
                                onClick={() =>
                                  patchPatient((p) => ({
                                    ...p,
                                    lungIldPatterns: active
                                      ? p.lungIldPatterns.filter(
                                          (x) => x !== pat
                                        )
                                      : [...p.lungIldPatterns, pat],
                                  }))
                                }
                                className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold cursor-pointer ${
                                  active
                                    ? "border-teal-700 bg-teal-700 text-white"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                                }`}
                              >
                                {pat}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3.8 Neuropsychiatric & 3.9 Gastrointestinal */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        3.8 {isVi ? "Tâm thần kinh (Neuropsychiatric)" : "Neuropsychiatric"}
                      </h3>
                      <div className="flex gap-1">
                        {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map(
                          (opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                patchPatient((p) => ({
                                  ...p,
                                  neuropsychiatricDisorders: opt,
                                }))
                              }
                              className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold cursor-pointer ${
                                activePatient.neuropsychiatricDisorders === opt
                                  ? "bg-slate-900 text-white"
                                  : "border border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              {opt}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {activePatient.neuropsychiatricDisorders === "YES" && (
                      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs">
                        {activePatient.neuropsychiatricItems.map((it, idx) => (
                          <label
                            key={it.id}
                            className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={it.checked}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  neuropsychiatricItems:
                                    p.neuropsychiatricItems.map((item, i) =>
                                      i === idx
                                        ? { ...item, checked: e.target.checked }
                                        : item
                                    ),
                                }))
                              }
                            />
                            <span>{isVi ? it.labelVi : it.labelEn}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        3.9 {isVi ? "Tiêu hóa & Gan mật (GI)" : "Gastrointestinal"}
                      </h3>
                      <div className="flex gap-1">
                        {(["YES", "NO", "Unknown"] as YesNoUnknown[]).map(
                          (opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                patchPatient((p) => ({
                                  ...p,
                                  giDisorders: opt,
                                }))
                              }
                              className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold cursor-pointer ${
                                activePatient.giDisorders === opt
                                  ? "bg-slate-900 text-white"
                                  : "border border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              {opt}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {activePatient.ocrFields
                        .filter(
                          (f) => f.subSectionEn === "Gastrointestinal system"
                        )
                        .map(renderOcrFieldRow)}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 4: IMMUNOLOGY TESTS (CORE + ANA PROFILE 23 + MYOSITIS 16) */}
            {showSection("immunology") && (
              <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="border-b border-slate-200 pb-3">
                  <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                    SECTION 04 • IMMUNOLOGY TESTS
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    {isVi
                      ? "Xét nghiệm Miễn dịch, ANA Profile 23 & Kháng thể Viêm cơ (16)"
                      : "Core Immunology, ANA Profile 23 & Autoimmune Myositis Panel (16)"}
                  </h2>
                </div>

                {/* 4.1 Core Quantitative Immunology (21 OCR-extracted tests) */}
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">
                    4.1{" "}
                    {isVi
                      ? "Miễn dịch Định lượng & Bổ thể (21 Xét nghiệm OCR)"
                      : "Quantitative Immunology, APL & Complement (21 OCR Tests)"}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {activePatient.ocrFields
                      .filter((f) => f.sectionId === "immunology")
                      .map(renderOcrFieldRow)}
                  </div>
                </div>

                {/* 4.2 ANA Profile 23 & 4.3 Myositis 16 Blot Tables */}
                {(
                  [
                    [
                      "ana23",
                      "4.2 ANA (Profile 23) — Immunoblot",
                      "4.2 Bộ Kháng thể Kháng nhân ANA (Profile 23)",
                    ],
                    [
                      "myositis16",
                      "4.3 Autoimmune Myositis Antibody Panel (16 Antibodies)",
                      "4.3 Bộ Kháng thể Viêm cơ Tự miễn (16 Kháng thể)",
                    ],
                  ] as const
                ).map(([panelKey, titleEn, titleVi]) => {
                  const rows = activePatient.antibodyBlots.filter(
                    (b) =>
                      b.panel === panelKey &&
                      matchesTriageFilter(b.status, Boolean(b.result))
                  );

                  return (
                    <div
                      key={panelKey}
                      className="border-t border-slate-200 pt-4"
                    >
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-800">
                        {isVi ? titleVi : titleEn}
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                              <th className="px-3 py-2">
                                {isVi ? "Kháng thể" : "Antibody"}
                              </th>
                              <th className="px-3 py-2">
                                {isVi
                                  ? "Kết quả (Negative / Positive / Borderline)"
                                  : "Result (Negative / Positive / Borderline)"}
                              </th>
                              <th className="px-3 py-2">
                                {isVi
                                  ? "Cường độ (Nếu Dương tính / Ranh giới)"
                                  : "Intensity (If Positive / Borderline)"}
                              </th>
                              <th className="px-3 py-2 text-right">
                                {isVi ? "Phân tầng OCR" : "3-Tier OCR Status"}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {rows.map((row) => {
                              const isManual =
                                row.status === "manual_required" || !row.result;
                              const isVerify =
                                row.status === "needs_verify" &&
                                Boolean(row.result);

                              return (
                                <tr
                                  key={row.id}
                                  className={
                                    isManual
                                      ? "bg-rose-50/50"
                                      : isVerify
                                      ? "bg-amber-50/40"
                                      : "hover:bg-slate-50"
                                  }
                                >
                                  <td className="px-3 py-2 font-semibold text-slate-900">
                                    {row.name}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {(
                                        [
                                          "Negative",
                                          "Positive",
                                          "Borderline",
                                        ] as const
                                      ).map((opt) => (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() =>
                                            handleUpdateBlotRow(row.id, {
                                              result: opt as BlotResultStatus,
                                              intensity:
                                                row.intensity ||
                                                row.printedIntensity,
                                            })
                                          }
                                          className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold cursor-pointer ${
                                            row.result === opt
                                              ? opt === "Positive"
                                                ? "bg-rose-600 text-white"
                                                : opt === "Borderline"
                                                ? "bg-amber-600 text-white"
                                                : "bg-slate-800 text-white"
                                              : "border border-slate-200 bg-white text-slate-600"
                                          }`}
                                        >
                                          {opt}
                                        </button>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    {(row.result === "Positive" ||
                                      row.result === "Borderline" ||
                                      isManual) && (
                                      <input
                                        type="text"
                                        placeholder={
                                          isManual
                                            ? isVi
                                              ? "Xem bản gốc..."
                                              : "Check scan..."
                                            : "Intensity (+/++/+++)"
                                        }
                                        value={row.intensity}
                                        onChange={(e) =>
                                          handleUpdateBlotRow(row.id, {
                                            intensity: e.target.value,
                                          })
                                        }
                                        className="w-28 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold"
                                      />
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {isManual ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateBlotRow(row.id, {
                                            result: row.printedResult,
                                            intensity: row.printedIntensity,
                                            status: "user_verified",
                                          })
                                        }
                                        className="rounded bg-rose-600 px-2.5 py-1 font-mono text-[10px] font-bold text-white hover:bg-rose-700 cursor-pointer"
                                      >
                                        🔴 &lt;80% ({row.confidence}%) •{" "}
                                        {isVi
                                          ? `Nhập "${row.printedResult}"`
                                          : `Add "${row.printedResult}"`}
                                      </button>
                                    ) : isVerify ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateBlotRow(row.id, {
                                            status: "user_verified",
                                          })
                                        }
                                        className="rounded bg-amber-600 px-2.5 py-1 font-mono text-[10px] font-bold text-white hover:bg-amber-700 cursor-pointer"
                                      >
                                        🟡{" "}
                                        {isVi
                                          ? `Xác nhận (${row.confidence}%)`
                                          : `Verify (${row.confidence}%)`}
                                      </button>
                                    ) : (
                                      <span className="font-mono text-[10px] font-semibold text-teal-800">
                                        🟢 {row.confidence}%{" "}
                                        {row.status === "auto_approved"
                                          ? "Auto"
                                          : "Verified"}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* SECTION 5: DIAGNOSIS — 2019 EULAR/ACR SLE CLASSIFICATION */}
            {showSection("eular_acr") && (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                      SECTION 05 • DIAGNOSIS
                    </span>
                    <h2 className="text-base font-bold text-slate-900">
                      {isVi
                        ? "Tiêu chuẩn Phân loại SLE EULAR/ACR 2019"
                        : "SLE: 2019 EULAR/ACR Classification Criteria"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {isVi
                        ? "Trong mỗi miền (Domain), chỉ tiêu chuẩn có trọng số cao nhất được tính vào tổng điểm. Phân loại SLE khi ≥ 10 điểm."
                        : "Within each domain, only the highest-weighted criterion is counted toward the total score. Classify as SLE if ≥ 10 points."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      id="crf-btn-autoscore"
                      onClick={handleAutoSuggestScores}
                      className="rounded-xl border border-teal-700/40 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
                    >
                      {isVi
                        ? "⚡ Tự động Gợi ý Điểm từ Xét nghiệm"
                        : "⚡ Auto-Suggest from Verified CRF Data"}
                    </button>
                    <div
                      className={`rounded-xl border px-3.5 py-2 text-right font-mono ${
                        eularSummary.isClassifiedSle
                          ? "border-teal-600 bg-teal-700 text-white"
                          : "border-slate-300 bg-slate-100 text-slate-800"
                      }`}
                    >
                      <p className="text-[10px] uppercase">
                        {eularSummary.isClassifiedSle
                          ? isVi
                            ? "ĐỦ TIÊU CHUẨN SLE (≥10)"
                            : "SLE CLASSIFIED (≥10)"
                          : isVi
                          ? "CHƯA ĐỦ (<10)"
                          : "BELOW THRESHOLD (<10)"}
                      </p>
                      <p className="text-sm font-bold">
                        Total = {eularSummary.totalScore} pts
                      </p>
                    </div>
                  </div>
                </div>

                {/* Entry Criterion Toggle */}
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 cursor-pointer">
                  <span>
                    {isVi
                      ? "Tiêu chuẩn đầu vào bắt buộc: Kháng thể kháng nhân ANA ≥ 1:80 trên tế bào HEp-2"
                      : "Mandatory Entry Criterion: ANA ≥ 1:80 on HEp-2 cells (or equivalent positive test)"}
                  </span>
                  <input
                    type="checkbox"
                    checked={activePatient.anaEntryCriterionMet}
                    onChange={(e) =>
                      patchPatient((p) => ({
                        ...p,
                        anaEntryCriterionMet: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-teal-700"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {(["clinical", "immunological"] as const).map((cat) => {
                    const catItems = activePatient.eularAcrCriteria.filter(
                      (c) => c.domainCategory === cat
                    );
                    return (
                      <div
                        key={cat}
                        className="rounded-xl border border-slate-200 p-3.5"
                      >
                        <h3 className="mb-2.5 font-mono text-xs font-bold uppercase text-slate-800">
                          {cat === "clinical"
                            ? isVi
                              ? `Miền Lâm sàng (Điểm: ${eularSummary.clinicalScore})`
                              : `Clinical Domains (Score: ${eularSummary.clinicalScore})`
                            : isVi
                            ? `Miền Miễn dịch học (Điểm: ${eularSummary.immunologicalScore})`
                            : `Immunological Domains (Score: ${eularSummary.immunologicalScore})`}
                        </h3>
                        <div className="space-y-2">
                          {catItems.map((item) => {
                            const domainMax =
                              eularSummary.domainMaxMap[item.domainId]
                                ?.maxWeight || 0;
                            const isCountedMax =
                              item.checked && item.weight === domainMax;

                            return (
                              <label
                                key={item.id}
                                className={`flex items-center justify-between rounded-lg border p-2.5 text-xs transition cursor-pointer ${
                                  item.checked
                                    ? isCountedMax
                                      ? "border-teal-600 bg-teal-50/70"
                                      : "border-slate-300 bg-slate-100/70"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="pr-2">
                                  <span className="font-mono text-[10px] font-bold uppercase text-slate-500">
                                    {isVi
                                      ? item.domainLabelVi
                                      : item.domainLabelEn}
                                  </span>
                                  <p className="font-semibold text-slate-900">
                                    {isVi ? item.labelVi : item.labelEn}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                                    +{item.weight}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={(e) =>
                                      patchPatient((p) => ({
                                        ...p,
                                        eularAcrCriteria:
                                          p.eularAcrCriteria.map((c) =>
                                            c.id === item.id
                                              ? {
                                                  ...c,
                                                  checked: e.target.checked,
                                                }
                                              : c
                                          ),
                                      }))
                                    }
                                    className="h-4 w-4 accent-teal-700"
                                  />
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SECTION 6: DISEASE ACTIVITY ASSESSMENT — SLEDAI-2K */}
            {showSection("sledai_2k") && (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <span className="font-mono text-[11px] font-bold uppercase text-teal-800">
                      SECTION 06 • DISEASE ACTIVITY ASSESSMENT
                    </span>
                    <h2 className="text-base font-bold text-slate-900">
                      {isVi
                        ? "Thang điểm Hoạt tính Bệnh SLEDAI-2K (24 Tiêu chuẩn)"
                        : "SLEDAI-2K Disease Activity Score (24 Descriptors)"}
                    </h2>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-right font-mono">
                    <p className="text-[10px] font-bold uppercase text-rose-700">
                      {isVi
                        ? sledaiSummary.activityTierVi
                        : sledaiSummary.activityTierEn}
                    </p>
                    <p className="text-sm font-bold text-rose-950">
                      SLEDAI-2K Total = {sledaiSummary.totalScore}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="px-3 py-2 text-center">
                          {isVi ? "Điểm" : "Score"}
                        </th>
                        <th className="px-3 py-2">
                          {isVi ? "Tiêu chuẩn" : "Criterion"}
                        </th>
                        <th className="px-3 py-2">
                          {isVi ? "Định nghĩa Lâm sàng" : "Definition"}
                        </th>
                        <th className="px-3 py-2 text-center">
                          {isVi ? "Chọn" : "Check"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activePatient.sledai2kCriteria.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() =>
                            patchPatient((p) => ({
                              ...p,
                              sledai2kCriteria: p.sledai2kCriteria.map((c) =>
                                c.id === item.id
                                  ? { ...c, checked: !c.checked }
                                  : c
                              ),
                            }))
                          }
                          className={`cursor-pointer transition ${
                            item.checked
                              ? "bg-rose-50/60"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900">
                            {item.weight}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">
                            {isVi ? item.criterionVi : item.criterionEn}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {isVi ? item.definitionVi : item.definitionEn}
                          </td>
                          <td
                            className="px-3 py-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) =>
                                patchPatient((p) => ({
                                  ...p,
                                  sledai2kCriteria: p.sledai2kCriteria.map(
                                    (c) =>
                                      c.id === item.id
                                        ? { ...c, checked: e.target.checked }
                                        : c
                                  ),
                                }))
                              }
                              className="h-4 w-4 accent-teal-700 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Step-aware footer: one primary action per step */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <p
                className={`text-xs font-semibold ${
                  triageStats.unresolved > 0 ? "text-rose-800" : "text-teal-800"
                }`}
              >
                {triageStats.unresolved > 0
                  ? isVi
                    ? `Còn ${triageStats.unresolved} mục OCR chưa xử lý (${triageStats.manualUnder80} <80%, ${triageStats.verify80to90} 80–90%).`
                    : `${triageStats.unresolved} OCR field(s) unresolved (${triageStats.manualUnder80} <80%, ${triageStats.verify80to90} 80–90%).`
                  : isVi
                  ? `✓ Toàn bộ ${triageStats.total} trường OCR đã xác thực.`
                  : `✓ All ${triageStats.total} OCR fields verified.`}
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                {workflowStep !== "step1_triage" && (
                  <button
                    type="button"
                    id="crf-btn-back"
                    onClick={() =>
                      setWorkflowStep(workflowStep === "step3_signoff" ? "step2_review" : "step1_triage")
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    ← {isVi ? "Quay lại" : "Back"}
                  </button>
                )}
                {workflowStep === "step1_triage" && triageStats.unresolved > 0 && (
                  <button
                    type="button"
                    id="crf-btn-next-unresolved"
                    onClick={handleJumpNextUnresolved}
                    className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 cursor-pointer"
                  >
                    {isVi ? "Tới mục tiếp theo" : "Next unresolved field"}
                  </button>
                )}
                {workflowStep === "step2_review" && (
                  <button
                    type="button"
                    id="crf-btn-autoscore"
                    onClick={handleAutoSuggestScores}
                    className="rounded-xl border border-teal-700/40 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
                  >
                    {isVi ? "⚡ Tự động tính điểm" : "⚡ Auto-calculate scores"}
                  </button>
                )}
                {workflowStep !== "step3_signoff" ? (
                  <button
                    type="button"
                    id="crf-btn-continue"
                    onClick={() =>
                      setWorkflowStep(workflowStep === "step1_triage" ? "step2_review" : "step3_signoff")
                    }
                    className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 cursor-pointer"
                  >
                    {workflowStep === "step1_triage"
                      ? isVi ? "Tiếp tục: Rà soát CRF →" : "Continue: Review CRF →"
                      : isVi ? "Tiếp tục: Phê duyệt →" : "Continue: Approve →"}
                  </button>
                ) : (
                  <button
                    type="button"
                    id="crf-btn-signoff"
                    onClick={handleSignOffCrf}
                    className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 cursor-pointer"
                  >
                    {isVi ? "✓ Phê duyệt & Ký CRF" : "✓ Approve & Sign Off CRF"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create New Patient CRF Modal */}
      {isNewPatientModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreatePatientSubmit}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-base font-bold text-slate-900">
              {isVi
                ? "Khởi tạo Hồ sơ Bệnh án SLE (CRF) Mới"
                : "Create New SLE Case Report Form (CRF)"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {isVi
                ? "Tạo hồ sơ bệnh nhân mới theo mẫu chuẩn Vinmec MDDU SLE CRF."
                : "Initialize a new patient CRF record with the Vinmec MDDU SLE schema."}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Study ID (XX-XXXX-XX)
                </label>
                <input
                  type="text"
                  placeholder="VN-0125-26"
                  value={newStudyId}
                  onChange={(e) => setNewStudyId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {isVi ? "Họ và Tên Bệnh nhân" : "Patient Full Name"}
                </label>
                <input
                  type="text"
                  placeholder="Nguyen Thi Thu"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewPatientModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {isVi ? "Hủy" : "Cancel"}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                {isVi ? "Tạo Hồ sơ CRF" : "Create CRF"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full CRF JSON Preview Modal */}
      {isJsonModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {isVi
                    ? "Dữ liệu Cấu trúc SLE Case Report Form (JSON)"
                    : "Structured SLE Case Report Form Payload (JSON)"}
                </h2>
                <p className="text-xs text-slate-600">
                  {activePatient.studyId} • {activePatient.patientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {isVi ? "Đóng" : "Close"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-900 p-5 text-slate-100">
              <pre className="font-mono text-xs leading-relaxed">
                {JSON.stringify(fullCrfJsonPayload, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={handleDownloadCrfJson}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                {isVi ? "Tải xuống .json" : "Download .json"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
