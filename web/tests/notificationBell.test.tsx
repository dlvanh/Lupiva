import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationBell, bellBadgeText } from "@/components/NotificationBell";

const latest = [
  { id: "a", submittedAt: "2026-11-19T02:15:00Z", studyId: "VN-1111-26", patientName: "Nguyễn Thị A" },
  { id: "b", submittedAt: "2026-11-19T01:00:00Z", studyId: "VN-2222-26", patientName: "" },
];

describe("NotificationBell", () => {
  it("badge shows 1, 2, 3 … and 9+ above nine; nothing at zero", () => {
    expect(bellBadgeText(0)).toBeNull();
    expect(bellBadgeText(1)).toBe("1");
    expect(bellBadgeText(3)).toBe("3");
    expect(bellBadgeText(9)).toBe("9");
    expect(bellBadgeText(12)).toBe("9+");
  });

  it("renders the count on the bell", () => {
    const html = renderToStaticMarkup(<NotificationBell count={2} latest={latest} isVi />);
    expect(html).toContain('id="nav-btn-notifications"');
    expect(html).toMatch(/id="nav-notifications-badge"[^>]*>2<\/span>/);
    expect(html).toContain('aria-label="Thông báo: 2 hồ sơ mới"');
  });

  it("open list names each new submission and links to all new ones", () => {
    const html = renderToStaticMarkup(<NotificationBell count={2} latest={latest} isVi initialOpen />);
    expect(html).toContain("VN-1111-26 • Nguyễn Thị A");
    expect(html).toContain("VN-2222-26");
    expect(html).not.toContain("VN-2222-26 •");
    expect(html).toContain('href="/upload?status=new"');
  });

  it("empty list says there is nothing new", () => {
    const html = renderToStaticMarkup(<NotificationBell count={0} latest={[]} isVi initialOpen />);
    expect(html).not.toContain('id="nav-notifications-badge"');
    expect(html).toContain("Không có hồ sơ mới.");
  });
});
