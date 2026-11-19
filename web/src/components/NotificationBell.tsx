"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NewSubmissionEntry } from "@/lib/newSubmissionStore";

/** Fired when a bell link is clicked, so an already-mounted dashboard switches to "Hồ sơ mới". */
export const SHOW_NEW_SUBMISSIONS_EVENT = "lupiva:show-new-submissions";
const NEW_SUBMISSIONS_HREF = "/upload?status=new";

/** Badge text: 1, 2, 3 … 9, then 9+; null hides the badge. */
export function bellBadgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}

function formatTime(iso: string, isVi: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(isVi ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface NotificationBellProps {
  count: number;
  latest: readonly NewSubmissionEntry[];
  isVi: boolean;
  /** Test hook: render with the list already open. */
  initialOpen?: boolean;
}

/** Doctor's bell: never-opened submissions, same look as the bell on main. */
export function NotificationBell({ count, latest, isVi, initialOpen = false }: NotificationBellProps) {
  const [open, setOpen] = useState(initialOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const badge = bellBadgeText(count);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const goToNew = () => {
    setOpen(false);
    window.dispatchEvent(new Event(SHOW_NEW_SUBMISSIONS_EVENT));
  };

  const label = isVi
    ? count > 0 ? `Thông báo: ${count} hồ sơ mới` : "Thông báo"
    : count > 0 ? `Notifications: ${count} new submission${count > 1 ? "s" : ""}` : "Notifications";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id="nav-btn-notifications"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 cursor-pointer"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badge && (
          <span
            id="nav-notifications-badge"
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 tabular-nums text-white"
          >{badge}</span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label={isVi ? "Danh sách thông báo" : "Notification list"}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="text-xs font-bold text-slate-900">{isVi ? "Thông báo" : "Notifications"}</span>
            {count > 0 && (
              <span className="text-[11px] font-semibold text-slate-600">
                {isVi ? `${count} hồ sơ mới` : `${count} new`}
              </span>
            )}
          </div>

          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {latest.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">
                {isVi ? "Không có hồ sơ mới." : "No new submissions."}
              </p>
            ) : (
              latest.map((item) => (
                <Link
                  key={item.id}
                  href={NEW_SUBMISSIONS_HREF}
                  onClick={goToNew}
                  className="flex w-full items-start gap-2.5 bg-teal-50/40 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-900">
                      {item.patientName ? `${item.studyId} • ${item.patientName}` : item.studyId}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-600">
                      {isVi ? "Hồ sơ mới, chưa bác sĩ nào mở." : "New submission, not opened yet."}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                      {formatTime(item.submittedAt, isVi)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>

          {count > 0 && (
            <Link
              href={NEW_SUBMISSIONS_HREF}
              onClick={goToNew}
              className="block border-t border-slate-200 px-3.5 py-2 text-center text-[11px] font-semibold text-teal-800 hover:bg-slate-50"
            >
              {isVi ? "Xem tất cả hồ sơ mới" : "View all new submissions"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
