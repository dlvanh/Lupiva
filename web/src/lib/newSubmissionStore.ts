/** Never-opened submissions for the doctor's notification bell: total count plus the newest few. */
import { useSyncExternalStore } from "react";

export interface NewSubmissionEntry {
  id: string;
  submittedAt: string;
  studyId: string;
  patientName: string;
}

export interface NewSubmissionsSnapshot {
  count: number;
  latest: readonly NewSubmissionEntry[];
}

const EMPTY: NewSubmissionsSnapshot = { count: 0, latest: [] };
let snapshot: NewSubmissionsSnapshot = EMPTY;
const listeners = new Set<() => void>();

function sameSnapshot(a: NewSubmissionsSnapshot, b: NewSubmissionsSnapshot): boolean {
  return (
    a.count === b.count &&
    a.latest.length === b.latest.length &&
    a.latest.every(
      (entry, i) =>
        entry.id === b.latest[i].id &&
        entry.studyId === b.latest[i].studyId &&
        entry.patientName === b.latest[i].patientName
    )
  );
}

export function newSubmissions(): NewSubmissionsSnapshot {
  return snapshot;
}

export function setNewSubmissions(next: NewSubmissionsSnapshot): void {
  if (sameSnapshot(snapshot, next)) return;
  snapshot = next.count === 0 && next.latest.length === 0 ? EMPTY : next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNewSubmissions(): NewSubmissionsSnapshot {
  return useSyncExternalStore(subscribe, newSubmissions, () => EMPTY);
}
