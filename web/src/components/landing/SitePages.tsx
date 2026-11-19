"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import { SITE_CONTENT, SITE_NAME } from "@/components/landing/siteContent";
import { PatientContactSection, PatientInfoSections } from "@/components/landing/PatientInfoSections";
import { useStartAction } from "@/components/landing/RegistryOverview";

const h2 = "text-xl font-bold text-slate-900 sm:text-2xl";
const sectionHeading = "mt-2 text-2xl font-bold text-slate-900 sm:text-3xl";
const kicker = "text-xs font-bold uppercase tracking-wider text-teal-800";
const text = "text-base leading-relaxed text-slate-800";

function PageShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      <section className="bg-teal-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-teal-50">{intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-9 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</div>
    </main>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className={`mt-3 list-disc space-y-2 pl-5 ${text}`}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

const WORKFLOW_ICONS = [
  // 1. Patient upload
  <svg key="upload" aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>,
  // 2. AI & OCR
  <svg key="ai" aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" />
  </svg>,
  // 3. Specialist validation
  <svg key="doctor" aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>,
  // 4. Research analytics
  <svg key="analytics" aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>,
];

function FlowConnector() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center text-teal-700">
      <svg className="hidden h-6 w-6 lg:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
      <svg className="h-6 w-6 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" />
        <path d="m6 13 6 6 6-6" />
      </svg>
    </div>
  );
}

