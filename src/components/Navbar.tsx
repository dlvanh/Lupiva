"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DoctorWorkspaceTab, useLupiva } from "@/context/LupivaContext";
import { getSubmissionStatus } from "@/data/crfData";
import { getOcrTierCounts } from "@/lib/submissionFilters";

const READ_NOTIFS_STORAGE_KEY = "lupiva-read-notifs";

interface DoctorNotificationItem {
  id: string;
  patientId: string;
  tone: "amber" | "rose" | "teal";
  title: string;
  description: string;
  timeLabel?: string;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    language,
    toggleLanguage,
    setLanguage,
    t,
    currentUser,
    logout,
    crfPatients,
    doctorActiveTab,
    setDoctorActiveTab,
    openDoctorPatientCrf,
    toast,
    dismissToast,
  } = useLupiva();

  const [fadingToastId, setFadingToastId] = useState<string | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(READ_NOTIFS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  });
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toast) return;

    const currentId = toast.id;
    const fadeTimer = setTimeout(() => {
      setFadingToastId(currentId);
    }, 4300);

    const dismissTimer = setTimeout(() => {
      dismissToast();
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast, dismissToast]);

  useEffect(() => {
    if (!isNotifOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNotifOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(e.target as Node)
      ) {
        setIsNotifOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotifOpen]);

  const persistReadIds = (nextIds: string[]) => {
    setReadNotifIds(nextIds);
    try {
      localStorage.setItem(READ_NOTIFS_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // ignore storage failure
    }
  };

  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";

  const { pendingCount, approvedCount } = useMemo(() => {
    let pending = 0;
    let approved = 0;
    for (const p of crfPatients) {
      if (getSubmissionStatus(p) === "approved") approved += 1;
      else pending += 1;
    }
    return { pendingCount: pending, approvedCount: approved };
  }, [crfPatients]);

  const notifications = useMemo<DoctorNotificationItem[]>(() => {
    if (!isSpecialist) return [];
    const list: DoctorNotificationItem[] = [];
    for (const p of crfPatients) {
      const approved = getSubmissionStatus(p) === "approved";
      if (!approved) {
        const counts = getOcrTierCounts(p);
        const unresolved = counts.manualCount + counts.verifyCount;
        list.push({
          id: `pending-${p.id}`,
          patientId: p.id,
          tone: "amber",
          title: `${p.studyId} • ${p.patientName}`,
          description: isVi
            ? "Hồ sơ mới tải lên, đang chờ bác sĩ duyệt."
            : "New dossier uploaded, pending doctor review.",
          timeLabel: p.submittedAt,
        });
        if (unresolved > 0) {
          list.push({
            id: `ocr-${p.id}`,
            patientId: p.id,
            tone: "rose",
            title: `${p.studyId} • OCR`,
            description: isVi
              ? `Có ${unresolved} mục OCR cần bác sĩ kiểm tra.`
              : `${unresolved} OCR field(s) require verification.`,
            timeLabel: p.submittedAt,
          });
        }
      } else {
        list.push({
          id: `approved-${p.id}`,
          patientId: p.id,
          tone: "teal",
          title: `${p.studyId} • ${p.patientName}`,
          description: isVi
            ? "Đã phê duyệt CRF và sẵn sàng cho REDCap."
            : "CRF approved and ready for REDCap.",
          timeLabel: p.lastUpdated || p.submittedAt,
        });
      }
    }
    return list;
  }, [crfPatients, isSpecialist, isVi]);

  const readSet = useMemo(() => new Set(readNotifIds), [readNotifIds]);
  const unreadCount = useMemo(
    () => notifications.filter((n) => !readSet.has(n.id)).length,
    [notifications, readSet]
  );

  const doctorTabs: Array<{
    id: DoctorWorkspaceTab;
    label: string;
    badge?: number;
  }> = [
    {
      id: "pending",
      label: isVi ? "Hồ sơ chưa duyệt" : "Pending Review",
      badge: pendingCount,
    },
    {
      id: "approved",
      label: isVi ? "Hồ sơ đã phê duyệt" : "Approved",
      badge: approvedCount,
    },
    {
      id: "crf",
      label: "CRF",
    },
    {
      id: "redcap",
      label: "REDCap",
    },
  ];

  const handleSelectDoctorTab = (tab: DoctorWorkspaceTab) => {
    setDoctorActiveTab(tab);
    if (pathname !== "/") {
      router.push("/");
    }
  };

  const handleNotificationClick = (item: DoctorNotificationItem) => {
    if (!readSet.has(item.id)) {
      persistReadIds([...readNotifIds, item.id]);
    }
    openDoctorPatientCrf(item.patientId);
    if (pathname !== "/") {
      router.push("/");
    }
    setIsNotifOpen(false);
  };

  const handleMarkAllRead = () => {
    const allIds = Array.from(
      new Set([...readNotifIds, ...notifications.map((n) => n.id)])
    );
    persistReadIds(allIds);
  };

  const visibleToast = toast;
  const isFadingOut = Boolean(toast && fadingToastId === toast.id);

  return (
    <>
      <a
        href="#main-content"
        className="skip-link fixed top-2 left-2 z-50 rounded-md bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white shadow-md"
      >
        {isVi ? "Chuyển tới nội dung chính" : "Skip to main content"}
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left: Inline Brand Logo + Menu Bar */}
          <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-6">
            <Link
              href="/"
              id="nav-brand-logo"
              onClick={(e) => {
                if (isSpecialist) {
                  setDoctorActiveTab("dashboard");
                  if (pathname === "/") {
                    e.preventDefault();
                  }
                }
              }}
              className="group flex min-w-0 items-center gap-2.5 rounded-lg"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-teal-800/20 bg-teal-700 text-white shadow-2xs transition group-hover:bg-teal-800">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
                </svg>
              </span>
              <span
                className={`text-xs font-bold leading-snug tracking-tight text-slate-900 sm:text-sm ${
                  isSpecialist
                    ? "max-w-[230px] sm:max-w-[300px] xl:max-w-[340px]"
                    : "max-w-[240px] sm:max-w-[380px] lg:max-w-none"
                }`}
              >
                {t.common.brandName}
              </span>
            </Link>

            {isSpecialist ? (
              <nav
                aria-label="Primary"
                className="flex items-center gap-1 overflow-x-auto"
              >
                {doctorTabs.map((tab) => {
                  const isActive = doctorActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      id={`nav-tab-${tab.id}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => handleSelectDoctorTab(tab.id)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm cursor-pointer ${
                        isActive
                          ? "bg-teal-50 text-teal-900"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {tab.label}
                      {typeof tab.badge === "number" && tab.badge > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-teal-100 px-1.5 py-0.2 text-[11px] font-bold tabular-nums text-teal-800">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            ) : currentUser?.role === "patient" ? (
              <nav
                aria-label="Primary"
                className="flex items-center gap-1 overflow-x-auto"
              >
                <Link
                  href="/upload"
                  id="nav-link-upload"
                  aria-current={pathname === "/upload" ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    pathname === "/upload"
                      ? "bg-teal-50 text-teal-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {isVi ? "Tải tài liệu" : "Upload Document"}
                </Link>
              </nav>
            ) : null}
          </div>

          {/* Right Controls: Session, Push Notification (Specialist) & Language Switcher */}
          <div className="ml-auto flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-2xs">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    isSpecialist ? "bg-teal-600" : "bg-blue-600"
                  }`}
                />
                <span className="hidden text-xs font-semibold text-slate-900 sm:inline">
                  {currentUser.name}
                </span>
                <button
                  type="button"
                  id="nav-btn-signout"
                  onClick={logout}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  {t.common.signOut}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                id="nav-btn-signin"
                className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {t.common.signIn}
              </Link>
            )}

            {/* Push Notification Bell next to Language Switcher (Specialist only) */}
            {isSpecialist && (
              <div ref={notifContainerRef} className="relative">
                <button
                  type="button"
                  id="nav-btn-notifications"
                  aria-expanded={isNotifOpen}
                  aria-label={isVi ? "Thông báo" : "Notifications"}
                  onClick={() => setIsNotifOpen((open) => !open)}
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
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 tabular-nums text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <div
                    role="region"
                    aria-label={isVi ? "Danh sách thông báo" : "Notification list"}
                    className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="text-xs font-bold text-slate-900">
                        {isVi ? "Thông báo" : "Notifications"}
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          id="nav-btn-mark-all-read"
                          onClick={handleMarkAllRead}
                          className="text-[11px] font-semibold text-teal-800 hover:underline cursor-pointer"
                        >
                          {isVi ? "Đánh dấu đã đọc" : "Mark all read"}
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-slate-500">
                          {isVi ? "Không có thông báo mới." : "No notifications."}
                        </p>
                      ) : (
                        notifications.map((item) => {
                          const isUnread = !readSet.has(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleNotificationClick(item)}
                              className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50 cursor-pointer ${
                                isUnread ? "bg-teal-50/40" : "bg-white"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  item.tone === "rose"
                                    ? "bg-rose-600"
                                    : item.tone === "amber"
                                    ? "bg-amber-500"
                                    : "bg-teal-600"
                                }`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-900">
                                  {item.title}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-slate-600">
                                  {item.description}
                                </span>
                                {item.timeLabel && (
                                  <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                                    {item.timeLabel}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Compact Bilingual English / Vietnamese Switcher (Far Right) */}
            <div
              className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label={t.common.languageToggleTitle}
            >
              <button
                type="button"
                id="nav-btn-language-toggle"
                onClick={toggleLanguage}
                aria-label={t.common.languageToggleTitle}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-200/60 cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="h-3 w-3 text-teal-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="flex items-center gap-0.5 text-[11px] font-semibold">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage("en");
                    }}
                    className={`rounded px-1 py-0.2 transition ${
                      language === "en"
                        ? "bg-teal-700 font-bold text-white"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    EN
                  </span>
                  <span className="text-slate-300">/</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage("vi");
                    }}
                    className={`rounded px-1 py-0.2 transition ${
                      language === "vi"
                        ? "bg-teal-700 font-bold text-white"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    VI
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Global Toast Banner */}
      {visibleToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg transition-all duration-700 ease-out ${
            isFadingOut
              ? "opacity-0 translate-y-2 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
        >
          <div
            aria-hidden="true"
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
              visibleToast.tone === "teal"
                ? "bg-teal-700"
                : visibleToast.tone === "amber"
                  ? "bg-amber-600"
                  : "bg-slate-800"
            }`}
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1 text-xs">
            <p className="font-semibold text-slate-900">{visibleToast.title}</p>
            <p className="mt-0.5 text-slate-600">{visibleToast.description}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Close notification"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
