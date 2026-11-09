"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEMO_USERS, UserRole } from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";

export default function LoginPage() {
  const router = useRouter();
  const { currentUser, loginAsRole, showToast } = useLupiva();

  const [selectedRole, setSelectedRole] = useState<UserRole>(
    currentUser?.role || "specialist"
  );
  const activePersona = DEMO_USERS[selectedRole];

  const [email, setEmail] = useState<string>(activePersona.email);
  const [password, setPassword] = useState<string>(activePersona.passwordHint);
  const [consentChecked, setConsentChecked] = useState<boolean>(true);

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setEmail(DEMO_USERS[role].email);
    setPassword(DEMO_USERS[role].passwordHint);
    setConsentChecked(true);
  };

  const handleAutofillDemo = () => {
    const persona = DEMO_USERS[selectedRole];
    setEmail(persona.email);
    setPassword(persona.passwordHint);
    setConsentChecked(true);
    showToast(
      "Demo Credentials Autofilled",
      `Loaded mock profile for ${persona.name}.`,
      "navy"
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast(
        "Email Required",
        "Please enter an email or click Autofill Demo Credentials.",
        "amber"
      );
      return;
    }
    if (selectedRole === "patient" && !consentChecked) {
      showToast(
        "Informed Consent Required",
        "Patients must acknowledge e-CRF registry data de-identification consent.",
        "amber"
      );
      return;
    }

    loginAsRole(selectedRole, email.trim());
    router.push("/ocr");
  };

  return (
    <main className="flex-1 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Login Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
                  Role-Based Clinical Access
                </span>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                  Sign in to Lupiva Platform
                </h1>
              </div>
              <button
                type="button"
                id="login-btn-autofill"
                onClick={handleAutofillDemo}
                className="rounded-lg border border-teal-700/30 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 cursor-pointer"
              >
                Autofill Demo Credentials
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-600">
              Select a persona below to test the workflow as either a{" "}
              <strong>Vinmec Clinical Immunology Specialist</strong> (HITL
              verifier) or an <strong>SLE Cohort Patient</strong>.
            </p>

            {/* Role Switcher Tabs */}
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
              <button
                type="button"
                id="login-tab-specialist"
                onClick={() => handleSelectRole("specialist")}
                className={`rounded-lg px-3 py-2.5 text-left transition cursor-pointer ${
                  selectedRole === "specialist"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Clinical Specialist</span>
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-900">
                    HITL Doctor
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Verify OCR labs &amp; commit e-CRF
                </p>
              </button>

              <button
                type="button"
                id="login-tab-patient"
                onClick={() => handleSelectRole("patient")}
                className={`rounded-lg px-3 py-2.5 text-left transition cursor-pointer ${
                  selectedRole === "patient"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">SLE Patient Portal</span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-900">
                    Companion
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Upload lab scans &amp; earn vouchers
                </p>
              </button>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-input-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Institutional or Patient Email
                </label>
                <input
                  id="login-input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  placeholder="name@vinmec.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-input-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Demo Passkey / PIN
                  </label>
                  <span className="font-mono text-[11px] text-slate-400">
                    Pre-populated for evaluation
                  </span>
                </div>
                <input
                  id="login-input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              {/* Informed Consent / Governance Checkbox */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    id="login-checkbox-consent"
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span className="text-xs leading-relaxed text-slate-600">
                    {selectedRole === "specialist" ? (
                      <>
                        I confirm{" "}
                        <strong className="text-slate-800">
                          Physician-in-the-Loop (HITL)
                        </strong>{" "}
                        supervision responsibility: all flagged OCR biomarkers
                        (&lt;85% confidence) will be reviewed against the source
                        scan before e-CRF commit.
                      </>
                    ) : (
                      <>
                        I consent to contribute de-identified SLE lab values to
                        the{" "}
                        <strong className="text-slate-800">
                          Vinmec Clinical Immunology Registry
                        </strong>{" "}
                        in exchange for specialist consultation voucher
                        incentives.
                      </>
                    )}
                  </span>
                </label>
              </div>

              <div className="pt-2 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="submit"
                  id="login-btn-submit"
                  className="flex-1 rounded-xl bg-teal-700 px-5 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 cursor-pointer"
                >
                  Sign In as {activePersona.name} &amp; Open OCR →
                </button>
                <Link
                  href="/ocr"
                  id="login-btn-skip-guest"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Continue to OCR Without Changing Session
                </Link>
              </div>
            </form>
          </div>

          {/* Right Column: Active Persona Details & Permissions Map */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <span className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    Selected Mock Profile
                  </span>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                    {activePersona.name}
                  </h2>
                </div>
                <span className="rounded-md bg-teal-100 px-2.5 py-1 font-mono text-xs font-bold text-teal-900">
                  {activePersona.badgeText}
                </span>
              </div>

              <dl className="mt-4 space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Role &amp; Affiliation</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {activePersona.title}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Department / Cohort ID</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {activePersona.departmentOrRegistryId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">What This Role Unlocks in OCR</dt>
                  <dd className="mt-1.5 space-y-1.5 text-slate-600">
                    {selectedRole === "specialist" ? (
                      <ul className="list-disc space-y-1 pl-4">
                        <li>
                          Approve low-confidence (&lt;85%) OCR reads such as{" "}
                          <code className="font-mono text-slate-800">
                            Complement C3
                          </code>{" "}
                          and{" "}
                          <code className="font-mono text-slate-800">UPCR</code>
                        </li>
                        <li>
                          Edit biomarker numerical values and reference units
                          inline
                        </li>
                        <li>
                          Commit verified records to the SLE e-CRF database
                          under specialist signature
                        </li>
                      </ul>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4">
                        <li>
                          Upload smartphone photos or PDFs of external hospital
                          lab reports
                        </li>
                        <li>
                          Pre-screen extracted SLE values before routing to
                          Vinmec specialists
                        </li>
                        <li>
                          Track consultation voucher eligibility upon registry
                          submission
                        </li>
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <p className="font-semibold text-slate-800">
                Currently Active Session
              </p>
              <p className="mt-1 text-slate-600">
                {currentUser ? (
                  <>
                    Logged in as{" "}
                    <strong className="text-teal-900">{currentUser.name}</strong>
                    . Signing in above will switch the active session to the
                    selected role.
                  </>
                ) : (
                  <>No user currently signed in (Guest Evaluator mode).</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