/** Merged Home & About Registry body styled after commit f8b75bee. */
export function HomeSections() {
  const { language } = useLupiva();
  const content = SITE_CONTENT[language];
  const home = content.home;
  const about = content.about;

  return (
    <>
      {/* Section 1: Bối cảnh */}
      <section
        id="boi-canh"
        aria-labelledby="heading-background"
        className="scroll-mt-16 border-b border-slate-200 bg-slate-50/70 py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className={kicker}>{about.backgroundKicker}</p>
            <h2 id="heading-background" className={sectionHeading}>
              {about.backgroundTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">{home.aimBody}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {about.backgroundCards.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-7"
              >
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2.5 text-sm leading-7 text-slate-600 sm:text-[15px]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Mục tiêu và hướng nghiên cứu */}
      <section
        id="muc-tieu"
        aria-labelledby="heading-aims"
        className="scroll-mt-16 border-b border-slate-200 bg-white py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className={kicker}>{about.aimKicker}</p>
            <h2 id="heading-aims" className={sectionHeading}>
              {about.aimTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{about.aimBody}</p>
          </div>

          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {about.aims.map((aim, idx) => (
              <li
                key={aim}
                className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-700 sm:text-[15px]">{aim}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Section 3: Cách Registry vận hành (Slide-style Process Flowchart) */}
      <section
        id="van-hanh"
        aria-labelledby="heading-workflow"
        className="scroll-mt-16 border-b border-slate-200 bg-slate-50/70 py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <p className={kicker}>{about.approachKicker}</p>
              <h2 id="heading-workflow" className={sectionHeading}>
                {about.approachTitle}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">{about.approachSubtitle}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-900">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-teal-700" />
              {about.approachBadge}
            </span>
          </div>

          <div
            role="list"
            aria-label={about.approachTitle}
            className="mt-8 flex flex-col items-stretch gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch"
          >
            {about.workflowSteps.map((step, index) => (
              <React.Fragment key={step.title}>
                <div
                  role="listitem"
                  className="flex flex-col rounded-2xl border-2 border-teal-200/80 bg-white p-5 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-bold text-white">
                      {step.stepLabel}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-800">
                      {WORKFLOW_ICONS[index % WORKFLOW_ICONS.length]}
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-base font-bold text-slate-900">{step.title}</h3>
                  <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600 sm:text-sm">
                    {step.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
                {index < about.workflowSteps.length - 1 && <FlowConnector />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Hướng phát triển */}
      <section
        id="huong-phat-trien"
        aria-labelledby="heading-future"
        className="scroll-mt-16 border-b border-slate-200 bg-white py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className={kicker}>{about.futureKicker}</p>
            <h2 id="heading-future" className={sectionHeading}>
              {about.futureTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{about.futureBody}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {about.future.map((item, idx) => (
              <article
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-2xs"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-sm font-bold text-teal-800">
                  {idx + 1}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 sm:text-lg">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:text-[15px]">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Thành viên (Steering Committee + Ảnh nhóm) & Đơn vị thực hiện */}
      <section
        id="thanh-vien"
        aria-labelledby="heading-members"
        className="scroll-mt-16 bg-slate-50/70 py-14 sm:py-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className={kicker}>{about.membersKicker}</p>
            <h2 id="heading-members" className={sectionHeading}>
              {about.membersSectionTitle}
            </h2>
          </div>

          {/* CURE-style 2-column layout: Members + Group Photo */}
          <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h3 className="text-lg font-bold text-slate-900">{about.committeeTitle}</h3>
              <ul className="mt-4 space-y-3" role="list">
                {about.committee.map((member) => (
                  <li
                    key={member.name}
                    className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-sm font-bold text-teal-800"
                    >
                      {member.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900">{member.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-teal-800">{member.role}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{member.affiliation}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5">
              <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                {about.groupPhotoSrc ? (
                  <Image
                    src={about.groupPhotoSrc}
                    alt={about.groupPhotoAlt}
                    width={800}
                    height={600}
                    className="aspect-[4/3] w-full rounded-xl object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={about.groupPhotoAlt}
                    className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-6 text-center"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-14 w-14 text-teal-700/80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p className="mt-3 text-sm font-semibold text-teal-950">{about.groupPhotoCaption}</p>
                    <p className="mt-1 text-xs text-slate-500">{about.groupPhotoPlaceholderHint}</p>
                  </div>
                )}
                <figcaption className="mt-3 text-center text-xs font-medium text-slate-600">
                  {about.groupPhotoCaption}
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Implementing Units with full Vietnamese names */}
          <div className="mt-12">
            <h3 className="text-lg font-bold text-slate-900">{about.teamTitle}</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {about.units.map((unit) => (
                <article
                  key={unit.name}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                >
                  <h4 className="text-base font-bold text-teal-900">{unit.name}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{unit.parent}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p className="font-semibold text-slate-800">{SITE_NAME}</p>
          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-600">
            <Link href="/benh-nhan" className="hover:text-teal-800">
              {home.patientsBtn}
            </Link>
            <Link href="/lien-he" className="hover:text-teal-800">
              {content.contact.title}
            </Link>
            <Link href="/login?role=specialist" className="hover:text-teal-800">
              {home.doctorBtn}
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}

export function PatientsContent() {
  const { language } = useLupiva();
  const patients = SITE_CONTENT[language].patients;
  const action = useStartAction();
  return (
    <PageShell title={patients.title} intro={patients.intro}>
      <section aria-labelledby="patients-lupus-heading">
        <h2 id="patients-lupus-heading" className={h2}>{patients.lupusTitle}</h2>
        <div className={`mt-3 space-y-3 ${text}`}>{patients.lupus.map((p) => <p key={p}>{p}</p>)}</div>
      </section>
      <section aria-labelledby="patients-why-heading">
        <h2 id="patients-why-heading" className={h2}>{patients.whyTitle}</h2>
        <Bullets items={patients.why} />
      </section>
      <PatientInfoSections />
      <section aria-labelledby="patients-contribute-heading">
        <h2 id="patients-contribute-heading" className={h2}>{patients.contributeTitle}</h2>
        <p className={`mt-3 ${text}`}>{patients.contributeBody}</p>
        <Bullets items={patients.contribute} />
        <Link href={action.href} className="mt-5 inline-flex min-h-12 items-center rounded-lg bg-teal-800 px-5 py-3 text-base font-semibold text-white hover:bg-teal-900">
          {action.label}
        </Link>
      </section>
    </PageShell>
  );
}

export function ContactContent() {
  const { language } = useLupiva();
  const contact = SITE_CONTENT[language].contact;
  return (
    <PageShell title={contact.title} intro={contact.intro}>
      <section aria-labelledby="contact-lead-heading">
        <h2 id="contact-lead-heading" className={h2}>{contact.leadTitle}</h2>
        <p className={`mt-3 ${text}`}>{contact.lead}</p>
      </section>
      <PatientContactSection />
      <section aria-labelledby="contact-units-heading">
        <h2 id="contact-units-heading" className={h2}>{contact.unitsTitle}</h2>
        <Bullets items={contact.units} />
      </section>
      <section aria-labelledby="contact-collab-heading">
        <h2 id="contact-collab-heading" className={h2}>{contact.collaborateTitle}</h2>
        <p className={`mt-3 ${text}`}>{contact.collaborateBody}</p>
      </section>
    </PageShell>
  );
}
