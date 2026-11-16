import type { ReactNode } from "react";
import { SpecialistOnly } from "@/lib/pageGuards";

export default function SpecialistOnlyLayout({ children }: { children: ReactNode }) {
  return <SpecialistOnly nextPath="/crf-form">{children}</SpecialistOnly>;
}
