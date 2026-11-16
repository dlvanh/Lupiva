"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  AuthUser,
  DEMO_USERS,
  MOCK_LAB_REPORTS,
  BiomarkerField,
  UserRole,
} from "@/data/mockData";
import {
  Language,
  Translations,
  TRANSLATIONS,
  getLocalizedDemoUsers,
} from "@/data/translations";
import {
  SleCrfPatientRecord,
  INITIAL_CRF_PATIENTS,
  buildDefaultEularAcrCriteria,
  buildDefaultSledai2kCriteria,
  buildSkinMucosaItems,
  buildCardiovascularItems,
  buildNeuropsychiatricItems,
  buildGiItems,
  UploadedDocFile,
} from "@/data/crfData";

export interface SavedRegistryRecord {
  recordId: string;
  reportId: string;
  reportTitle: string;
  patientName: string;
  patientId: string;
  verifiedBy: string;
  savedAt: string;
  sledaiImpact: string;
  fields: BiomarkerField[];
}

export interface ToastMessage {
  id: string;
  title: string;
  description: string;
  tone: "teal" | "amber" | "navy";
}

export interface LoginCredentialsInput {
  email: string;
  password: string;
  selectedRole?: UserRole;
  consentChecked?: boolean;
}

export interface RegisterAccountInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  consentChecked: boolean;
  inviteCode?: string;
}

export interface AuthActionResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
  status?: number;
}

interface LupivaContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
  currentUser: AuthUser | null;
  authLoading: boolean;
  loginWithCredentials: (
    input: LoginCredentialsInput
  ) => Promise<AuthActionResult>;
  registerAccount: (input: RegisterAccountInput) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  selectedReportId: string;
  setSelectedReportId: (id: string) => void;
  savedRecords: SavedRegistryRecord[];
  saveReportToRegistry: (
    reportId: string,
    reportTitle: string,
    patientName: string,
    patientId: string,
    sledaiImpact: string,
    fields: BiomarkerField[]
  ) => SavedRegistryRecord;
  crfPatients: SleCrfPatientRecord[];
  activeCrfPatientId: string;
  setActiveCrfPatientId: (id: string) => void;
  updateCrfPatient: (
    patientId: string,
    updater: (prev: SleCrfPatientRecord) => SleCrfPatientRecord
  ) => void;
  createNewCrfPatient: (
    patientName: string,
    studyId: string
  ) => SleCrfPatientRecord;
  submitPatientUpload: (
    patientName: string,
    files: UploadedDocFile[]
  ) => SleCrfPatientRecord;
  isActionGuideOpen: boolean;
  setIsActionGuideOpen: (open: boolean) => void;
  toast: ToastMessage | null;
  showToast: (
    title: string,
    description: string,
    tone?: "teal" | "amber" | "navy"
  ) => void;
  dismissToast: () => void;
}

const LupivaContext = createContext<LupivaContextValue | undefined>(undefined);

