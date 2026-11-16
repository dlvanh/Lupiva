import { describe, expect, it } from "vitest";
import {
  caseForIntake,
  evidenceFor,
  proxiedAsset,
  reviewGroup,
  rowBox,
  singleSourceSelections,
  splitDatedValue,
} from "@/lib/crfEvidence";
import type { CrfField } from "@/lib/crfApproval";

const field = (over: Partial<CrfField>): CrfField => ({
  slot: "HEM01/result",
  label: "RBC",
  section: "Huyết học",
  component: "result",
  choices: [],
  options: [],
  ...over,
});

describe("splitDatedValue", () => {
  it("separates value, date and date kind", () => {
    expect(splitDatedValue("4.36 T/L (2026-05-27T09:38:00; sample_date)")).toEqual({
      value: "4.36 T/L",
      date: "27/05/2026 09:38",
      dateKind: "ngày lấy mẫu",
    });
  });
  it("drops a midnight time and keeps unknown kinds", () => {
    expect(splitDatedValue("Negative (2026-09-07T00:00:00; other_date)")).toEqual({
      value: "Negative",
      date: "07/09/2026",
      dateKind: "other_date",
    });
  });
  it("leaves undated values untouched", () => {
    expect(splitDatedValue("1:320 (Homogeneous)")).toEqual({ value: "1:320 (Homogeneous)" });
  });
});

describe("proxiedAsset", () => {
  it("routes backend assets through the proxy only", () => {
    expect(proxiedAsset("/asset?package_id=p&revision=1&key=k")).toBe("/api/pipeline/asset?package_id=p&revision=1&key=k");
    expect(proxiedAsset("https://evil.example/x.png")).toBeUndefined();
    expect(proxiedAsset("//evil/asset?x")).toBeUndefined();
    expect(proxiedAsset(undefined)).toBeUndefined();
  });
});

describe("rowBox", () => {
  it("converts a valid 0–1000 box to percent", () => {
    expect(rowBox({ box: [100, 200, 900, 250], image_size: [800, 600], coordinate_space: "outgoing_image_1000" })).toEqual({
      box: { left: 10, top: 20, width: 80, height: 5 },
      imageSize: [800, 600],
    });
  });
  it("rejects other spaces, inverted or out-of-range boxes", () => {
    expect(rowBox({ box: [100, 200, 900, 250], image_size: [800, 600], coordinate_space: "pixels" })).toEqual({});
    expect(rowBox({ box: [900, 200, 100, 250], image_size: [800, 600], coordinate_space: "outgoing_image_1000" })).toEqual({});
    expect(rowBox({ box: [0, 0, 1001, 10], image_size: [800, 600], coordinate_space: "outgoing_image_1000" })).toEqual({});
    expect(rowBox(undefined)).toEqual({});
  });
});

describe("evidenceFor", () => {
  it("joins option sources with backend details", () => {
    const evidence = evidenceFor(
      { id: "o1", value: "4.36 T/L", sources: ["s1", "missing"] },
      { s1: { label: "Số lượng hồng cầu-RBC", value: "4.36 T/L (2026-05-27T09:38:00; sample_date)", url: "/asset?key=a" } },
    );
    expect(evidence).toEqual([
      {
        label: "Số lượng hồng cầu-RBC",
        value: "4.36 T/L",
        date: "27/05/2026 09:38",
        dateKind: "ngày lấy mẫu",
        imageUrl: "/api/pipeline/asset?key=a",
      },
    ]);
  });
});

describe("reviewGroup and bulk selection", () => {
  const single = field({ slot: "A/result", options: [{ id: "a", value: "1" }] });
  const double = field({ slot: "B/result", options: [{ id: "b1", value: "1" }, { id: "b2", value: "2" }] });
  const rule = field({ slot: "C/result", proposal: { id: "c", value: "no", origin: "knowledge_rule" } });
  const unknown = field({ slot: "D/result", proposal: { id: "d", value: "unknown", origin: "no_evidence" } });
  const empty = field({ slot: "E/result" });

  it("groups fields by the decision they need", () => {
    expect([single, double, rule, unknown, empty].map(reviewGroup)).toEqual(["source", "decide", "decide", "unknown", "empty"]);
  });
  it("bulk-ticks only fields with exactly one source value", () => {
    expect(singleSourceSelections([single, double, rule, unknown, empty])).toEqual({ "A/result": "a" });
  });
});

describe("caseForIntake", () => {
  it("finds the case of an intake job", () => {
    const jobs = [{ job_id: "intake-1", case_id: "case-1" }, { job_id: "intake-2" }];
    expect(caseForIntake(jobs, "intake-1")).toBe("case-1");
    expect(caseForIntake(jobs, "intake-2")).toBeNull();
    expect(caseForIntake(undefined, "intake-1")).toBeNull();
  });
});

describe("withoutHidden", () => {
  it("drops the ANA method component and keeps the rest", async () => {
    const { withoutHidden } = await import("@/lib/crfEvidence");
    const view = {
      fields: [field({ slot: "IMM01/result" }), field({ slot: "IMM01/method" }), field({ slot: "IMM01/titre" })],
      review: null,
      source_snapshot: "s",
      draft_sha256: "d",
    };
    expect(withoutHidden(view).fields.map((f) => f.slot)).toEqual(["IMM01/result", "IMM01/titre"]);
  });
});
