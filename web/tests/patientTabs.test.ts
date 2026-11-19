import { describe, expect, it } from "vitest";
import { patientTabAfterLoad } from "@/lib/patientTabs";

describe("patient upload page tabs", () => {
  it("opens the status tab when the patient already has submissions and has not picked a tab", () => {
    expect(patientTabAfterLoad(null, 2)).toBe("status");
    expect(patientTabAfterLoad(null, 0)).toBe("submit");
  });

  it("keeps the tab the patient picked", () => {
    expect(patientTabAfterLoad("submit", 3)).toBe("submit");
    expect(patientTabAfterLoad("status", 0)).toBe("status");
  });
});
