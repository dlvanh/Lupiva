"use client";

import React from "react";
import { UiIcon } from "@/components/UiIcon";
import { useLupiva } from "@/context/LupivaContext";
import { SITE_CONTENT } from "@/components/landing/siteContent";

const headingClass = "text-xl font-bold text-slate-900 sm:text-2xl";

export function PatientInfoSections() {
  const { currentUser, t, language } = useLupiva();
  const copy = t.patientPortal;
  const extra = SITE_CONTENT[language].patients;
  const hasConsent = currentUser?.role === "patient" && currentUser.consentSigned;
  const benefits = [
    { title: copy.benefitImprovedTitle, body: copy.benefitImprovedBody },
    { title: copy.benefitPrivacyTitle, body: copy.benefitPrivacyBody },
    // TODO: research team to confirm how patients can talk with a specialist.
    { title: extra.doctorBenefitTitle, body: extra.doctorBenefitBody },
  ];
  const steps = [
    { title: copy.registerTitle, body: copy.registerBody },
    { title: copy.step1Title, body: copy.step1Body, done: hasConsent ? copy.step1Done : undefined },
    { title: copy.step2Title, body: copy.step2Body },
  ];

  return (
    <>
      <section aria-labelledby="patient-benefits-heading">
        <h2 id="patient-benefits-heading" className={headingClass}>{copy.benefitsTitle}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {benefits.map(({ title, body }) => (
            <article key={title} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-teal-900">{title}</h3>
              <p className="mt-1 text-base leading-relaxed text-slate-800">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="patient-join-heading">
        <h2 id="patient-join-heading" className={headingClass}>{copy.howTitle}</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3" role="list">
          {steps.map(({ title, body, done }, index) => (
            <li key={title} className="flex gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 sm:p-5">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-800 font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-base leading-relaxed text-slate-800">{body}</p>
                {done && (
                  <p className="mt-2 flex items-center gap-1 font-semibold text-teal-900">
                    <UiIcon name="approved" />{done}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-base leading-relaxed text-slate-900">
          {copy.appointmentNotice}
        </p>
      </section>

      <section aria-labelledby="patient-faq-heading">
        <h2 id="patient-faq-heading" className={headingClass}>{copy.faqTitle}</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-4 text-base leading-relaxed sm:grid-cols-2">
          {copy.faq.map(({ question, answer }) => (
            <div key={question}>
              <dt className="font-bold text-slate-900">{question}</dt>
              <dd className="mt-1 text-slate-800">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

export function PatientContactSection() {
  const { t } = useLupiva();
  const copy = t.patientPortal;

  return (
    <section aria-labelledby="patient-contact-heading" className="border-t border-slate-200 pt-5">
      <h2 id="patient-contact-heading" className={headingClass}>{copy.contactTitle}</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base leading-relaxed text-slate-800">
        <dt className="font-semibold">{t.login.emailLabel}</dt>
        <dd className="wrap-anywhere">{copy.contactEmail}</dd>
        <dt className="font-semibold">{copy.contactPhoneLabel}</dt>
        <dd className="wrap-anywhere">{copy.contactPhone}</dd>
      </dl>
    </section>
  );
}
