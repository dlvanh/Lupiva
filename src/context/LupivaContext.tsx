"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  DemoUser,
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

interface LupivaContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
  currentUser: DemoUser | null;
  loginAsRole: (role: UserRole, customEmail?: string) => void;
  logout: () => void;
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

  const [currentUser, setCurrentUser] = useState<DemoUser | null>(() => {
    return getLocalizedDemoUsers("en").specialist;
  });
  const [selectedReportId, setSelectedReportId] = useState<string>(
    MOCK_LAB_REPORTS[0].id
  );
  const [savedRecords, setSavedRecords] = useState<SavedRegistryRecord[]>([]);
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
        const localized = getLocalizedDemoUsers(newLang)[prev.role];
        return { ...localized, email: prev.email };
      });

      const msg = TRANSLATIONS[newLang].toasts;
      showToast(msg.langSwitchedTitle, msg.langSwitchedDesc, "teal");
    },
    [showToast]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "vi" : "en");
  }, [language, setLanguage]);

  const loginAsRole = useCallback(
    (role: UserRole, customEmail?: string) => {
      const localizedUsers = getLocalizedDemoUsers(language);
      const baseUser = localizedUsers[role];
      const updatedUser: DemoUser = customEmail
        ? { ...baseUser, email: customEmail }
        : baseUser;
      setCurrentUser(updatedUser);
      showToast(
        t.toasts.signedIn(updatedUser.name),
        t.toasts.activeMode(updatedUser.title),
        "teal"
      );
    },
    [language, showToast, t]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    showToast(t.toasts.signedOutTitle, t.toasts.signedOutDesc, "navy");
  }, [showToast, t]);

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
        loginAsRole,
        logout,
        selectedReportId,
        setSelectedReportId,
        savedRecords,
        saveReportToRegistry,
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
