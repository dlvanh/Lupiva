"use client";

import { useEffect } from "react";
import { useLupiva } from "@/context/LupivaContext";
import { setNewSubmissions, type NewSubmissionsSnapshot } from "@/lib/newSubmissionStore";

const POLL_MS = 20_000;

/** While a specialist is signed in, asks every 20 s for never-opened submissions and feeds the navbar bell. */
export function NewSubmissionWatcher() {
  const { currentUser } = useLupiva();
  const isSpecialist = currentUser?.role === "specialist";

  useEffect(() => {
    if (!isSpecialist) {
      setNewSubmissions({ count: 0, latest: [] });
      return;
    }
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/submissions/new-count", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok || stopped) return;
        setNewSubmissions((await response.json()) as NewSubmissionsSnapshot);
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

  return null;
}
