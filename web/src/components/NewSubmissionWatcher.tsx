"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CenterNotice } from "@/components/CenterNotice";
import { useLupiva } from "@/context/LupivaContext";
import { setNewSubmissionCount, unnotifiedIds, type NewSubmissionEntry } from "@/lib/newSubmissionStore";

const POLL_MS = 20_000;
const STORAGE_KEY = "lupiva-notified-submissions";

function readNotified(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeNotified(ids: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // storage blocked: the notice may repeat after a reload
  }
}

/** While a specialist is signed in, asks every 20 s for never-opened submissions and announces new ones. */
export function NewSubmissionWatcher() {
  const router = useRouter();
  const { currentUser, language } = useLupiva();
  const isVi = language === "vi";
  const isSpecialist = currentUser?.role === "specialist";
  const [announce, setAnnounce] = useState<number>(0);

  useEffect(() => {
    if (!isSpecialist) {
      setNewSubmissionCount(0);
      return;
    }
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/submissions/new-count", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { count: number; latest: NewSubmissionEntry[] };
        setNewSubmissionCount(body.count);
        const notified = readNotified();
        const fresh = unnotifiedIds(body.latest, notified);
        if (fresh.length) {
          fresh.forEach((id) => notified.add(id));
          writeNotified(notified);
          setAnnounce(fresh.length);
        }
      } catch {
        // backend unreachable: try again next tick
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isSpecialist]);

  const close = useCallback(() => setAnnounce(0), []);
  if (!isSpecialist || announce === 0) return null;

  return (
    <CenterNotice
      open
      tone="info"
      id="doctor-new-submission-notice"
      title={isVi ? `Có ${announce} hồ sơ mới` : `${announce} new submission${announce > 1 ? "s" : ""}`}
      onClose={close}
      actions={[
        {
          label: isVi ? "Mở hồ sơ" : "Open submissions",
          id: "doctor-new-submission-open",
          onClick: () => {
            close();
            router.push("/upload?status=new");
          },
        },
        { label: isVi ? "Để sau" : "Later", variant: "secondary", onClick: close },
      ]}
    >
      <p>
        {isVi
          ? "Bệnh nhân vừa nộp hồ sơ. Hồ sơ nằm ở mục “Hồ sơ mới” cho đến khi có bác sĩ mở."
          : "A patient just submitted. It stays under “New” until a doctor opens it."}
      </p>
    </CenterNotice>
  );
}
