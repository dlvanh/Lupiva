"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  BiomarkerField,
  ClinicalFlag,
  LabReportMock,
} from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";
import { getLocalizedLabReports } from "@/data/translations";

type FilterMode = "all" | "needs_review" | "abnormal";

export default function OcrWorkspacePage() {
  const {
    language,
    t,
    selectedReportId,
    setSelectedReportId,
    currentUser,
    savedRecords,
    saveReportToRegistry,
    showToast,
  } = useLupiva();

  const localizedReports = useMemo(
    () => getLocalizedLabReports(language),
    [language]
  );

  // Map of reportId -> editable overrides (value, unit, flag, verified, confidence, custom fields)
  const [editedFieldsByReport, setEditedFieldsByReport] = useState<
    Record<string, BiomarkerField[]>
  >(() => {
    const initial: Record<string, BiomarkerField[]> = {};
    for (const rep of localizedReports) {
      initial[rep.id] = rep.fields.map((f) => ({ ...f }));
    }
    return initial;
  });

  const activeReport: LabReportMock =
    localizedReports.find((r) => r.id === selectedReportId) ||
    localizedReports[0];

  // Merge localized labels with any user edits (or fallback to localized initial fields)
  const currentFields: BiomarkerField[] = useMemo(() => {
    const edits = editedFieldsByReport[activeReport.id];
    if (!edits) return activeReport.fields;

    // For standard fields, merge the latest language labels (name, category, clinicalNote, referenceRange)
    // while keeping user's edited value, unit, flag, confidence, and verified state
    const merged: BiomarkerField[] = edits.map((editField) => {
      const template = activeReport.fields.find((f) => f.id === editField.id);
      if (!template) {
        // Custom added field
        return editField;
      }
      return {
        ...template,
        value: editField.value,
        unit: editField.unit,
        flag: editField.flag,
        confidence: editField.confidence,
        verified: editField.verified,
        bbox: editField.bbox,
      };
    });

    return merged;
  }, [activeReport, editedFieldsByReport]);

  const [activeFieldId, setActiveFieldId] = useState<string>(
    currentFields[0]?.id || ""
  );
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [uploadedFilePreview, setUploadedFilePreview] = useState<{
    name: string;
    url: string | null;
  } | null>(null);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setUploadedFilePreview(null);
    const targetRep = localizedReports.find((r) => r.id === reportId);
    if (targetRep && targetRep.fields.length > 0) {
      setActiveFieldId(targetRep.fields[0].id);
    }
  };

  const handleRunOcrScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      showToast(
        t.toasts.ocrScanCompleteTitle,
        t.toasts.ocrScanCompleteDesc(
          currentFields.length,
          uploadedFilePreview ? uploadedFilePreview.name : activeReport.title
        ),
        "teal"
      );
    }, 1100);
  };

  const handleResetCurrentReport = () => {
    const original = localizedReports.find((r) => r.id === activeReport.id);
    if (!original) return;
    setEditedFieldsByReport((prev) => ({
      ...prev,
      [activeReport.id]: original.fields.map((f) => ({ ...f })),
    }));
    setUploadedFilePreview(null);
    setActiveFieldId(original.fields[0]?.id || "");
    showToast(
      t.toasts.reportResetTitle,
      t.toasts.reportResetDesc(original.shortTitle),
      "navy"
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const objectUrl = isImage ? URL.createObjectURL(file) : null;
    setUploadedFilePreview({ name: file.name, url: objectUrl });
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      showToast(
        t.toasts.scanUploadTitle(file.name),
        t.toasts.scanUploadDesc,
        "teal"
      );
    }, 1050);
  };

  const handleUpdateFieldValue = (
    fieldId: string,
    key: "value" | "unit" | "name" | "flag",
    newValue: string
  ) => {
    setEditedFieldsByReport((prev) => {
      const baseList = prev[activeReport.id] || activeReport.fields;
      return {
        ...prev,
        [activeReport.id]: baseList.map((field) =>
          field.id === fieldId
            ? {
                ...field,
                [key]: newValue,
                verified: true,
                confidence: 100,
              }
            : field
        ),
      };
    });
  };

  const handleVerifyRow = (fieldId: string) => {
    setEditedFieldsByReport((prev) => {
      const baseList = prev[activeReport.id] || activeReport.fields;
      return {
        ...prev,
        [activeReport.id]: baseList.map((field) =>
          field.id === fieldId
            ? {
                ...field,
                verified: true,
                confidence: Math.max(field.confidence, 99),
              }
            : field
        ),
      };
    });
    const target = currentFields.find((f) => f.id === fieldId);
    showToast(
      t.toasts.verifiedFieldTitle(target?.code || "Biomarker"),
      t.toasts.verifiedFieldDesc(target?.value || "", target?.unit || ""),
      "teal"
    );
  };

  const handleVerifyAllFlagged = () => {
    const unverifiedCount = currentFields.filter(
      (f) => !f.verified || f.confidence < 85
    ).length;

    setEditedFieldsByReport((prev) => {
      const baseList = prev[activeReport.id] || activeReport.fields;
      return {
        ...prev,
        [activeReport.id]: baseList.map((field) => ({
          ...field,
          verified: true,
          confidence: Math.max(field.confidence, 99),
        })),
      };
    });

    showToast(
      t.toasts.verifiedAllTitle,
      unverifiedCount > 0
        ? t.toasts.verifiedAllDesc(unverifiedCount)
        : t.toasts.allAlreadyVerifiedDesc,
      "teal"
    );
  };

  const handleAddBiomarkerRow = () => {
    const newIndex = currentFields.length + 1;
    const newField: BiomarkerField = {
      id: `fld-custom-${Date.now()}`,
      code: `SLE-CUSTOM-${newIndex}`,
      name: t.ocr.defaultAddedName,
      category: language === "vi" ? "Tự kháng thể" : "Autoantibodies",
      value: language === "vi" ? "Dương tính (48.0)" : "Positive (48.0)",
      unit: "U/mL",
      referenceRange: "< 20.0 U/mL",
      flag: "Positive",
      confidence: 100,
      verified: true,
      clinicalNote: t.ocr.defaultAddedNote,
      bbox: {
        top: Math.min(84, 24 + newIndex * 8),
        left: 6,
        width: 88,
        height: 6.5,
      },
    };

    setEditedFieldsByReport((prev) => {
      const baseList = prev[activeReport.id] || activeReport.fields;
      return {
        ...prev,
        [activeReport.id]: [...baseList, newField],
      };
    });
    setActiveFieldId(newField.id);
    showToast(t.toasts.addedRowTitle, t.toasts.addedRowDesc, "navy");
  };

  const handleSaveToRegistry = () => {
    const unverified = currentFields.filter(
      (f) => !f.verified || f.confidence < 85
    );
    if (unverified.length > 0) {
      showToast(
        t.toasts.unverifiedWarningTitle(unverified.length),
        t.toasts.unverifiedWarningDesc(
          unverified.map((u) => u.code).join(", ")
        ),
        "amber"
      );
      setActiveFieldId(unverified[0].id);
      return;
    }

    saveReportToRegistry(
      activeReport.id,
      activeReport.title,
      activeReport.patientName,
      activeReport.patientId,
      activeReport.sledaiImpact,
      currentFields
    );
  };

  const needsReviewCount = currentFields.filter(
    (f) => !f.verified || f.confidence < 85
  ).length;
  const abnormalCount = currentFields.filter((f) => f.flag !== "Normal").length;

  const filteredFields = currentFields.filter((field) => {
    if (filterMode === "needs_review") {
      return !field.verified || field.confidence < 85;
    }
    if (filterMode === "abnormal") {
      return field.flag !== "Normal";
    }
    return true;
  });

  const selectedField =
    currentFields.find((f) => f.id === activeFieldId) || currentFields[0];

  const eCrfJsonPayload = {
    schemaVersion: "vinmec-sle-ecrf-v1.0",
    language,
    reportTimestamp: activeReport.collectionDate,
    verifiedBy: currentUser
      ? { name: currentUser.name, role: currentUser.role }
      : {
          name: language === "vi" ? "Người Đánh giá Khách" : "Guest Evaluator",
          role: "evaluator",
        },
    patient: {
      name: activeReport.patientName,
      registryId: activeReport.patientId,
      ageSex: activeReport.patientAgeSex,
    },
    specimen: {
      reportId: activeReport.id,
      title: activeReport.title,
      facility: activeReport.facility,
      collectionDate: activeReport.collectionDate,
      specimenType: activeReport.specimenType,
      sledaiImpact: activeReport.sledaiImpact,
    },
    biomarkers: currentFields.map((f) => ({
      code: f.code,
      name: f.name,
      value: f.value,
      unit: f.unit,
      referenceRange: f.referenceRange,
      clinicalFlag: f.flag,
      ocrConfidence: f.confidence,
      humanVerified: f.verified,
    })),
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(eCrfJsonPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeReport.patientId}-${activeReport.id}-ecrf.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      t.toasts.downloadJsonTitle,
      t.toasts.downloadJsonDesc(
        `${activeReport.patientId}-${activeReport.id}-ecrf.json`
      ),
      "teal"
    );
  };

  return (
    <main className="flex-1 bg-slate-100/70 pb-12">
      {/* Top Control & Sample Switcher Bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            {/* Left: Sample Lab Report Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t.ocr.sampleScanLabel}
              </span>
              {localizedReports.map((rep) => {
                const isSelected =
                  rep.id === activeReport.id && !uploadedFilePreview;
                return (
                  <button
                    key={rep.id}
                    type="button"
                    id={`ocr-btn-report-${rep.id}`}
                    onClick={() => handleSelectReport(rep.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {rep.shortTitle}
                  </button>
                );
              })}
            </div>

            {/* Right: Upload File, Run OCR Scan, Reset */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="ocr-file-input"
              />
              <button
                type="button"
                id="ocr-btn-upload"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                <svg
                  className="h-3.5 w-3.5 text-slate-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>{t.ocr.uploadBtn}</span>
              </button>

              <button
                type="button"
                id="ocr-btn-run-scan"
                onClick={handleRunOcrScan}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                <span>
                  {isScanning ? t.ocr.scanningBtn : t.ocr.runScanBtn}
                </span>
              </button>

              <button
                type="button"
                id="ocr-btn-reset"
                onClick={handleResetCurrentReport}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                title={t.ocr.resetTitle}
              >
                {t.ocr.resetBtn}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split-Screen Workspace */}
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT PANE: Source Lab Report Viewer with Bounding Box Grounding */}
          <section
            aria-label="Original Lab Report Document Viewer"
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-5"
          >
            {/* Document Viewer Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-600" />
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                  {t.ocr.sourceScanHeader}
                </h2>
                {uploadedFilePreview && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-900">
                    {t.ocr.uploadedLabel(uploadedFilePreview.name)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="ocr-btn-zoom-out"
                  onClick={() => setZoomPercent((z) => Math.max(80, z - 10))}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  id="ocr-btn-zoom-reset"
                  onClick={() => setZoomPercent(100)}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  id="ocr-btn-zoom-in"
                  onClick={() => setZoomPercent((z) => Math.min(130, z + 10))}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  id="ocr-btn-toggle-bbox"
                  onClick={() => setShowBoundingBoxes((b) => !b)}
                  className={`ml-1 rounded border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                    showBoundingBoxes
                      ? "border-teal-700/40 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {showBoundingBoxes ? t.ocr.boxesOn : t.ocr.boxesOff}
                </button>
              </div>
            </div>

            {/* Scanned Paper Canvas Container */}
            <div className="relative flex-1 overflow-auto bg-slate-200/75 p-4 sm:p-5">
              <div
                style={{
                  transform: `scale(${zoomPercent / 100})`,
                  transformOrigin: "top center",
                }}
                className="relative mx-auto min-h-[540px] w-full max-w-[460px] rounded-lg border border-slate-300 bg-[#fcfcfa] p-5 text-slate-800 shadow-md transition-transform"
              >
                {/* Animated Laser Line when OCR Scan is running */}
                {isScanning && (
                  <div className="animate-ocr-scan pointer-events-none absolute left-0 right-0 z-30 h-1 bg-teal-500 shadow-[0_0_16px_3px_rgba(13,148,136,0.65)]" />
                )}

                {uploadedFilePreview?.url ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-[11px] text-slate-500">
                      <span>
                        {t.ocr.uploadedScanTitle} {uploadedFilePreview.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setUploadedFilePreview(null)}
                        className="font-semibold text-teal-800 underline cursor-pointer"
                      >
                        {t.ocr.returnToMock}
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedFilePreview.url}
                      alt={uploadedFilePreview.name}
                      className="max-h-[460px] w-full rounded border border-slate-200 object-contain"
                    />
                  </div>
                ) : (
                  <>
                    {/* Simulated Clinical Hospital Lab Sheet Header */}
                    <div className="border-b-2 border-slate-800 pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-900">
                            {activeReport.facility}
                          </p>
                          <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                            {activeReport.title}
                          </h3>
                          <p className="text-[10px] text-slate-500">
                            {activeReport.department}
                          </p>
                        </div>
                        <div className="text-right font-mono text-[10px] text-slate-600">
                          <p className="font-bold text-slate-900">
                            {activeReport.id.toUpperCase()}
                          </p>
                          <p>{activeReport.collectionDate}</p>
                        </div>
                      </div>

                      {/* Patient Demographics Strip on Paper */}
                      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded bg-slate-100 px-2.5 py-1.5 font-mono text-[10px]">
                        <div>
                          <span className="text-slate-500">
                            {t.ocr.patientLabel}
                          </span>{" "}
                          <strong className="text-slate-900">
                            {activeReport.patientName} ({activeReport.patientAgeSex})
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">
                            {t.ocr.idLabel}
                          </span>{" "}
                          <strong className="text-slate-900">
                            {activeReport.patientId}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">
                            {t.ocr.specimenLabel}
                          </span>{" "}
                          <strong className="text-slate-900">
                            {activeReport.specimenType}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Table Column Headers on Paper */}
                    <div className="mt-3 grid grid-cols-12 border-b border-slate-300 pb-1 font-mono text-[9px] font-bold uppercase text-slate-500">
                      <div className="col-span-5">{t.ocr.tableThBiomarker}</div>
                      <div className="col-span-3 text-right">
                        {t.ocr.tableThResult}
                      </div>
                      <div className="col-span-2 text-center">
                        {t.ocr.tableThFlag}
                      </div>
                      <div className="col-span-2 text-right">
                        {t.ocr.tableThRef}
                      </div>
                    </div>

                    {/* Simulated Printed Biomarker Rows with Interactive Bounding Boxes */}
                    <div className="mt-2 space-y-2">
                      {currentFields.map((field) => {
                        const isSelected = field.id === selectedField?.id;
                        const needsReview =
                          !field.verified || field.confidence < 85;

                        let bboxStyle =
                          "border-transparent bg-transparent hover:border-slate-300";
                        if (showBoundingBoxes) {
                          if (isSelected) {
                            bboxStyle = needsReview
                              ? "border-amber-600 bg-amber-100/45 ring-2 ring-amber-500/40"
                              : "border-teal-700 bg-teal-50/55 ring-2 ring-teal-600/35";
                          } else if (needsReview) {
                            bboxStyle =
                              "border-amber-500/80 border-dashed bg-amber-50/30 hover:bg-amber-50/60";
                          } else {
                            bboxStyle =
                              "border-teal-600/45 bg-teal-50/15 hover:border-teal-700";
                          }
                        }

                        const flagBadgeText =
                          field.flag === "Normal"
                            ? language === "vi"
                              ? "BT"
                              : "NORM"
                            : field.flag === "High"
                            ? language === "vi"
                              ? "CAO"
                              : "HIGH"
                            : field.flag === "Low"
                            ? language === "vi"
                              ? "THẤP"
                              : "LOW"
                            : language === "vi"
                            ? "DƯƠNG"
                            : "POS";

                        return (
                          <div
                            key={field.id}
                            id={`ocr-bbox-${field.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveFieldId(field.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setActiveFieldId(field.id);
                              }
                            }}
                            className={`relative grid grid-cols-12 items-center rounded-md border-2 px-2 py-2 font-mono text-[11px] transition cursor-pointer ${bboxStyle}`}
                          >
                            {/* Floating Grounding Tag when selected */}
                            {showBoundingBoxes && isSelected && (
                              <span
                                className={`-top-2.5 left-2 absolute rounded px-1.5 py-0.2 font-mono text-[9px] font-bold text-white shadow-2xs ${
                                  needsReview ? "bg-amber-600" : "bg-teal-700"
                                }`}
                              >
                                {field.code} • {field.confidence}% OCR
                              </span>
                            )}

                            <div className="col-span-5 pr-1">
                              <p className="font-sans text-[11px] font-semibold text-slate-900 leading-tight">
                                {field.name}
                              </p>
                              <p className="text-[9px] text-slate-500">
                                [{field.code}]
                              </p>
                            </div>

                            <div className="col-span-3 text-right">
                              <span className="font-bold text-slate-900">
                                {field.value}
                              </span>{" "}
                              <span className="text-[9px] text-slate-500">
                                {field.unit}
                              </span>
                            </div>

                            <div className="col-span-2 text-center">
                              <span
                                className={`inline-block rounded px-1 py-0.2 text-[9px] font-bold ${
                                  field.flag === "Normal"
                                    ? "text-slate-500"
                                    : "bg-rose-100 text-rose-900"
                                }`}
                              >
                                {flagBadgeText}
                              </span>
                            </div>

                            <div className="col-span-2 text-right text-[9px] text-slate-500">
                              {field.referenceRange}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Simulated Lab Sheet Footer Signature */}
                    <div className="mt-5 flex items-center justify-between border-t border-slate-300 pt-2.5 font-mono text-[9px] text-slate-500">
                      <span>
                        {t.ocr.orderingPhysician}{" "}
                        {activeReport.orderingPhysician}
                      </span>
                      <span>{t.ocr.accreditedLab}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Legend Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs border border-teal-700 bg-teal-100" />
                  <span>{t.ocr.legendVerified}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs border border-dashed border-amber-600 bg-amber-100" />
                  <span>{t.ocr.legendReview}</span>
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                {t.ocr.legendHint}
              </span>
            </div>
          </section>

          {/* RIGHT PANE: Structured SLE e-CRF Extraction & Verification Table */}
          <section
            aria-label="Structured e-CRF Biomarker Extraction Table"
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-7"
          >
            {/* Right Pane Header: Patient Metadata & SLEDAI Impact */}
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-teal-800">
                      {activeReport.subtitle}
                    </span>
                  </div>
                  <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                    {activeReport.title} {t.ocr.extractionHeaderSuffix}
                  </h1>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-right">
                  <p className="font-mono text-[10px] font-semibold uppercase text-rose-700">
                    {t.ocr.sledaiImpactTitle}
                  </p>
                  <p className="font-mono text-xs font-bold text-rose-950">
                    {activeReport.sledaiImpact}
                  </p>
                </div>
              </div>

              {/* Filter Tabs & Quick Stats */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
                <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                  <button
                    type="button"
                    id="ocr-filter-all"
                    onClick={() => setFilterMode("all")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      filterMode === "all"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.ocr.filterAll(currentFields.length)}
                  </button>
                  <button
                    type="button"
                    id="ocr-filter-review"
                    onClick={() => setFilterMode("needs_review")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      filterMode === "needs_review"
                        ? "bg-white text-amber-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.ocr.filterReview(needsReviewCount)}
                  </button>
                  <button
                    type="button"
                    id="ocr-filter-abnormal"
                    onClick={() => setFilterMode("abnormal")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      filterMode === "abnormal"
                        ? "bg-white text-rose-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.ocr.filterAbnormal(abnormalCount)}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="ocr-btn-add-row"
                    onClick={handleAddBiomarkerRow}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    {t.ocr.addRowBtn}
                  </button>
                  {needsReviewCount > 0 && (
                    <button
                      type="button"
                      id="ocr-btn-verify-all"
                      onClick={handleVerifyAllFlagged}
                      className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 cursor-pointer"
                    >
                      {t.ocr.verifyAllBtn(needsReviewCount)}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted Biomarker Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">{t.ocr.tblHeaderBiomarker}</th>
                    <th className="px-3 py-2.5">{t.ocr.tblHeaderValue}</th>
                    <th className="px-3 py-2.5">{t.ocr.tblHeaderUnitRef}</th>
                    <th className="px-3 py-2.5">{t.ocr.tblHeaderFlag}</th>
                    <th className="px-3 py-2.5 text-right">
                      {t.ocr.tblHeaderHitl}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredFields.map((field) => {
                    const isSelected = field.id === selectedField?.id;
                    const needsReview =
                      !field.verified || field.confidence < 85;

                    return (
                      <tr
                        key={field.id}
                        id={`ocr-row-${field.id}`}
                        onClick={() => setActiveFieldId(field.id)}
                        className={`transition cursor-pointer ${
                          isSelected
                            ? "bg-teal-50/60"
                            : needsReview
                            ? "bg-amber-50/40 hover:bg-amber-50/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {/* Biomarker Name & Code */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                needsReview ? "bg-amber-500" : "bg-teal-600"
                              }`}
                            />
                            <span className="font-mono text-[10px] font-bold text-slate-500">
                              {field.code}
                            </span>
                          </div>
                          <p className="mt-0.5 font-semibold text-slate-900">
                            {field.name}
                          </p>
                        </td>

                        {/* Inline Editable Value Input */}
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            aria-label={`Value for ${field.name}`}
                            value={field.value}
                            onChange={(e) =>
                              handleUpdateFieldValue(
                                field.id,
                                "value",
                                e.target.value
                              )
                            }
                            className={`w-28 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold focus:outline-none ${
                              needsReview
                                ? "border-amber-400 bg-white text-amber-950 focus:border-amber-600"
                                : "border-slate-200 bg-white text-slate-900 focus:border-teal-700"
                            }`}
                          />
                        </td>

                        {/* Unit & Reference Interval */}
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            aria-label={`Unit for ${field.name}`}
                            value={field.unit}
                            onChange={(e) =>
                              handleUpdateFieldValue(
                                field.id,
                                "unit",
                                e.target.value
                              )
                            }
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-medium text-slate-700 focus:border-teal-700 focus:bg-white focus:outline-none"
                          />
                          <p className="mt-1 font-mono text-[10px] text-slate-500">
                            Ref: {field.referenceRange}
                          </p>
                        </td>

                        {/* Clinical Flag Selector */}
                        <td className="px-3 py-3">
                          <select
                            aria-label={`Clinical flag for ${field.name}`}
                            value={field.flag}
                            onChange={(e) =>
                              handleUpdateFieldValue(
                                field.id,
                                "flag",
                                e.target.value as ClinicalFlag
                              )
                            }
                            className={`rounded-md border px-2 py-1 font-mono text-[11px] font-bold focus:outline-none ${
                              field.flag === "Normal"
                                ? "border-slate-200 bg-slate-100 text-slate-700"
                                : "border-rose-200 bg-rose-100 text-rose-900"
                            }`}
                          >
                            <option value="Normal">{t.common.normal}</option>
                            <option value="High">{t.common.high}</option>
                            <option value="Low">{t.common.low}</option>
                            <option value="Positive">
                              {t.common.positive}
                            </option>
                          </select>
                        </td>

                        {/* Confidence & Verify Action */}
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            {needsReview ? (
                              <button
                                type="button"
                                id={`ocr-btn-verify-${field.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVerifyRow(field.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs transition hover:bg-amber-700 cursor-pointer"
                              >
                                <span>
                                  {language === "vi" ? "Xác thực" : "Verify"} (
                                  {field.confidence}%)
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-800">
                                ✓ {t.common.verified} ({field.confidence}%)
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Selected Biomarker Clinical Guidance Callout */}
            {selectedField && (
              <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800">
                      {t.ocr.groundedFieldPrefix} {selectedField.code}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {selectedField.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    {t.ocr.categoryPrefix} {selectedField.category}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  <strong>{t.ocr.clinicalNotePrefix}</strong>{" "}
                  {selectedField.clinicalNote}
                </p>
              </div>
            )}

            {/* Bottom e-CRF Submission & Export Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
              <div className="text-xs">
                {needsReviewCount > 0 ? (
                  <p className="font-medium text-amber-800">
                    {t.ocr.statusNeedsReview(needsReviewCount)}
                  </p>
                ) : (
                  <p className="font-medium text-teal-800">
                    {t.ocr.statusAllVerified(currentFields.length)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  id="ocr-btn-export-json"
                  onClick={() => setIsJsonModalOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
                >
                  {t.ocr.exportJsonBtn}
                </button>

                <button
                  type="button"
                  id="ocr-btn-save-registry"
                  onClick={handleSaveToRegistry}
                  className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 cursor-pointer"
                >
                  {t.ocr.saveRegistryBtn}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Saved SLE Registry Records Log (Demonstrates state persistence after clicking Save) */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t.ocr.committedSectionTitle(savedRecords.length)}
              </h2>
              <p className="text-xs text-slate-500">
                {t.ocr.committedSectionDesc}
              </p>
            </div>
          </div>

          {savedRecords.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              {t.ocr.noRecordsCommitted}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {savedRecords.map((rec) => (
                <div
                  key={rec.recordId}
                  className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-teal-700 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                      {rec.recordId}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {t.ocr.recordSavedAt(rec.savedAt)}
                    </span>
                  </div>
                  <p className="mt-2 font-bold text-slate-900">
                    {rec.reportTitle}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    {language === "vi" ? "Bệnh nhân:" : "Patient:"}{" "}
                    <strong>{rec.patientName}</strong> ({rec.patientId})
                  </p>
                  <p className="mt-1 font-mono text-[11px] font-semibold text-rose-800">
                    {rec.sledaiImpact}
                  </p>
                  <p className="mt-2 border-t border-teal-200/70 pt-2 text-[11px] text-slate-500">
                    {t.ocr.recordSignedBy(rec.verifiedBy, rec.fields.length)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Standardized e-CRF JSON Preview Modal */}
      {isJsonModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="json-modal-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h2
                  id="json-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  {t.ocr.jsonModalTitle}
                </h2>
                <p className="text-xs text-slate-600">
                  {t.ocr.jsonModalDesc(
                    activeReport.patientName,
                    activeReport.patientId,
                    activeReport.title
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-900 p-5 text-slate-100">
              <pre className="font-mono text-xs leading-relaxed">
                {JSON.stringify(eCrfJsonPayload, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                id="json-modal-btn-download"
                onClick={handleDownloadJson}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                {t.ocr.jsonModalDownloadBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
