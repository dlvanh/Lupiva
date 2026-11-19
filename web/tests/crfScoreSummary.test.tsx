import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CrfFormPage from "@/app/crf-form/page";
import RegistryPage from "@/app/registry/page";
import { CrfScoreSummary } from "@/components/CrfScoreSummary";
import type { ProvisionalScores } from "@/lib/provisionalScores";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({ language: "vi", currentUser: { role: "specialist" } }),
}));

// Retain the page state while exercising its case selector in the Node test environment.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
  useMemo: (create: () => unknown) => create(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value;
    }];
  },
}));

type SelectProps = { children?: ReactNode; onChange: (event: { target: { value: string } }) => void | Promise<void> };

function firstSelect(tree: ReactNode): ReactElement<SelectProps> | undefined {
  for (const child of React.Children.toArray(tree)) {
    if (!React.isValidElement<SelectProps>(child)) continue;
    if (child.type === "select") return child;
    const nested = firstSelect(child.props.children);
    if (nested) return nested;
  }
}

const provisional: ProvisionalScores = {
  sledai: {
    total: 8, yesCount: 1, proposalCount: 2, unansweredCount: 21,
    derived: [{ field_id: "SDA24", label: "Giảm bạch cầu", weight: 1, answer: "no", evidence: "HEM05 = 9.19 G/l" }],
  },
  eular: { total: 10, classification: "meets", proposalCount: 2, unansweredCount: 10, derived: [], ana: "yes" },
};

describe("CrfScoreSummary", () => {
  it("places the provisional figures beside the official figures in Vietnamese", () => {
    const html = renderToStaticMarkup(
      <CrfScoreSummary
        provisional={provisional}
        official={{
          sledai: { total: 0, missing: 23 },
          eular: { total: null, missing: 21, classification: "undetermined" },
        }}
      />,
    );

    expect(html).toContain("Điểm chính thức");
    expect(html).toContain("1 tiêu chí suy từ xét nghiệm");
    expect(html).toContain("Giảm bạch cầu: Không (HEM05 = 9.19 G/l)");
    expect(html).toContain("0 (còn 23 tiêu chí chưa trả lời)");
    expect(html).toContain("Chưa xác định - chưa xác nhận ANA");
    expect(html).toContain("Điểm tạm tính (chưa duyệt)");
    expect(html).toContain("SLEDAI-2K ≈ 8 (gồm 2 đề xuất chưa duyệt, còn 21 tiêu chí chưa có dữ kiện)");
    expect(html).toContain("EULAR/ACR 2019 ≈ 10 · Đạt tiêu chí phân loại");
    expect(html).toContain("Chỉ để tham khảo, gồm đề xuất chưa duyệt và tiêu chí suy từ xét nghiệm");
    expect(html).toContain("border-dashed");
    expect(html).not.toMatch(/<(input|select|button)\b/);
  });

  it("renders English and omits the unanswered note when the official zero is complete", () => {
    const html = renderToStaticMarkup(
      <CrfScoreSummary
        language="en"
        provisional={{ ...provisional, eular: { ...provisional.eular, classification: "ana_not_met" } }}
        official={{
          sledai: { total: 0, missing: 0 },
          eular: { total: 9, missing: 0, classification: "does_not_meet" },
        }}
        officialAna="yes"
      />,
    );

    expect(html).toContain("Official scores");
    expect(html).toContain("SLEDAI-2K · 0 points");
    expect(html).toContain("EULAR/ACR 2019 · 9 points · Does not meet classification criteria");
    expect(html).toContain("Provisional scores (unapproved)");
    expect(html).toContain("SLEDAI-2K ≈ 8 (includes 2 unapproved proposals, 21 criteria without evidence)");
    expect(html).toContain("EULAR/ACR 2019 ≈ 10 · ANA entry criterion not met");
    expect(html).not.toContain("unanswered criteria");
    expect(html).not.toContain("ANA unconfirmed");
  });

  it("uses the regular undetermined label when ANA has been confirmed", () => {
    const html = renderToStaticMarkup(
      <CrfScoreSummary
        provisional={{ ...provisional, eular: { ...provisional.eular, classification: "undetermined" } }}
        official={{ eular: { total: null, missing: 5, classification: "undetermined" } }}
        officialAna="yes"
      />,
    );

    expect(html).toContain("EULAR/ACR 2019 · Chưa xác định");
    expect(html).toContain("EULAR/ACR 2019 ≈ 10 · Chưa xác định");
    expect(html).not.toContain("chưa xác nhận ANA");
  });
});

describe("CRF score pages", () => {
  afterEach(() => {
    hooks.values.length = 0;
    vi.unstubAllGlobals();
  });

  it.each([
    { route: "/registry", Page: RegistryPage },
    { route: "/crf-form", Page: CrfFormPage },
  ])("shows the two scores after loading a case on $route", async ({ route, Page }) => {
    const fetchCase = vi.fn(async () => Response.json({
      source_snapshot: "source",
      draft_sha256: "draft",
      fields: [{
        slot: "SDA01/result",
        label: "Seizure",
        section: "SLEDAI-2K",
        component: "result",
        choices: [],
        options: [],
        proposal: { id: "proposal", value: "yes", origin: "llm" },
      }],
      layout: [
        { index: 1, text: "CRF" },
        { index: 2, text: "SLEDAI-2K score: Total = ......" },
      ],
      score_form: { sledai: [{ field_id: "SDA01", label: "Seizure", weight: 8 }], eular: [] },
      review: {
        reviewed_at: "2026-11-19T10:00:00Z",
        values: { "SDA25/result": { id: "saved", value: "0", origin: "score_calculated" } },
        scores: {
          assessment: { ana: "", date: "2026-11-19", criteria: {} },
          summaries: {
            sledai: { total: 0, missing: 1 },
            eular: { total: null, missing: 0, classification: "undetermined" },
          },
        },
      },
    }));
    vi.stubGlobal("fetch", fetchCase);
    const renderPage = () => {
      hooks.index = 0;
      return Page();
    };

    const selector = firstSelect(renderPage());
    expect(selector).toBeDefined();
    await selector?.props.onChange({ target: { value: "case-1" } });

    await vi.waitFor(() => {
      const html = renderToStaticMarkup(renderPage());
      expect(html).toContain("SLEDAI-2K · 0 (còn 1 tiêu chí chưa trả lời)");
      expect(html).toContain("SLEDAI-2K ≈ 8 (gồm 1 đề xuất chưa duyệt, còn 0 tiêu chí chưa có dữ kiện)");
      if (route === "/crf-form") expect(html).toMatch(/SLEDAI-2K score: Total =\s*<span[^>]*>0<\/span>/);
    });
    expect(fetchCase).toHaveBeenCalledExactlyOnceWith("/api/pipeline/api/crf?case_id=case-1", { cache: "no-store" });
  });
});
