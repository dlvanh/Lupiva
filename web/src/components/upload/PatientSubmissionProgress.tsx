import React from "react";
import { UiIcon } from "@/components/UiIcon";
import type { UploadPageCopy } from "@/data/uploadTranslations";
import type { PatientStatusRecord } from "@/lib/submissionsService";

const stepByStage = {
  received: 0,
  processing: 1,
  extracted: 2,
  awaiting_doctor: 2,
  approved: 3,
} satisfies Record<Exclude<PatientStatusRecord["processingStage"], "failed">, number>;

type PatientSubmissionProgressProps = Pick<PatientStatusRecord, "processingStage" | "submissionStatus"> & {
  copy: UploadPageCopy["patient"];
};

export function PatientSubmissionProgress({ processingStage, submissionStatus, copy }: PatientSubmissionProgressProps) {
  if (processingStage === "failed") {
    return <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-base text-amber-950">{copy.processingFailed}</p>;
  }
  const steps = [copy.stepReceived, copy.stepProcessing, copy.stepDoctorReview, copy.stepApproved];
  const currentStep = submissionStatus === "approved" ? steps.length - 1 : stepByStage[processingStage] ?? 0;

  // TODO: research team to confirm the expected wait time
  const waiting = currentStep < steps.length - 1;

  return (
    <>
      <ol role="list" className="mt-4 grid gap-2 text-base font-semibold sm:grid-cols-4">
        {steps.map((label, index) => {
          const current = index === currentStep;
          const complete = index < currentStep || !waiting;
          const colors = current ? "border-teal-800 bg-teal-800 text-white"
            : complete ? "border-teal-200 bg-teal-50 text-teal-900"
            : "border-slate-200 bg-slate-50 text-slate-700";

          return (
            <li key={label} aria-current={current ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${colors}`}>
              <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current">
                {complete ? <UiIcon name="approved" /> : index + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      {waiting && <p className="mt-3 text-base leading-relaxed text-slate-800">{copy.waitingNote}</p>}
    </>
  );
}
