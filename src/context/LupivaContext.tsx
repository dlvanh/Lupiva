"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthUser, DEMO_USERS, UserRole } from "@/data/mockData";
import {
  Language,
  Translations,
  TRANSLATIONS,
  getLocalizedDemoUsers,
} from "@/data/translations";
import { getUploadPageCopy } from "@/data/uploadTranslations";
import {
  SleCrfPatientRecord,
  UploadedDocFile,
  buildEmptySleCrfRecord,
} from "@/data/crfData";
import { formatLocalTimestamp } from "@/lib/submissionFilters";

export type DoctorWorkspaceTab =
  | "dashboard"
  | "pending"
  | "approved"
  | "crf"
  | "redcap";

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
  isSigningOut: () => boolean;
  crfPatients: SleCrfPatientRecord[];
  activeCrfPatientId: string;
  setActiveCrfPatientId: (id: string) => void;
  doctorActiveTab: DoctorWorkspaceTab;
  setDoctorActiveTab: (tab: DoctorWorkspaceTab) => void;
  openDoctorPatientCrf: (patientId: string) => void;
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
  ) => Promise<SleCrfPatientRecord | null>;
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
  const router = useRouter();
  const pathname = usePathname();
  const isSigningOutRef = useRef<boolean>(false);

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
  const [crfPatients, setCrfPatients] = useState<SleCrfPatientRecord[]>([]);
  const [activeCrfPatientId, setActiveCrfPatientId] = useState<string>("");
  const [doctorActiveTab, setDoctorActiveTab] =
    useState<DoctorWorkspaceTab>("dashboard");
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

  useEffect(() => {
    if (pathname === "/") {
      isSigningOutRef.current = false;
    }
  }, [pathname]);

  const isSigningOut = useCallback(() => isSigningOutRef.current, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

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
          const user = data.user ?? null;
          setCurrentUser(user);
          if (user?.role === "patient") {
            setCrfPatients([]);
            setActiveCrfPatientId("");
          }
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
    if (authLoading || !currentUser) return;

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
        if (!active || !Array.isArray(data.items)) return;

        const records = data.items.map((item) => item.record);
        mergeCrfPatientsFromApi(records, true);
        setActiveCrfPatientId((prevId) =>
          records.some((r) => r.id === prevId)
            ? prevId
            : (records[0]?.id ?? "")
        );
      } catch {
        if (active) {
          setCrfPatients([]);
          setActiveCrfPatientId("");
        }
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

        isSigningOutRef.current = false;
        setCurrentUser(data.user);
        setCrfPatients([]);
        setActiveCrfPatientId("");
        setDoctorActiveTab("dashboard");
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

        isSigningOutRef.current = false;
        setCurrentUser(data.user);
        setCrfPatients([]);
        setActiveCrfPatientId("");
        setDoctorActiveTab("dashboard");
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
    if (pathname !== "/") {
      isSigningOutRef.current = true;
    }
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
      setDoctorActiveTab("dashboard");
      showToast(t.toasts.signedOutTitle, t.toasts.signedOutDesc, "navy");
      router.replace("/");
    }
  }, [pathname, router, showToast, t]);

  const openDoctorPatientCrf = useCallback((patientId: string) => {
    setActiveCrfPatientId(patientId);
    setDoctorActiveTab("crf");
  }, []);

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
      const timestamp = formatLocalTimestamp();
      const newPat = buildEmptySleCrfRecord({
        id: `crf-draft-${Date.now()}`,
        studyId: studyId.trim() || `VN-${String(100 + crfPatients.length + 1).padStart(4, "0")}-26`,
        patientName: patientName.trim() || (language === "vi" ? "Bệnh nhân mới" : "New Patient"),
        icfSignedDate: timestamp.slice(0, 10),
        physician: currentUser ? currentUser.name : "",
        submittedAt: timestamp,
        lastUpdated: `${timestamp} ICT`,
      });

      setCrfPatients((prev) => [newPat, ...prev]);
      setActiveCrfPatientId(newPat.id);
      setDoctorActiveTab("crf");
      return newPat;
    },
    [crfPatients.length, currentUser, language]
  );

  const submitPatientUpload = useCallback(
    async (
      patientName: string,
      files: UploadedDocFile[]
    ): Promise<SleCrfPatientRecord | null> => {
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
          record?: SleCrfPatientRecord;
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

        const recordWithUrls: SleCrfPatientRecord = {
          ...payload.record,
          uploadedFiles: payload.record.uploadedFiles?.map((serverFile, idx) => ({
            ...serverFile,
            url: files[idx]?.url ?? null,
          })),
        };

        setCrfPatients((prev) => [recordWithUrls, ...prev]);
        setActiveCrfPatientId(recordWithUrls.id);

        const patientCopy = getUploadPageCopy(language).patient;
        showToast(
          patientCopy.uploadSuccessTitle,
          patientCopy.uploadSuccessMessage,
          "teal"
        );
        return recordWithUrls;
      } catch {
        showToast(
          language === "vi" ? "Lỗi kết nối máy chủ" : "Network error",
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
        isSigningOut,
        crfPatients,
        activeCrfPatientId,
        setActiveCrfPatientId,
        doctorActiveTab,
        setDoctorActiveTab,
        openDoctorPatientCrf,
        mergeCrfPatientsFromApi,
        updateCrfPatient,
        createNewCrfPatient,
        submitPatientUpload,
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
