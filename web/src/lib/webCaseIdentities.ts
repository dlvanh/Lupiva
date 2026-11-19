import { useEffect, useState } from "react";
import { getSubmissionStatus, type SleCrfPatientRecord } from "@/data/crfData";
import { TRANSLATIONS, type Language } from "@/data/translations";
import type { CrfView } from "@/lib/crfApproval";
import { dashboardPatient } from "@/lib/doctorDashboard";
import type { SubmissionItemDTO } from "@/lib/submissionsService";

export type IntakeJob = { job_id?: string; case_id?: string | null };

export function mergeWebCaseIdentities(
  caseByIntake: ReadonlyMap<string | undefined, string | null | undefined>,
  items: readonly SubmissionItemDTO[],
  openingIntake: string | null,
  previous?: ReadonlyMap<string, SubmissionItemDTO>,
): Map<string, SubmissionItemDTO> {
  const identities = new Map(previous);
  for (const item of items) {
    if (!item.pipelineIntakeId) continue;
    const caseId = caseByIntake.get(item.pipelineIntakeId);
    if (!caseId) continue;
    if (item.pipelineIntakeId === openingIntake || identities.get(caseId)?.pipelineIntakeId !== openingIntake) {
      identities.set(caseId, item);
    }
  }
  return identities;
}

export function preserveWebCaseApprovals(
  current: ReadonlyMap<string, SubmissionItemDTO>,
  fetched: ReadonlyMap<string, SubmissionItemDTO>,
): Map<string, SubmissionItemDTO> {
  const identities = new Map(fetched);
  for (const [id, item] of current) {
    if (fetched.get(id)?.dbSubmissionId === item.dbSubmissionId && getSubmissionStatus(item.record) === "approved") {
      identities.set(id, item);
    }
  }
  return identities;
}

export function useWebCaseIdentities(
  intakeJobs: readonly IntakeJob[],
  onError: (message: string) => void,
  openingIntake: string | null = null,
) {
  const [identityByCase, setIdentityByCase] = useState(() => new Map<string, SubmissionItemDTO>());
  useEffect(() => {
    if (!intakeJobs.length) return;
    const controller = new AbortController();
    const caseByIntake = new Map(intakeJobs.map(({ job_id, case_id }) => [job_id, case_id]));
    const unmatched = new Set(intakeJobs.filter((job) => job.case_id).map((job) => job.job_id));

    async function loadIdentities() {
      let identities = new Map<string, SubmissionItemDTO>();
      for (let page = 1; page <= 1000 && !controller.signal.aborted; page++) {
        // Date order stays stable as dossiers are opened or approved.
        const response = await fetch(`/api/submissions?sort=oldest&pageSize=50&page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = (await response.json()) as { items: SubmissionItemDTO[]; pagination: { hasNextPage: boolean } };
        if (controller.signal.aborted) return;
        identities = mergeWebCaseIdentities(caseByIntake, result.items, openingIntake, identities);
        const pageIdentities = identities;
        setIdentityByCase((current) => preserveWebCaseApprovals(current, pageIdentities));
        for (const item of result.items) {
          if (item.pipelineIntakeId && caseByIntake.get(item.pipelineIntakeId)) unmatched.delete(item.pipelineIntakeId);
        }
        if (!result.pagination.hasNextPage || !unmatched.size) break;
      }
    }

    void loadIdentities().catch((reason: Error) => {
      if (!controller.signal.aborted) onError(reason.message);
    });
    return () => controller.abort();
  }, [intakeJobs, onError, openingIntake]);

  return { identityByCase, setIdentityByCase };
}

export function webCaseLabel(record: SleCrfPatientRecord, view: CrfView | null, language: Language): string {
  const { name, demographics } = dashboardPatient(record.patientName, view, language === "vi", record);
  return `${record.studyId} · ${name || demographics || TRANSLATIONS[language].doctor.dashboard.noName}`;
}
