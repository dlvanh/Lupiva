import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  language: "en" as "en" | "vi",
  currentUser: { role: "specialist" },
  authLoading: false,
  crfPatients: [],
  activeCrfPatientId: "",
}));
vi.mock("@/context/LupivaContext", () => ({ useLupiva: () => state }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import CrfPage from "@/app/crf/page";
import OcrPage from "@/app/ocr/page";
import ScoresPage from "@/app/scores/page";

describe("empty clinical pages", () => {
  beforeEach(() => { state.language = "en"; });

  for (const [name, Page] of [["/crf", CrfPage], ["/ocr", OcrPage], ["/scores", ScoresPage]] as const) {
    it(`${name} renders an empty state without a selected patient`, () => {
      expect(renderToStaticMarkup(<Page />)).toContain("No records yet. Records appear when patients submit documents.");
      state.language = "vi";
      expect(renderToStaticMarkup(<Page />)).toContain("Chưa có hồ sơ nào. Hồ sơ xuất hiện khi bệnh nhân gửi tài liệu.");
    });
  }
});
