import { describe, expect, it } from "vitest";
import { newSubmissionCount, setNewSubmissionCount, unnotifiedIds } from "@/lib/newSubmissionStore";

describe("new-submission notice bookkeeping", () => {
  it("announces only submissions not announced before in this session", () => {
    const latest = [{ id: "a", submittedAt: "2026-11-18T08:00:00Z" }, { id: "b", submittedAt: "2026-11-18T07:00:00Z" }];
    expect(unnotifiedIds(latest, new Set())).toEqual(["a", "b"]);
    expect(unnotifiedIds(latest, new Set(["a", "b"]))).toEqual([]);
    expect(unnotifiedIds([{ id: "c", submittedAt: "2026-11-18T09:00:00Z" }, ...latest], new Set(["a", "b"]))).toEqual(["c"]);
  });

  it("shares the count with the menu badge", () => {
    setNewSubmissionCount(3);
    expect(newSubmissionCount()).toBe(3);
    setNewSubmissionCount(0);
    expect(newSubmissionCount()).toBe(0);
  });
});
