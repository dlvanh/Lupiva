"use client";

import React, { useEffect } from "react";

export interface CornerNoticeProps {
  title: string;
  children?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  /** Hide by itself after this many ms; 0 keeps it until closed. */
  autoHideMs?: number;
  closeLabel?: string;
  id?: string;
}

/** A small card in the bottom-right corner that does not block the page (doctor notices). */
export function CornerNotice({
  title, children, actionLabel, onAction, onClose, autoHideMs = 15_000, closeLabel = "Đóng", id,
}: CornerNoticeProps) {
  useEffect(() => {
    if (!autoHideMs) return;
    const timer = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [autoHideMs, onClose]);

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-sky-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-800">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          {children && <p className="mt-1 text-xs leading-relaxed text-slate-600">{children}</p>}
          <button
            type="button"
            onClick={onAction}
            className="mt-3 min-h-8 rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
          >
            {actionLabel}
          </button>
        </div>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
