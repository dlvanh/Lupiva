"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import { SITE_CONTENT } from "@/components/landing/siteContent";
import { PatientContactSection, PatientInfoSections } from "@/components/landing/PatientInfoSections";
import { useStartAction } from "@/components/landing/RegistryOverview";

const h2 = "text-xl font-bold text-slate-900 sm:text-2xl";
const text = "text-base leading-relaxed text-slate-800";
const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";

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

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-4 inline-flex min-h-11 items-center font-semibold text-teal-800 underline-offset-4 hover:underline">
      {label} →
    </Link>
  );
}

/** Home page body below the hero: aim, how it works, an invitation for patients. */
export function HomeSections() {
  const { language } = useLupiva();
  const home = SITE_CONTENT[language].home;
  return (
    <div className="mx-auto max-w-5xl space-y-9 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <section aria-labelledby="home-aim-heading">
        <h2 id="home-aim-heading" className={h2}>{home.aimTitle}</h2>
        <p className={`mt-3 ${text}`}>{home.aimBody}</p>
        <MoreLink href="/gioi-thieu" label={home.aimMore} />
      </section>
      <section aria-labelledby="home-how-heading">
        <h2 id="home-how-heading" className={h2}>{home.howTitle}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {home.how.map((step, index) => (
            <li key={step.title} className={card}>
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-teal-800 font-bold text-white">{index + 1}</span>
              <h3 className="mt-2 font-bold text-slate-900">{step.title}</h3>
              <p className={`mt-1 ${text}`}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="home-patients-heading" className="rounded-xl border border-teal-200 bg-teal-50 p-5 sm:p-6">
        <h2 id="home-patients-heading" className={h2}>{home.patientsTitle}</h2>
        <p className={`mt-2 ${text}`}>{home.patientsBody}</p>
        <MoreLink href="/benh-nhan" label={home.patientsMore} />
      </section>
    </div>
  );
}

export function AboutContent() {
  const { language } = useLupiva();
  const about = SITE_CONTENT[language].about;
  return (
    <PageShell title={about.title} intro={about.intro}>
      <section aria-labelledby="about-background-heading">
        <h2 id="about-background-heading" className={h2}>{about.backgroundTitle}</h2>
        <div className={`mt-3 space-y-3 ${text}`}>{about.background.map((p) => <p key={p}>{p}</p>)}</div>
      </section>
      <section aria-labelledby="about-aim-heading">
        <h2 id="about-aim-heading" className={h2}>{about.aimTitle}</h2>
        <p className={`mt-3 ${text}`}>{about.aimBody}</p>
        <Bullets items={about.aims} />
      </section>
      <section aria-labelledby="about-approach-heading">
        <h2 id="about-approach-heading" className={h2}>{about.approachTitle}</h2>
        <p className={`mt-3 ${text}`}>{about.approachBody}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {about.approach.map((tier) => (
            <article key={tier.title} className={card}>
              <h3 className="text-lg font-semibold text-teal-900">{tier.title}</h3>
              <p className={`mt-1 ${text}`}>{tier.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="about-future-heading">
        <h2 id="about-future-heading" className={h2}>{about.futureTitle}</h2>
        <p className={`mt-3 ${text}`}>{about.futureBody}</p>
        <Bullets items={about.future} />
      </section>
      <section aria-labelledby="about-team-heading">
        <h2 id="about-team-heading" className={h2}>{about.teamTitle}</h2>
        <Bullets items={about.team} />
      </section>
    </PageShell>
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
