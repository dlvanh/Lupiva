import type { UserRole } from "@/data/mockData";

const SPECIALIST_PREFIXES = ["/ocr", "/crf", "/scores", "/registry"];

/**
 * Where to go after signing in or registering. Both patients and doctors land
 * on `/upload` (the patient submission portal or the doctor dashboard). A safe
 * same-site `next` link wins, except doctor pages for patients.
 */
export function resolveSafeRedirect(
  nextParam: string | null,
  role: UserRole,
): string {
  const defaultRoute = "/upload";
  if (!nextParam) return defaultRoute;
  const isSafeRelative = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\");
  if (!isSafeRelative) return defaultRoute;
  if (role === "patient" && SPECIALIST_PREFIXES.some((prefix) => nextParam.startsWith(prefix))) return defaultRoute;
  return nextParam;
}
