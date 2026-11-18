import { describe, expect, it } from "vitest";
import { announcedCount, newSubmissionCount, setNewSubmissionCount, unnotifiedIds } from "@/lib/newSubmissionStore";

describe("new-submission notice bookkeeping", () => {
  it("announces only submissions not announced before in this session", () => {
    const latest = [{ id: "a", submittedAt: "2026-11-18T08:00:00Z" }, { id: "b", submittedAt: "2026-11-18T07:00:00Z" }];
    expect(unnotifiedIds(latest, new Set())).toEqual(["a", "b"]);
    expect(unnotifiedIds(latest, new Set(["a", "b"]))).toEqual([]);
    expect(unnotifiedIds([{ id: "c", submittedAt: "2026-11-18T09:00:00Z" }, ...latest], new Set(["a", "b"]))).toEqual(["c"]);
  });

  it("announces the full total when every listed submission is unannounced (list is capped at 5)", () => {
    expect(announcedCount(5, 5, 7)).toBe(7);
    expect(announcedCount(1, 5, 8)).toBe(1);
    expect(announcedCount(0, 5, 7)).toBe(0);
  });

  it("shares the count with the menu badge", () => {
    setNewSubmissionCount(3);
    expect(newSubmissionCount()).toBe(3);
    setNewSubmissionCount(0);
    expect(newSubmissionCount()).toBe(0);
  });
});
