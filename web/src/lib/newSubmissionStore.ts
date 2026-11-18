/** Shared "Hồ sơ mới" count for the doctor menu badge, plus which ids were already announced. */
import { useSyncExternalStore } from "react";

export interface NewSubmissionEntry {
  id: string;
  submittedAt: string;
}

let count = 0;
const listeners = new Set<() => void>();

export function newSubmissionCount(): number {
  return count;
}

export function setNewSubmissionCount(next: number): void {
  if (next === count) return;
  count = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNewSubmissionCount(): number {
  return useSyncExternalStore(subscribe, newSubmissionCount, () => 0);
}

/** Ids in ``latest`` (newest first) that this browser session has not announced yet. */
export function unnotifiedIds(latest: readonly NewSubmissionEntry[], notified: ReadonlySet<string>): string[] {
  return latest.filter((entry) => !notified.has(entry.id)).map((entry) => entry.id);
}

/** How many to announce: all of them when the whole capped list is unannounced (e.g. right after sign-in). */
export function announcedCount(freshCount: number, listedCount: number, total: number): number {
  return freshCount > 0 && freshCount === listedCount ? Math.max(total, freshCount) : freshCount;
}
