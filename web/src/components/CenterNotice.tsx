"use client";

import React, { useEffect, useId, useRef, type JSX } from "react";

export interface CenterNoticeAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  id?: string;
}

export interface CenterNoticeProps {
  open: boolean;
  tone: "success" | "info";
  title: string;
  children?: React.ReactNode;
  actions: CenterNoticeAction[];
  onClose: () => void;
  id?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CenterNotice({
  open, tone, title, children, actions, onClose, id,
}: CenterNoticeProps): JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryIndex = actions.findIndex((action) => action.variant !== "secondary");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previousFocus = document.activeElement;
    const initialFocus = dialog.querySelector<HTMLElement>("[data-notice-primary]")
      ?? dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
    initialFocus.focus({ preventScroll: true });

    return () => {
      const active = document.activeElement;
      if (
        previousFocus instanceof HTMLElement && previousFocus.isConnected &&
        (active === document.body || dialog.contains(active))
      ) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || active === dialog || !dialog.contains(active) ||
        active === (event.shiftKey ? first : last)) {
        event.preventDefault();
        ((event.shiftKey ? last : first) ?? dialog).focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto overscroll-contain bg-slate-900/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={id}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl outline-none sm:p-8"
      >
        <div className={`mx-auto grid size-16 place-items-center rounded-full ${
          tone === "success" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-700"
        }`}>
          <svg aria-hidden="true" className="size-8" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {tone === "success" ? (
              <path d="m5 12 4 4L19 6" />
            ) : (
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
            )}
          </svg>
        </div>
        <h2 id={titleId} className="mt-4 text-xl font-bold text-slate-900 sm:text-2xl">
          {title}
        </h2>
        {children && <div className="mt-3 text-sm leading-relaxed text-slate-600">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions.map(({ label, onClick, variant = "primary", id: actionId }, index) => (
            <button
              key={actionId ?? label}
              id={actionId}
              type="button"
              data-notice-primary={index === primaryIndex ? "" : undefined}
              onClick={onClick}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                variant === "primary"
                  ? "bg-teal-700 text-white hover:bg-teal-800"
                  : "border border-slate-300 text-slate-800 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
