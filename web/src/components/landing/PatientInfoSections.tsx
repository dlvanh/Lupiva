"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";

const actionClass = "mt-4 inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800";

export function PatientInfoSections({ showAbout = true }: { showAbout?: boolean } = {}) {
  const { currentUser, t } = useLupiva();
  const copy = t.patientPortal;
  const hasConsent = currentUser?.role === "patient" && currentUser.consentSigned;
  const consentHref = currentUser ? "/login?consent=1" : "/login?mode=register&consent=1";
  const benefits = [
    { title: copy.benefitImprovedTitle, body: copy.benefitImprovedBody },
    { title: copy.benefitAnonTitle, body: copy.benefitAnonBody },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      {showAbout && (
      <section aria-labelledby="patient-about-heading">
        <h2 id="patient-about-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          {copy.aboutTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{copy.aboutBody}</p>
      </section>
      )}

      <section aria-labelledby="patient-benefits-heading">
        <h2 id="patient-benefits-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          {copy.benefitsTitle}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {benefits.map(({ title, body }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
              <h3 className="font-semibold text-teal-800">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="patient-join-heading">
        <h2 id="patient-join-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          {copy.howTitle}
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2" role="list">
          <li className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
            <h3 className="font-semibold text-slate-900">1. {copy.step1Title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.step1Body}</p>
            {hasConsent ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-teal-900">
                <span aria-hidden="true">✓</span> {copy.step1Done}
              </p>
            ) : (
              <Link href={consentHref} className={actionClass}>{copy.step1Btn}</Link>
            )}
          </li>
          <li className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
            <h3 className="font-semibold text-slate-900">2. {copy.step2Title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.step2Body}</p>
            <Link href={currentUser ? "/upload" : "/login?next=/upload"} className={actionClass}>
              {copy.step2Btn}
            </Link>
          </li>
        </ol>
      </section>

      <section aria-labelledby="patient-contact-heading" className="border-t border-slate-200 pt-6">
        <h2 id="patient-contact-heading" className="text-xl font-bold text-slate-900 sm:text-2xl">
          {copy.contactTitle}
        </h2>
        <dl className="mt-3 grid w-fit grid-cols-[auto_auto] gap-x-3 gap-y-1 text-sm text-slate-600">
          <dt>{copy.contactLeadLabel}</dt>
          <dd>{copy.contactLead}</dd>
          <dt>{t.login.emailLabel}</dt>
          <dd>{copy.contactEmail}</dd>
        </dl>
      </section>
    </div>
  );
}
