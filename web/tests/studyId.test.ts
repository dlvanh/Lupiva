import { describe, expect, it } from "vitest";
import { formatStudyId } from "@/lib/submissionsService";

describe("formatStudyId", () => {
  it("numbers studies SLER-001 upward and widens past 999", () => {
    expect(formatStudyId(1)).toBe("SLER-001");
    expect(formatStudyId(42)).toBe("SLER-042");
    expect(formatStudyId(1000)).toBe("SLER-1000");
  });
  it("rejects a missing or invalid sequence value", () => {
    expect(() => formatStudyId(0)).toThrow();
    expect(() => formatStudyId(Number.NaN)).toThrow();
  });
});
