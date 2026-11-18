"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { UploadPageCopy } from "@/data/uploadTranslations";

export type CameraCaptureMode = "photo" | "scan";
export type ScanFilterPreset = "scan_bw" | "scan_color" | "original";

interface CapturedPageDraft {
  id: string;
  rawDataUrl: string;
  processedDataUrl: string;
  filter: ScanFilterPreset;
  rotationDeg: number;
}

interface PatientCameraScannerDialogProps {
  open: boolean;
  mode: CameraCaptureMode;
  copy: UploadPageCopy["patient"]["scanner"];
  onClose: () => void;
  onCaptureFiles: (files: File[]) => void;
}

/**
 * Loads an image data URL into an HTMLImageElement for offscreen canvas processing.
 */
function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode captured image"));
    img.src = src;
  });
}

/**
 * Computes luminance contrast anchors (dark ink & paper background) from sampled pixels.
 */
function computeLuminanceAnchors(data: Uint8ClampedArray): {
  darkAnchor: number;
  span: number;
} {
  const hist = new Uint32Array(256);
  let sampleCount = 0;

  for (let i = 0; i < data.length; i += 16) {
    const lum = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    hist[lum] += 1;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return { darkAnchor: 20, span: 210 };
  }

  const lowTarget = Math.floor(sampleCount * 0.04);
  const highTarget = Math.floor(sampleCount * 0.86);

  let acc = 0;
  let darkAnchor = 0;
  let paperAnchor = 240;
  let foundLow = false;

  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (!foundLow && acc >= lowTarget) {
      darkAnchor = v;
      foundLow = true;
    }
    if (acc >= highTarget) {
      paperAnchor = v;
      break;
    }
  }

  return {
    darkAnchor,
    span: Math.max(48, paperAnchor - darkAnchor),
  };
}

/**
 * Renders a captured raw image with rotation and document scan contrast enhancement.
 */
