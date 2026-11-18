import { describe, expect, it } from "vitest";
import {
  enterTick,
  fieldOriginBadge,
  moveActiveSlot,
  type CrfField,
} from "@/lib/crfApproval";

const field = (over: Partial<CrfField>): CrfField => ({
  slot: "HEM01/result",
  label: "RBC",
  section: "Haematology",
  component: "result",
  choices: [],
  options: [],
  ...over,
});

describe("moveActiveSlot", () => {
  const slots = ["A/result", "B/result", "C/result"];
  it("moves down and up between fields", () => {
    expect(moveActiveSlot(slots, "A/result", "ArrowDown")).toBe("B/result");
    expect(moveActiveSlot(slots, "B/result", "ArrowUp")).toBe("A/result");
  });
  it("starts at the first field and clamps at both ends", () => {
    expect(moveActiveSlot(slots, null, "ArrowDown")).toBe("A/result");
    expect(moveActiveSlot(slots, null, "ArrowUp")).toBe("A/result");
    expect(moveActiveSlot(slots, "A/result", "ArrowUp")).toBe("A/result");
    expect(moveActiveSlot(slots, "C/result", "ArrowDown")).toBe("C/result");
  });
  it("does nothing without fields", () => {
    expect(moveActiveSlot([], null, "ArrowDown")).toBeNull();
  });
});

describe("enterTick", () => {
  it("ticks a single source value and unticks it on a second Enter", () => {
    const single = field({ options: [{ id: "a", value: "1" }] });
    expect(enterTick(single, "")).toBe("a");
    expect(enterTick(single, "a")).toBe("");
  });
  it("toggles a proposal when it is the only offered answer", () => {
    const proposed = field({ proposal: { id: "p", value: "no", origin: "llm" } });
    expect(enterTick(proposed, "")).toBe("p");
    expect(enterTick(proposed, "p")).toBe("");
  });
  it("never picks between several source values on the doctor's behalf", () => {
    const multi = field({ options: [{ id: "a", value: "1" }, { id: "b", value: "2" }] });
    expect(enterTick(multi, "")).toBeNull();
    expect(enterTick({ ...multi, proposal: { id: "p", value: "3" } }, "")).toBeNull();
  });
  it("does nothing for an empty field", () => {
    expect(enterTick(field({}), "")).toBeNull();
  });
});

describe("fieldOriginBadge", () => {
  const single = field({ options: [{ id: "a", value: "1" }] });
  const proposed = field({ proposal: { id: "p", value: "no", origin: "llm" } });
  it("shows the approved origin first", () => {
    expect(fieldOriginBadge(single, "a", "typed", "1")).toBe("approved");
  });
  it("shows a typed correction as manual", () => {
    expect(fieldOriginBadge(single, "a", " 20 ", undefined)).toBe("manual");
    expect(fieldOriginBadge(field({}), "", "20", undefined)).toBe("manual");
  });
  it("shows where the selected value came from", () => {
    expect(fieldOriginBadge(single, "a", "", undefined)).toBe("source");
    expect(fieldOriginBadge(proposed, "p", "", undefined)).toBe("proposal");
    const manual = field({ manual_options: [{ id: "m", value: "x" }] });
    expect(fieldOriginBadge(manual, "m", "", undefined)).toBe("manual");
  });
  it("falls back to the offered value's origin, or nothing", () => {
    expect(fieldOriginBadge(single, "", "", undefined)).toBe("source");
    expect(fieldOriginBadge(proposed, "", "", undefined)).toBe("proposal");
    expect(fieldOriginBadge(field({}), "", "", undefined)).toBeNull();
  });
});
