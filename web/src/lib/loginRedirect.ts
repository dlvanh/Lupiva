import type { UserRole } from "@/data/mockData";

const SPECIALIST_PREFIXES = ["/ocr", "/crf", "/scores", "/registry"];

/**
 * Where to go after signing in or registering. Patients land on the home page
 * after signing in and on the submission page after registering; doctors land
 * on the dashboard. A safe same-site `next` link wins, except doctor pages for
 * patients.
 */
export function resolveSafeRedirect(
  nextParam: string | null,
  role: UserRole,
  mode: "login" | "register",
): string {
  const defaultRoute = role === "patient" && mode === "login" ? "/" : "/upload";
  if (!nextParam) return defaultRoute;
  const isSafeRelative = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\");
  if (!isSafeRelative) return defaultRoute;
  if (role === "patient" && SPECIALIST_PREFIXES.some((prefix) => nextParam.startsWith(prefix))) return defaultRoute;
  return nextParam;
}
