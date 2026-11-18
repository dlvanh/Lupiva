import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientSubmissionProgress } from "@/components/upload/PatientSubmissionProgress";
import { getUploadPageCopy } from "@/data/uploadTranslations";
import type { PatientStatusRecord } from "@/lib/submissionsService";

const stages = [
  ["received", "Đã nhận"],
  ["processing", "Đang xử lý"],
  ["extracted", "Bác sĩ đang xem"],
  ["awaiting_doctor", "Bác sĩ đang xem"],
  ["approved", "Bác sĩ đã duyệt"],
] as const satisfies readonly [PatientStatusRecord["processingStage"], string][];

function renderProgress(
  processingStage: PatientStatusRecord["processingStage"],
  submissionStatus: PatientStatusRecord["submissionStatus"] = "pending_doctor_review",
  language: "vi" | "en" = "vi",
) {
  return renderToStaticMarkup(
    <PatientSubmissionProgress
      processingStage={processingStage}
      submissionStatus={submissionStatus}
      copy={getUploadPageCopy(language).patient}
    />,
  );
}

describe("patient submission progress", () => {
  it.each(stages)("shows the %s stage in patient language", (stage, label) => {
    const markup = renderProgress(stage);
    const current = markup.match(/<li[^>]*aria-current="step"[^>]*>[\s\S]*?<\/li>/g);
    expect(current).toHaveLength(1);
    expect(current?.[0]).toContain(label);
    expect(markup.match(/<li\b/g)).toHaveLength(4);
    expect(markup).toMatch(/Đã nhận.*Đang xử lý.*Bác sĩ đang xem.*Bác sĩ đã duyệt/);
    const waiting = "Thường trong vài ngày làm việc. Bạn không cần làm gì thêm.";
    if (stage === "approved") {
      expect(markup).not.toContain(waiting);
    } else {
      expect(markup).toContain(waiting);
    }
  });

  it("treats an approved record as final and shows English labels when selected", () => {
    const markup = renderProgress("received", "approved", "en");
    expect(markup).toMatch(/aria-current="step"[^>]*>.*Approved by doctor/);
    expect(markup).not.toContain("a few working days");
  });
});
