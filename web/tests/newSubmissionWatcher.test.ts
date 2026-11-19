import { describe, expect, it } from "vitest";
import { newSubmissions, setNewSubmissions } from "@/lib/newSubmissionStore";

const entry = { id: "a", submittedAt: "2026-11-18T08:00:00Z", studyId: "VN-1111-26", patientName: "A" };

describe("new-submission store for the bell", () => {
  it("shares count and newest entries", () => {
    setNewSubmissions({ count: 3, latest: [entry] });
    expect(newSubmissions().count).toBe(3);
    expect(newSubmissions().latest[0].studyId).toBe("VN-1111-26");
    setNewSubmissions({ count: 0, latest: [] });
    expect(newSubmissions()).toEqual({ count: 0, latest: [] });
  });

  it("keeps the same snapshot object when nothing changed (no re-render each poll)", () => {
    setNewSubmissions({ count: 1, latest: [entry] });
    const before = newSubmissions();
    setNewSubmissions({ count: 1, latest: [{ ...entry }] });
    expect(newSubmissions()).toBe(before);
    setNewSubmissions({ count: 0, latest: [] });
  });
});
