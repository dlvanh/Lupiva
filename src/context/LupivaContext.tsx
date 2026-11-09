"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  DEMO_USERS,
  DemoUser,
  MOCK_LAB_REPORTS,
  BiomarkerField,
  UserRole,
} from "@/data/mockData";

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
  showToast: (title: string, description: string, tone?: "teal" | "amber" | "navy") => void;
  dismissToast: () => void;
}

const LupivaContext = createContext<LupivaContextValue | undefined>(undefined);

export function LupivaProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(DEMO_USERS.specialist);
  const [selectedReportId, setSelectedReportId] = useState<string>(MOCK_LAB_REPORTS[0].id);
  const [savedRecords, setSavedRecords] = useState<SavedRegistryRecord[]>([]);
  const [isActionGuideOpen, setIsActionGuideOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (title: string, description: string, tone: "teal" | "amber" | "navy" = "teal") => {
      const id = String(Date.now());
      setToast({ id, title, description, tone });
    },
    []
  );

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const loginAsRole = useCallback(
    (role: UserRole, customEmail?: string) => {
      const baseUser = DEMO_USERS[role];
      const updatedUser: DemoUser = customEmail
        ? { ...baseUser, email: customEmail }
        : baseUser;
      setCurrentUser(updatedUser);
      showToast(
        `Signed in as ${updatedUser.name}`,
        `Active mode: ${updatedUser.title}`,
        "teal"
      );
    },
    [showToast]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    showToast(
      "Signed out of Lupiva session",
      "You are now browsing in public evaluator mode.",
      "navy"
    );
  }, [showToast]);

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
        verifiedBy: currentUser ? currentUser.name : "Clinical Evaluator (Guest)",
        savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        sledaiImpact,
        fields: fields.map((f) => ({ ...f })),
      };
      setSavedRecords((prev) => [newRecord, ...prev]);
      showToast(
        `Saved ${newRecord.recordId} to SLE e-CRF Registry`,
        `${fields.length} biomarkers committed (${sledaiImpact}).`,
        "teal"
      );
      return newRecord;
    },
    [currentUser, savedRecords.length, showToast]
  );

  return (
    <LupivaContext.Provider
      value={{
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
