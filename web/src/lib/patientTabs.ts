export type PatientTab = "submit" | "status";

/** Tab to show once the patient's submission list has loaded; a tab they chose stays. */
export function patientTabAfterLoad(chosen: PatientTab | null, submissionCount: number): PatientTab {
  return chosen ?? (submissionCount > 0 ? "status" : "submit");
}