async function renderProcessedCanvas(
  rawDataUrl: string,
  filter: ScanFilterPreset,
  rotationDeg: number
): Promise<HTMLCanvasElement> {
  const img = await loadImageFromUrl(rawDataUrl);
  const normalizedRot = ((rotationDeg % 360) + 360) % 360;
  const swapAxes = normalizedRot === 90 || normalizedRot === 270;

  const canvas = document.createElement("canvas");
  canvas.width = swapAxes ? img.naturalHeight : img.naturalWidth;
  canvas.height = swapAxes ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRot * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  if (filter === "original") {
    return canvas;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const { darkAnchor, span } = computeLuminanceAnchors(data);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const norm = Math.min(1, Math.max(0, (lum - darkAnchor) / span));

    if (filter === "scan_bw") {
      const val =
        norm > 0.74
          ? 255
          : Math.round(Math.pow(norm / 0.74, 1.35) * 235);
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    } else {
      const targetLum =
        norm > 0.8
          ? 255
          : Math.round(Math.pow(norm / 0.8, 1.15) * 245);
      if (targetLum >= 254) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        const scale = lum > 1 ? targetLum / lum : 1;
        data[i] = Math.min(255, Math.round(r * scale));
        data[i + 1] = Math.min(255, Math.round(g * scale));
        data[i + 2] = Math.min(255, Math.round(b * scale));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not export JPEG image"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

/**
 * Interactive camera & direct document scanner modal supporting live capture,
 * document framing overlay, contrast enhancement, rotation, and multi-page scanning.
 */
export function PatientCameraScannerDialog({
  open,
  mode,
  copy,
  onClose,
  onCaptureFiles,
}: PatientCameraScannerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [cameraState, setCameraState] = useState<
    "starting" | "ready" | "error"
  >("starting");
  const [pages, setPages] = useState<CapturedPageDraft[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const defaultFilter: ScanFilterPreset =
    mode === "scan" ? "scan_bw" : "original";

  const stopCameraStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (targetFacing: "environment" | "user") => {
      stopCameraStream();
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCameraState("error");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraState("ready");
      } catch {
        setCameraState("error");
      }
    },
    [stopCameraStream]
  );

  // Sync <dialog> open/close and camera stream lifecycle
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      const timer = setTimeout(() => {
        setCameraState("starting");
        void startCameraStream(facingMode);
      }, 0);
      return () => clearTimeout(timer);
    }

    stopCameraStream();
    if (dialog.open) {
      dialog.close();
    }
  }, [open, facingMode, startCameraStream, stopCameraStream]);

  // Ensure tracks always stop on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const activeDraft =
    activePageIndex !== null ? pages[activePageIndex] ?? null : null;

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsProcessing(true);
    try {
      const rawCanvas = document.createElement("canvas");
      rawCanvas.width = video.videoWidth;
      rawCanvas.height = video.videoHeight;
      const ctx = rawCanvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height);
      const rawDataUrl = rawCanvas.toDataURL("image/jpeg", 0.94);

      const processedCanvas = await renderProcessedCanvas(
        rawDataUrl,
        defaultFilter,
        0
      );
      const processedDataUrl =
        defaultFilter === "original"
          ? rawDataUrl
          : processedCanvas.toDataURL("image/jpeg", 0.92);

      const nextDraft: CapturedPageDraft = {
        id: `cap-${Date.now()}-${pages.length + 1}`,
        rawDataUrl,
        processedDataUrl,
        filter: defaultFilter,
        rotationDeg: 0,
      };

      setPages((prev) => {
        const next = [...prev, nextDraft];
        setActivePageIndex(next.length - 1);
        return next;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateActivePage = async (
    nextFilter: ScanFilterPreset,
    nextRotation: number
  ) => {
    if (activePageIndex === null || !activeDraft) return;
    setIsProcessing(true);
    try {
      const canvas = await renderProcessedCanvas(
        activeDraft.rawDataUrl,
        nextFilter,
        nextRotation
      );
      const processedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setPages((prev) =>
        prev.map((page, idx) =>
          idx === activePageIndex
            ? {
                ...page,
                filter: nextFilter,
                rotationDeg: nextRotation,
                processedDataUrl,
              }
            : page
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetakeActive = () => {
    if (activePageIndex === null) return;
    setPages((prev) => prev.filter((_, idx) => idx !== activePageIndex));
    setActivePageIndex(null);
    if (cameraState !== "ready") {
      void startCameraStream(facingMode);
    }
  };

  const handleRemovePage = (index: number) => {
    setPages((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        setActivePageIndex(null);
      } else if (activePageIndex !== null) {
        setActivePageIndex(Math.min(activePageIndex, next.length - 1));
      }
      return next;
    });
  };

  const handleAddMorePage = () => {
    setActivePageIndex(null);
    if (cameraState !== "ready") {
      void startCameraStream(facingMode);
    }
  };

  const handleConfirmAll = async () => {
    if (pages.length === 0) return;
    setIsProcessing(true);
    try {
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14);
      const prefix = mode === "scan" ? "Scan_Ho_So" : "Anh_Chup_Ho_So";

      const exportedFiles = await Promise.all(
        pages.map(async (page, idx) => {
          const canvas = await renderProcessedCanvas(
            page.rawDataUrl,
            page.filter,
            page.rotationDeg
          );
          const suffix = pages.length > 1 ? `_Trang_${idx + 1}` : "";
          return canvasToJpegFile(canvas, `${prefix}_${stamp}${suffix}.jpg`);
        })
      );

      onCaptureFiles(exportedFiles);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNativeCameraPicked = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!rawDataUrl) return;
      setIsProcessing(true);
      try {
        const processedCanvas = await renderProcessedCanvas(
          rawDataUrl,
          defaultFilter,
          0
        );
        const processedDataUrl =
          defaultFilter === "original"
            ? rawDataUrl
            : processedCanvas.toDataURL("image/jpeg", 0.92);

        const nextDraft: CapturedPageDraft = {
          id: `cap-${Date.now()}-${pages.length + 1}`,
          rawDataUrl,
          processedDataUrl,
          filter: defaultFilter,
          rotationDeg: 0,
        };
        setPages((prev) => {
          const next = [...prev, nextDraft];
          setActivePageIndex(next.length - 1);
          return next;
        });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const filterOptions: Array<{ key: ScanFilterPreset; label: string }> = [
    { key: "scan_bw", label: copy.filterScanBw },
    { key: "scan_color", label: copy.filterScanColor },
    { key: "original", label: copy.filterOriginal },
  ];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="camera-scanner-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/70"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="camera-scanner-dialog-title"
              className="text-base font-bold text-slate-900"
            >
              {mode === "scan" ? copy.scanTitle : copy.photoTitle}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {mode === "scan" ? copy.scanSubtitle : copy.photoSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            {copy.closeBtn}
          </button>
        </div>

        {/* Hidden native camera fallback input */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            void handleNativeCameraPicked(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Viewport: either live camera or captured page preview */}
        <div className="bg-slate-950 p-4">
          {activeDraft ? (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeDraft.processedDataUrl}
                alt={copy.capturedPageAlt((activePageIndex ?? 0) + 1)}
                className="max-h-[52vh] w-auto rounded-lg border border-slate-700 bg-white object-contain"
              />
            </div>
          ) : (
            <div className="relative mx-auto flex min-h-[280px] max-h-[52vh] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`max-h-[52vh] w-full object-contain ${
                  cameraState === "ready" ? "block" : "hidden"
                }`}
              />

              {/* Document framing overlay in Scan mode */}
              {cameraState === "ready" && mode === "scan" && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-4 flex items-end justify-center rounded-lg border-2 border-dashed border-teal-400/90 shadow-[inset_0_0_0_9999px_rgba(15,23,42,0.18)] sm:inset-6"
                >
                  <span className="mb-3 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold text-teal-100">
                    {copy.alignGuideText}
                  </span>
                </div>
              )}

              {cameraState === "starting" && (
                <p className="px-4 text-center text-xs font-medium text-slate-200">
                  {copy.startingCamera}
                </p>
              )}

              {cameraState === "error" && (
                <div className="max-w-md px-5 py-8 text-center">
                  <p className="text-sm font-bold text-white">
                    {copy.cameraUnavailableTitle}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    {copy.cameraUnavailableHint}
                  </p>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    {copy.nativeCameraBtn}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-page thumbnail strip when >= 1 page captured */}
        {pages.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {copy.pagesCapturedLabel(pages.length)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className={`relative shrink-0 rounded-lg border-2 p-0.5 ${
                    activePageIndex === idx
                      ? "border-teal-700 bg-teal-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActivePageIndex(idx)}
                    className="block cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.processedDataUrl}
                      alt={copy.capturedPageAlt(idx + 1)}
                      className="h-14 w-12 rounded object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(idx)}
                    aria-label={copy.removeCapturedPage(idx + 1)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow hover:bg-rose-700 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls Footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4">
          {activeDraft ? (
            <>
              {/* Filter & rotate controls for captured page */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold text-slate-700">
                    {copy.filterLabel}
                  </span>
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={isProcessing}
                      onClick={() =>
                        void updateActivePage(opt.key, activeDraft.rotationDeg)
                      }
                      className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        activeDraft.filter === opt.key
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() =>
                    void updateActivePage(
                      activeDraft.filter,
                      (activeDraft.rotationDeg + 90) % 360
                    )
                  }
                  className="min-h-8 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  ↻ {copy.rotateBtn}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleRetakeActive}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    {copy.retakeBtn}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleAddMorePage}
                    className="min-h-10 rounded-lg border border-teal-700/40 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
                  >
                    {copy.addMorePageBtn}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void handleConfirmAll()}
                  className="min-h-10 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                >
                  {pages.length > 1
                    ? copy.confirmMultiBtn(pages.length)
                    : copy.confirmSingleBtn}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {cameraState === "ready" && (
                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) =>
                        prev === "environment" ? "user" : "environment"
                      )
                    }
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    {copy.switchCameraBtn}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  {copy.nativeCameraBtn}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {pages.length > 0 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleConfirmAll()}
                    className="min-h-10 rounded-lg border border-teal-700 bg-white px-4 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 cursor-pointer"
                  >
                    {copy.confirmMultiBtn(pages.length)}
                  </button>
                )}
                <button
                  type="button"
                  disabled={cameraState !== "ready" || isProcessing}
                  onClick={() => void handleCaptureFrame()}
                  className="min-h-10 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {mode === "scan" ? copy.scanCaptureBtn : copy.captureBtn}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
