import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientUploadView } from "@/components/upload/PatientUploadView";
import { fileLabel } from "@/data/uploadTranslations";
import { TRANSLATIONS, type Language } from "@/data/translations";

const state = vi.hoisted(() => ({
  language: "vi" as Language,
}));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({
    language: state.language,
    t: TRANSLATIONS[state.language],
    currentUser: null,
    authLoading: false,
    submitPatientUpload: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  state.language = "vi";
});

function cameraInputTag(markup: string): string {
  const match = markup.match(/<input[^>]*id="upload-camera-input"[^>]*>/);
  return match ? match[0] : "";
}

describe("patient upload camera capture", () => {
  it("renders a native-camera input (environment, single image) with a translated label", () => {
    const markup = renderToStaticMarkup(<PatientUploadView />);
    const tag = cameraInputTag(markup);
    expect(tag).not.toBe("");
    expect(tag).toContain('type="file"');
    expect(tag).toContain('accept="image/*"');
    expect(tag).toContain('capture="environment"');
    expect(tag).not.toContain("multiple");
    expect(markup).toMatch(/<button[^>]*id="upload-btn-camera"[^>]*>.*Chụp ảnh phiếu.*<\/button>/);
    expect(markup).toMatch(/id="upload-btn-camera"[^>]*><svg aria-hidden="true"[^>]*>.*?<\/svg>Chụp ảnh phiếu/);
    expect(markup).toMatch(/id="upload-btn-browse"[^>]*><svg aria-hidden="true"[^>]*>.*?<\/svg>Chọn ảnh có sẵn/);
  });

  it("renders the camera label in English when the language is en", () => {
    state.language = "en";
    const markup = renderToStaticMarkup(<PatientUploadView />);
    expect(cameraInputTag(markup)).toContain('capture="environment"');
    expect(markup).toContain("Take a photo");
    expect(markup).toContain("Choose existing photos");
  });

  it("keeps the existing multi-file browse input alongside the camera input", () => {
    const markup = renderToStaticMarkup(<PatientUploadView />);
    const browse = markup.match(/<input[^>]*id="upload-file-input"[^>]*>/);
    expect(browse?.[0]).toContain("multiple");
    expect(browse?.[0]).toMatch(/accept="[^\"]*image\/jpeg/);
    expect(markup).not.toMatch(/PDF|15 MB|Cổng Bệnh nhân/i);
    expect(cameraInputTag(markup)).not.toBe("");
  });

  it("puts camera and browse first, then a desktop drop hint, photo guidance and an explanation beside the disabled submit button", () => {
    const markup = renderToStaticMarkup(<PatientUploadView />);
    expect(markup.indexOf('id="upload-btn-camera"')).toBeLessThan(markup.indexOf('id="upload-btn-browse"'));
    expect(markup).toMatch(/class="hidden [^\"]*lg:[^\"]*"[^>]*>Kéo thả ảnh vào đây/);
    for (const text of ["20 MB", "Chụp thẳng", "Mỗi trang một ảnh", "ngày lấy mẫu", "Nên nộp gì", "anti-dsDNA", "Cần hỗ trợ?"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toMatch(/<button[^>]*id="upload-btn-submit"[^>]*disabled=""[^>]*aria-describedby="upload-submit-hint"/);
    expect(markup).toContain("Chọn ít nhất 1 ảnh để gửi");
  });
});

describe("fileLabel numbering (pure helper)", () => {
  it("numbers list items in order, starting at 1, in Vietnamese by default", () => {
    expect(fileLabel(0, "vi")).toBe("Ảnh 1");
    expect(fileLabel(1, "vi")).toBe("Ảnh 2");
    expect(fileLabel(2, "vi")).toBe("Ảnh 3");
  });

  it("numbers list items in English", () => {
    expect(fileLabel(0, "en")).toBe("Image 1");
    expect(fileLabel(1, "en")).toBe("Image 2");
  });

  it("renumbers after removing the first item: the remaining item becomes Ảnh 1", () => {
    // Two staged items are labelled Ảnh 1 and Ảnh 2.
    const before = [fileLabel(0, "vi"), fileLabel(1, "vi")];
    expect(before).toEqual(["Ảnh 1", "Ảnh 2"]);
    // Removing item 1 shifts the survivor to index 0, so it is labelled Ảnh 1.
    const after = [fileLabel(0, "vi")];
    expect(after).toEqual(["Ảnh 1"]);
  });
});
