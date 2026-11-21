import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Server-side guard for doctor-only pages (CRF, OCR review, scores, registry).
 * Patients may only submit documents and follow their status on /upload.
 * The page renders only after the session check passes.
 */
export async function SpecialistGate({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (session.user.role === "admin") redirect("/admin");
  if (session.user.role !== "specialist") redirect("/upload");
  return <>{children}</>;
}

/**
 * The sample-data review pages (/ocr, /crf, /scores) are retired: the single
 * review step is /registry, reached from the submission list.
 */
async function RetiredGate({ nextPath }: { nextPath: string }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (session.user.role === "admin") redirect("/admin");
  redirect("/upload");
  return null;
}

export function RetiredPage({ nextPath }: { nextPath: string }) {
  return (
    <Suspense fallback={null}>
      <RetiredGate nextPath={nextPath} />
    </Suspense>
  );
}

export function SpecialistOnly({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SpecialistGate nextPath={nextPath}>{children}</SpecialistGate>
    </Suspense>
  );
}

/**
 * Server-side guard for system administration pages (/admin).
 * Non-admin accounts (patients and specialists) are redirected to /upload.
 */
export async function AdminGate({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (session.user.role !== "admin") redirect("/upload");
  return <>{children}</>;
}

export function AdminOnly({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminGate nextPath={nextPath}>{children}</AdminGate>
    </Suspense>
  );
}
