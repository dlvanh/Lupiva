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
  if (session.user.role !== "specialist") redirect("/upload");
  return <>{children}</>;
}

export function SpecialistOnly({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SpecialistGate nextPath={nextPath}>{children}</SpecialistGate>
    </Suspense>
  );
}
