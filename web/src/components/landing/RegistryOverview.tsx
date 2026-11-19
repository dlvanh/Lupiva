"use client";

import React from "react";
import Link from "next/link";
import { useLupiva } from "@/context/LupivaContext";
import { SITE_CONTENT, SITE_NAME } from "@/components/landing/siteContent";

/** The start action for the current visitor: register, sign the consent, or submit. */
export function useStartAction() {
  const { currentUser, t } = useLupiva();
  const copy = t.patientPortal;
  return currentUser?.role === "patient"
    ? currentUser.consentSigned
      ? { href: "/upload", label: copy.submitMenuLabel }
      : { href: "/login?consent=1", label: copy.step1Btn }
    : { href: "/login?mode=register", label: copy.startBtn };
}

export function RegistryOverview() {
  const { language } = useLupiva();
  const home = SITE_CONTENT[language].home;
  const action = useStartAction();

  return (
    <section className="bg-teal-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-teal-200 uppercase">{home.tagline}</p>
        <h1 className="mt-2 text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">{SITE_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-teal-50">{home.intro}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={action.href} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-400 px-5 py-3 text-base font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {action.label}
          </Link>
          <Link href="/benh-nhan" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-teal-200 px-5 py-3 text-base font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {home.patientsBtn}
          </Link>
        </div>
      </div>
    </section>
  );
}
