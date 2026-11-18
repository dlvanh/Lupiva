import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CornerNotice } from "@/components/CornerNotice";

describe("CornerNotice", () => {
  const html = renderToStaticMarkup(
    <CornerNotice title="Có 1 hồ sơ mới" actionLabel="Mở hồ sơ" onAction={() => {}} onClose={() => {}}>
      Bệnh nhân vừa nộp hồ sơ.
    </CornerNotice>,
  );

  it("sits bottom-right as a polite status, not a modal over the page", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/fixed[^"]*bottom-4[^"]*right-4/);
    expect(html).not.toContain("aria-modal");
    expect(html).not.toContain("inset-0");
  });

  it("shows the title, body, action and a close button", () => {
    expect(html).toContain("Có 1 hồ sơ mới");
    expect(html).toContain("Bệnh nhân vừa nộp hồ sơ.");
    expect(html).toContain("Mở hồ sơ");
    expect(html).toMatch(/aria-label="(Đóng|Close)"/);
  });
});