export function LupivaProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lupiva-lang") as Language | null;
        if (stored === "en" || stored === "vi") {
          return stored;
        }
      } catch {
        // ignore
      }
    }
    return "en";
  });

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [selectedReportId, setSelectedReportId] = useState<string>(
    MOCK_LAB_REPORTS[0].id
  );
  const [savedRecords, setSavedRecords] = useState<SavedRegistryRecord[]>([]);
  const [crfPatients, setCrfPatients] = useState<SleCrfPatientRecord[]>(
    () => INITIAL_CRF_PATIENTS
  );
  const [activeCrfPatientId, setActiveCrfPatientId] = useState<string>(
    INITIAL_CRF_PATIENTS[0].id
  );
  const [isActionGuideOpen, setIsActionGuideOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const t = TRANSLATIONS[language];

  const showToast = useCallback(
    (
      title: string,
      description: string,
      tone: "teal" | "amber" | "navy" = "teal"
    ) => {
      const id = String(Date.now());
      setToast({ id, title, description, tone });
    },
    []
  );

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // Synchronize document lang attribute whenever language changes
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  // Hydrate authenticated user from HttpOnly session cookie via PostgreSQL backend
  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          if (active) setCurrentUser(null);
          return;
        }
        const data = (await res.json()) as { user?: AuthUser | null };
        if (active) {
          setCurrentUser(data.user ?? null);
        }
      } catch {
        if (active) {
          setCurrentUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(
    (newLang: Language) => {
      setLanguageState(newLang);
      try {
        localStorage.setItem("lupiva-lang", newLang);
      } catch {
        // ignore
      }
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLang;
      }
      setCurrentUser((prev) => {
        if (!prev) return null;
        const isSeededPersona =
          prev.email.toLowerCase() === DEMO_USERS[prev.role].email.toLowerCase();
        const localized = getLocalizedDemoUsers(newLang)[prev.role];
        return {
          ...prev,
          badgeText: localized.badgeText,
          title: isSeededPersona ? localized.title : prev.title,
          departmentOrRegistryId: isSeededPersona
            ? localized.departmentOrRegistryId
            : prev.departmentOrRegistryId,
        };
      });

      const msg = TRANSLATIONS[newLang].toasts;
      showToast(msg.langSwitchedTitle, msg.langSwitchedDesc, "teal");
    },
    [showToast]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "vi" : "en");
  }, [language, setLanguage]);

  const loginWithCredentials = useCallback(
    async (input: LoginCredentialsInput): Promise<AuthActionResult> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        const data = (await res.json().catch(() => ({}))) as {
          user?: AuthUser;
          error?: string;
        };

        if (!res.ok || !data.user) {
          const errorMessage =
            data.error ||
            (language === "vi"
              ? "Đăng nhập thất bại. Vui lòng kiểm tra thông tin."
              : "Sign-in failed. Please verify your credentials.");
          showToast(t.toasts.authFailedTitle, errorMessage, "amber");
          return { ok: false, error: errorMessage, status: res.status };
        }

        setCurrentUser(data.user);
        setAuthLoading(false);
        showToast(
          t.toasts.signedIn(data.user.name),
          t.toasts.activeMode(data.user.title),
          "teal"
        );
        return { ok: true, user: data.user, status: res.status };
      } catch {
        const errorMessage =
          language === "vi"
            ? "Không thể kết nối tới máy chủ xác thực."
            : "Unable to reach the authentication server.";
        showToast(t.toasts.authFailedTitle, errorMessage, "amber");
        return { ok: false, error: errorMessage };
      }
    },
    [language, showToast, t]
  );

  const registerAccount = useCallback(
    async (input: RegisterAccountInput): Promise<AuthActionResult> => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        const data = (await res.json().catch(() => ({}))) as {
          user?: AuthUser;
          error?: string;
        };

        if (!res.ok || !data.user) {
          const errorMessage =
            data.error ||
            (language === "vi"
              ? "Đăng ký tài khoản thất bại. Vui lòng kiểm tra thông tin."
              : "Account registration failed. Please check your details.");
          showToast(t.toasts.authFailedTitle, errorMessage, "amber");
          return { ok: false, error: errorMessage, status: res.status };
        }

        setCurrentUser(data.user);
        setAuthLoading(false);
        showToast(
          t.toasts.accountCreatedTitle(data.user.name),
          t.toasts.activeMode(data.user.title),
          "teal"
        );
        return { ok: true, user: data.user, status: res.status };
      } catch {
        const errorMessage =
          language === "vi"
            ? "Không thể kết nối tới máy chủ đăng ký."
            : "Unable to reach the registration server.";
        showToast(t.toasts.authFailedTitle, errorMessage, "amber");
        return { ok: false, error: errorMessage };
      }
    },
    [language, showToast, t]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Clear local state regardless of network hiccup
    } finally {
      setCurrentUser(null);
      showToast(t.toasts.signedOutTitle, t.toasts.signedOutDesc, "navy");
    }
  }, [showToast, t]);

  const updateCrfPatient = useCallback(
    (
      patientId: string,
      updater: (prev: SleCrfPatientRecord) => SleCrfPatientRecord
    ) => {
      setCrfPatients((prev) =>
        prev.map((p) => (p.id === patientId ? updater(p) : p))
      );
    },
    []
  );

  const createNewCrfPatient = useCallback(
    (patientName: string, studyId: string) => {
      const template = INITIAL_CRF_PATIENTS[0];
      const newPat: SleCrfPatientRecord = {
        ...template,
        id: `crf-pat-${Date.now()}`,
        studyId: studyId || `VN-0${120 + crfPatients.length}-26`,
        patientName: patientName || "Nguyen Thi Thu",
        age: "32",
        gender: "Female",
        icfSignedDate: "10/11/2026",
        heightCm: "160",
        weightKg: "54.0",
        physician: currentUser ? currentUser.name : "Dr. Nguyen Minh, MD, PhD",
        nurse: "RN. Le Thi Huong",
        lastUpdated: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        signedOffBy: null,
        signedOffRole: null,
        malignantDisease: "NO",
        malignantSpecify: "",
        otherComorbidities: "NO",
        otherComorbiditiesSpecify: "",
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
        treatmentStatus: "NO",
        treatments: [],
        skinMucosaAbnormality: "NO",
        skinMucosaItems: buildSkinMucosaItems(),
        muscleDamage: "NO",
        muscleBiopsyOther: "NO",
        muscleBiopsySpecify: "",
        jointsDamage: "NO",
        swollenJointsCount: "0",
        tenderJointsCount: "0",
        vasScore: "0",
        abnormalXray: "NO",
        abnormalXraySpecify: "",
        abnormalUltrasound: "NO",
        abnormalUltrasoundSpecify: "",
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
        haematologicalDisorders: "NO",
        haematologicalSpecify: "",
        cardiovascularAbnormality: "NO",
        cardiovascularItems: buildCardiovascularItems(),
        lungDamage: "NO",
        lungIld: false,
        lungIldPatterns: [],
        lungPleuritis: false,
        lungPleuritisSpecify: "",
        lungOther: false,
        lungOtherSpecify: "",
        neuropsychiatricDisorders: "NO",
        neuropsychiatricItems: buildNeuropsychiatricItems(),
        giDisorders: "NO",
        giItems: buildGiItems(),
        ocrFields: template.ocrFields.map((f) => ({
          ...f,
          value: f.confidence < 80 ? "" : f.printedValue,
          secondaryValue: f.confidence < 80 ? "" : f.printedSecondaryValue,
          status:
            f.confidence > 90
              ? "auto_approved"
              : f.confidence >= 80
              ? "needs_verify"
              : "manual_required",
        })),
        antibodyBlots: template.antibodyBlots.map((b) => ({
          ...b,
          result: b.confidence < 80 ? "" : b.printedResult,
          intensity: b.confidence < 80 ? "" : b.printedIntensity,
          status:
            b.confidence > 90
              ? "auto_approved"
              : b.confidence >= 80
              ? "needs_verify"
              : "manual_required",
        })),
        anaEntryCriterionMet: true,
        eularAcrCriteria: buildDefaultEularAcrCriteria(),
        sledai2kCriteria: buildDefaultSledai2kCriteria(),
      };

      setCrfPatients((prev) => [newPat, ...prev]);
      setActiveCrfPatientId(newPat.id);
      return newPat;
    },
    [crfPatients.length, currentUser]
  );

  const submitPatientUpload = useCallback(
    (patientName: string, files: UploadedDocFile[]) => {
      const pat = createNewCrfPatient(patientName, "");
      const now = new Date();
      const stamp = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      const doctor = getLocalizedDemoUsers(language).specialist.name;
      const withFiles: SleCrfPatientRecord = {
        ...pat,
        uploadedFiles: files,
        submittedAt: stamp,
        submissionStatus: "pending_doctor_review",
        physician: doctor,
      };
      setCrfPatients((prev) =>
        prev.map((p) => (p.id === pat.id ? withFiles : p))
      );
      showToast(
        language === "vi"
          ? "Đã gửi tài liệu cho bác sĩ"
          : "Document sent to doctor",
        language === "vi"
          ? `${files.length} tệp đang chờ bác sĩ xác minh kết quả OCR.`
          : `${files.length} file(s) are awaiting doctor OCR verification.`,
        "teal"
      );
      return withFiles;
    },
    [createNewCrfPatient, language, showToast]
  );

  const saveReportToRegistry = useCallback(
    (
      reportId: string,
      reportTitle: string,
      patientName: string,
      patientId: string,
      sledaiImpact: string,
      fields: BiomarkerField[]
    ) => {
      const newRecord: SavedRegistryRecord = {
        recordId: `CRF-${1040 + savedRecords.length + 1}`,
        reportId,
        reportTitle,
        patientName,
        patientId,
        verifiedBy: currentUser
          ? currentUser.name
          : language === "vi"
          ? "Người Đánh giá Lâm sàng (Khách)"
          : "Clinical Evaluator (Guest)",
        savedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        sledaiImpact,
        fields: fields.map((f) => ({ ...f })),
      };
      setSavedRecords((prev) => [newRecord, ...prev]);

      // Also synchronize verified biomarkers into the primary patient's CRF record
      setCrfPatients((prev) =>
        prev.map((pat, idx) => {
          if (idx !== 0 && pat.patientName !== patientName) return pat;
          const updatedOcrFields = pat.ocrFields.map((crfField) => {
            const matched = fields.find((f) => f.code === crfField.code);
            if (!matched) return crfField;
            return {
              ...crfField,
              value: matched.value,
              unit: matched.unit,
              flag: matched.flag,
              status: "user_verified" as const,
            };
          });
          return {
            ...pat,
            lastUpdated: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            ocrFields: updatedOcrFields,
          };
        })
      );

      showToast(
        t.toasts.savedRegistryTitle(newRecord.recordId),
        t.toasts.savedRegistryDesc(fields.length, sledaiImpact),
        "teal"
      );
      return newRecord;
    },
    [currentUser, language, savedRecords.length, showToast, t]
  );

  return (
    <LupivaContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
        currentUser,
        authLoading,
        loginWithCredentials,
        registerAccount,
        logout,
        selectedReportId,
        setSelectedReportId,
        savedRecords,
        saveReportToRegistry,
        crfPatients,
        activeCrfPatientId,
        setActiveCrfPatientId,
        updateCrfPatient,
        createNewCrfPatient,
        submitPatientUpload,
        isActionGuideOpen,
        setIsActionGuideOpen,
        toast,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </LupivaContext.Provider>
  );
}

export function useLupiva() {
  const context = useContext(LupivaContext);
  if (!context) {
    throw new Error("useLupiva must be used within a LupivaProvider");
  }
  return context;
}
