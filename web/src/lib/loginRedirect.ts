import type { UserRole } from "@/data/mockData";

const SPECIALIST_PREFIXES = ["/ocr", "/crf", "/scores", "/registry"];
const ADMIN_PREFIXES = ["/admin"];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/**
 * Where to go after signing in or registering. Patients and specialists land
 * on `/upload`, and admins land on `/admin`. A safe same-site `next` link
 * wins, except role-restricted pages for unauthorized roles.
 */
export function resolveSafeRedirect(
  nextParam: string | null,
  role: UserRole,
): string {
  const defaultRoute = role === "admin" ? "/admin" : "/upload";
  if (!nextParam) return defaultRoute;
  const isSafeRelative = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\");
  if (!isSafeRelative) return defaultRoute;
  if (role !== "specialist" && SPECIALIST_PREFIXES.some((prefix) => matchesPrefix(nextParam, prefix))) {
    return defaultRoute;
  }
  if (role !== "admin" && ADMIN_PREFIXES.some((prefix) => matchesPrefix(nextParam, prefix))) {
    return defaultRoute;
  }
  return nextParam;
}
