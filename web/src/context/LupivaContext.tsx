"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  AuthUser,
  DEMO_USERS,
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
  buildBlankCrfRecord,
  UploadedDocFile,
} from "@/data/crfData";
import { formatLocalTimestamp } from "@/lib/submissionFilters";

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
  /** A patient account that has not signed the consent yet must tick it to sign in. */
  consentRequired?: boolean;
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
  mergeCrfPatientsFromApi: (
    records: SleCrfPatientRecord[],
    replaceAll?: boolean
  ) => void;
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
  ) => Promise<{ id: string; filesUploaded?: boolean } | null>;
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
    return "vi";
  });

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [savedRecords, setSavedRecords] = useState<SavedRegistryRecord[]>([]);
  const [crfPatients, setCrfPatients] = useState<SleCrfPatientRecord[]>([]);
  const [activeCrfPatientId, setActiveCrfPatientId] = useState<string>("");
  const [isActionGuideOpen, setIsActionGuideOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const crfPatientsRef = useRef<SleCrfPatientRecord[]>(crfPatients);
  useEffect(() => {
    crfPatientsRef.current = crfPatients;
  }, [crfPatients]);

  const patchTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  useEffect(() => {
    const timers = patchTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

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

  const mergeCrfPatientsFromApi = useCallback(
    (incoming: SleCrfPatientRecord[], replaceAll = false) => {
      setCrfPatients((prev) => {
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        const hydrated = incoming.map((rec) => {
          const existing = prevMap.get(rec.id);
          if (!existing?.uploadedFiles || !rec.uploadedFiles) return rec;
          return {
            ...rec,
            uploadedFiles: rec.uploadedFiles.map((f, idx) => {
              const matched =
                existing.uploadedFiles?.find(
                  (ef, eIdx) =>
                    ef.url && (ef.name === f.name || eIdx === idx)
                ) ?? null;
              return matched?.url ? { ...f, url: matched.url } : f;
            }),
          };
        });

        if (replaceAll) {
          return hydrated;
        }

        const incomingIds = new Set(hydrated.map((r) => r.id));
        return [...hydrated, ...prev.filter((p) => !incomingIds.has(p.id))];
      });
    },
    []
  );

  // Sync CRF cohort from API whenever authenticated user session changes
  useEffect(() => {
    // Patients never receive CRF records; only specialists hydrate the cohort.
    if (authLoading || currentUser?.role !== "specialist") return;

    let active = true;
    const utcOffset = -new Date().getTimezoneOffset();

    async function hydrateCohortFromApi() {
      try {
        const res = await fetch(
          `/api/submissions?page=1&pageSize=50&utcOffsetMinutes=${utcOffset}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          items?: Array<{ record: SleCrfPatientRecord }>;
        };
        if (active && Array.isArray(data.items)) {
          const records = data.items.map((item) => item.record);
          mergeCrfPatientsFromApi(records, true);
          setActiveCrfPatientId((prevId) =>
            records.some((r) => r.id === prevId) ? prevId : records[0]?.id ?? ""
          );
        }
      } catch {
        // Leave the cohort empty if the API is unreachable
      }
    }

    void hydrateCohortFromApi();
    return () => {
      active = false;
    };
  }, [authLoading, currentUser, mergeCrfPatientsFromApi]);

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
        if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return prev;
        const isSeededPersona =
          prev.email.toLowerCase() === DEMO_USERS[prev.role].email.toLowerCase();
        const localized = getLocalizedDemoUsers(newLang)[prev.role];
        return {
          ...prev,
          badgeText: isSeededPersona ? localized.badgeText : prev.badgeText,
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
          consentRequired?: boolean;
        };

        if (!res.ok || !data.user) {
          const errorMessage =
            data.error ||
            (language === "vi"
              ? "Đăng nhập thất bại. Vui lòng kiểm tra thông tin."
              : "Sign-in failed. Please verify your credentials.");
          showToast(t.toasts.authFailedTitle, errorMessage, "amber");
          return { ok: false, error: errorMessage, status: res.status, consentRequired: data.consentRequired === true };
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
      setCrfPatients([]);
      setActiveCrfPatientId("");
      setSelectedReportId("");
      setSavedRecords([]);
      showToast(t.toasts.signedOutTitle, t.toasts.signedOutDesc, "navy");
    }
  }, [showToast, t]);

  const updateCrfPatient = useCallback(
    (
      patientId: string,
      updater: (prev: SleCrfPatientRecord) => SleCrfPatientRecord
    ) => {
      const current = crfPatientsRef.current.find((p) => p.id === patientId);
      const next = current ? updater(current) : null;

      setCrfPatients((prev) =>
        prev.map((p) => (p.id === patientId ? updater(p) : p))
      );

      if (next && currentUser?.role === "specialist") {
        const existingTimer = patchTimersRef.current.get(patientId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const isImmediateSignOff =
          next.submissionStatus === "approved" ||
          next.signedOffBy !== current?.signedOffBy;

        const sendPatch = async () => {
          try {
            await fetch(`/api/submissions/${encodeURIComponent(patientId)}`, {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                record: next,
                utcOffsetMinutes: -new Date().getTimezoneOffset(),
              }),
            });
          } catch {
            // Non-blocking background sync
          }
        };

        if (isImmediateSignOff) {
          patchTimersRef.current.delete(patientId);
          void sendPatch();
        } else {
          const timer = setTimeout(() => {
            patchTimersRef.current.delete(patientId);
            void sendPatch();
          }, 450);
          patchTimersRef.current.set(patientId, timer);
        }
      }
    },
    [currentUser?.role]
  );

  const createNewCrfPatient = useCallback(
    (patientName: string, studyId: string) => {
      const newPat = buildBlankCrfRecord({
        id: `crf-pat-${Date.now()}`,
        studyId: studyId.trim(),
        patientName: currentUser?.role === "patient" ? currentUser.name : patientName,
        physician: currentUser?.role === "specialist" ? currentUser.name : "",
      });
      newPat.lastUpdated = formatLocalTimestamp();

      setCrfPatients((prev) => [newPat, ...prev]);
      setActiveCrfPatientId(newPat.id);
      return newPat;
    },
    [currentUser]
  );

  /**
   * Upload each image's bytes (documents listed in the same order as files),
   * then ask the server to hand them to the OCR/CRF backend. PDFs stay
   * metadata-only for the doctor. Returns false if an image failed to upload.
   */
  const sendImagesToPipeline = async (
    submissionId: string,
    listed: { id: string }[],
    files: UploadedDocFile[]
  ): Promise<boolean> => {
    let stored = 0;
    let ok = true;
    for (const [index, file] of files.entries()) {
      const documentId = listed[index]?.id;
      if (!file.isImage) continue;
      if (!documentId || !file.url) {
        // An image without bytes or without its server record must not pass silently.
        ok = false;
        continue;
      }
      // Weak mobile networks drop uploads; retry each image before giving up.
      let uploaded = false;
      for (const [attempt, waitMs] of [0, 1000, 3000].entries()) {
        if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
        try {
          const blob = await (await fetch(file.url)).blob();
          const res = await fetch(
            `/api/submissions/${encodeURIComponent(submissionId)}/files?documentId=${encodeURIComponent(documentId)}`,
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/octet-stream" },
              body: blob,
            }
          );
          // 409: an earlier attempt already stored it.
          if (res.ok || (res.status === 409 && attempt > 0)) {
            uploaded = true;
            break;
          }
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
        } catch {
          // network error: try again
        }
      }
      if (uploaded) stored += 1;
      else ok = false;
    }
    if (stored) {
      const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/send`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => null);
      if (!res?.ok) ok = false;
    }
    return ok;
  };

  const submitPatientUpload = useCallback(
    async (
      patientName: string,
      files: UploadedDocFile[]
    ): Promise<{ id: string; filesUploaded?: boolean } | null> => {
      if (files.length === 0) return null;
      try {
        const res = await fetch("/api/submissions", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
            files: files.map((f) => ({
              name: f.name,
              mimeType:
                f.mimeType ?? (f.isImage ? "image/png" : "application/pdf"),
              sizeBytes: f.sizeBytes ?? 0,
              isImage: f.isImage,
            })),
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          record?: SleCrfPatientRecord | { id: string; uploadedFiles?: { id: string }[] };
          dbSubmissionId?: string;
          error?: string;
        };

        if (!res.ok || !payload.record) {
          showToast(
            language === "vi"
              ? "Không thể gửi tài liệu"
              : "Submission failed",
            payload.error ||
              (language === "vi"
                ? "Vui lòng đăng nhập và thử lại."
                : "Please sign in and try again."),
            "amber"
          );
          return null;
        }

        let filesUploaded = true;
        if (payload.dbSubmissionId) {
          filesUploaded = await sendImagesToPipeline(payload.dbSubmissionId, payload.record.uploadedFiles ?? [], files);
          if (!filesUploaded) {
            showToast(
              language === "vi" ? "Ảnh chưa được gửi đi xử lý" : "Images not sent for processing",
              language === "vi"
                ? "Ảnh chưa gửi được, có thể do mạng yếu. Hãy kiểm tra kết nối rồi nộp lại ảnh."
                : "The submission was saved but its images could not be uploaded.",
              "amber"
            );
          }
        }

        if (!("ocrFields" in payload.record)) {
          // A patient gets a status-only receipt; there is no CRF to cache.
          return { id: payload.record.id, filesUploaded };
        }

        const recordWithUrls: SleCrfPatientRecord = {
          ...payload.record,
          uploadedFiles: payload.record.uploadedFiles?.map((serverFile, idx) => ({
            ...serverFile,
            url: files[idx]?.url ?? null,
          })),
        };

        setCrfPatients((prev) => [recordWithUrls, ...prev]);
        setActiveCrfPatientId(recordWithUrls.id);

        showToast(
          language === "vi"
            ? "Đã gửi tài liệu cho bác sĩ"
            : "Document sent to doctor",
          language === "vi"
            ? `${files.length} tệp đã được lưu trên hệ thống và chờ bác sĩ xác minh OCR.`
            : `${files.length} file(s) persisted and awaiting doctor OCR verification.`,
          "teal"
        );
        return recordWithUrls;
      } catch {
        showToast(
          language === "vi"
            ? "Lỗi kết nối máy chủ"
            : "Network error",
          language === "vi"
            ? "Không thể kết nối tới API lưu hồ sơ."
            : "Unable to reach the submissions API.",
          "amber"
        );
        return null;
      }
    },
    [language, showToast]
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
        savedAt: formatLocalTimestamp(),
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
            lastUpdated: formatLocalTimestamp(),
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
        mergeCrfPatientsFromApi,
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
