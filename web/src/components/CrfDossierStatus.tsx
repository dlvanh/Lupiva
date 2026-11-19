import Link from "next/link";
import { TRANSLATIONS, type Language } from "@/data/translations";

export function ViewCrfLink({ caseId, language, className, stopPropagation }: {
  caseId: string;
  language: Language;
  className: string;
  stopPropagation?: boolean;
}) {
  return (
    <Link
      href={`/crf-form?case=${encodeURIComponent(caseId)}`}
      prefetch={false}
      className={className}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      {TRANSLATIONS[language].doctor.viewCrfForm}
    </Link>
  );
}

export function DossierApprovalNotice({ caseId, language }: { caseId: string; language: Language }) {
  return (
    <p role="status" className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
      {TRANSLATIONS[language].doctor.dossierApprovedNotice}{" "}
      <ViewCrfLink caseId={caseId} language={language} className="font-semibold underline" />
    </p>
  );
}

export function CrfFormTitle({ language, webApproved }: { language: Language; webApproved: boolean }) {
  const copy = TRANSLATIONS[language].doctor;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-xl font-semibold text-slate-800">{copy.crfFormBtn}</h1>
      {webApproved && (
        <span className="rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-900">
          {copy.dossierApprovedBtn}
        </span>
      )}
    </div>
  );
}
