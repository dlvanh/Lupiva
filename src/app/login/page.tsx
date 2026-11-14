"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";
import { getLocalizedDemoUsers } from "@/data/translations";

export default function LoginPage() {
  const router = useRouter();
  const { language, t, currentUser, loginAsRole, showToast } = useLupiva();

  const localizedUsers = getLocalizedDemoUsers(language);

  const [selectedRole, setSelectedRole] = useState<UserRole>(
    currentUser?.role || "specialist"
  );
  const activePersona = localizedUsers[selectedRole];

  const [email, setEmail] = useState<string>(activePersona.email);
  const [password, setPassword] = useState<string>(activePersona.passwordHint);
  const [consentChecked, setConsentChecked] = useState<boolean>(true);

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setEmail(localizedUsers[role].email);
    setPassword(localizedUsers[role].passwordHint);
    setConsentChecked(true);
  };

  const handleAutofillDemo = () => {
    const persona = localizedUsers[selectedRole];
    setEmail(persona.email);
    setPassword(persona.passwordHint);
    setConsentChecked(true);
    showToast(
      t.toasts.autofillTitle,
      t.toasts.autofillDesc(persona.name),
      "navy"
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast(
        t.toasts.emailRequiredTitle,
        t.toasts.emailRequiredDesc,
        "amber"
      );
      return;
    }
    if (selectedRole === "patient" && !consentChecked) {
      showToast(
        t.toasts.consentRequiredTitle,
        t.toasts.consentRequiredDesc,
        "amber"
      );
      return;
    }

    loginAsRole(selectedRole, email.trim());
    router.push(selectedRole === "patient" ? "/upload" : "/ocr");
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 py-10 sm:py-14 focus:outline-none">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Login Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
                  {t.login.roleAccessTag}
                </span>
                <h1 id="login-form-heading" className="mt-1 text-2xl font-bold text-slate-900">
                  {t.login.title}
                </h1>
              </div>
              <button
                type="button"
                id="login-btn-autofill"
                onClick={handleAutofillDemo}
                className="rounded-lg border border-teal-700/30 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 cursor-pointer"
              >
                {t.login.autofillBtn}
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-600">
              {t.login.subtitle}
            </p>

            {/* Role Switcher Tabs */}
            <div
              role="group"
              aria-label={t.login.roleAccessTag}
              className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-slate-100 p-1.5"
            >
              <button
                type="button"
                id="login-tab-specialist"
                aria-pressed={selectedRole === "specialist"}
                onClick={() => handleSelectRole("specialist")}
                className={`rounded-md px-3 py-2.5 text-left transition cursor-pointer ${
                  selectedRole === "specialist"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {t.login.specialistTabTitle}
                  </span>
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-900">
                    {t.login.specialistTabBadge}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {t.login.specialistTabDesc}
                </p>
              </button>

              <button
                type="button"
                id="login-tab-patient"
                aria-pressed={selectedRole === "patient"}
                onClick={() => handleSelectRole("patient")}
                className={`rounded-md px-3 py-2.5 text-left transition cursor-pointer ${
                  selectedRole === "patient"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {t.login.patientTabTitle}
                  </span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-900">
                    {t.login.patientTabBadge}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {t.login.patientTabDesc}
                </p>
              </button>
            </div>

            {/* Login Form */}
            <form
              aria-labelledby="login-form-heading"
              onSubmit={handleSubmit}
              className="mt-6 space-y-4"
            >
              <div>
                <label
                  htmlFor="login-input-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {t.login.emailLabel}
                </label>
                <input
                  id="login-input-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                  placeholder="name@vinmec.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-input-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {t.login.passwordLabel}
                  </label>
                  <span
                    id="login-password-hint"
                    className="font-mono text-[11px] text-slate-500"
                  >
                    {t.login.passwordHint}
                  </span>
                </div>
                <input
                  id="login-input-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  aria-describedby="login-password-hint"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                />
              </div>

              {/* Informed Consent / Governance Checkbox */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <input
                    id="login-checkbox-consent"
                    name="consent"
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-700 cursor-pointer"
                  />
                  <label
                    htmlFor="login-checkbox-consent"
                    className="text-xs leading-relaxed text-slate-600 cursor-pointer"
                  >
                    {selectedRole === "specialist"
                      ? t.login.specialistConsent
                      : t.login.patientConsent}
                  </label>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="submit"
                  id="login-btn-submit"
                  className="flex-1 rounded-lg bg-teal-700 px-5 py-3 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800 cursor-pointer"
                >
                  {t.login.submitBtn(activePersona.name)}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Active Persona Details & Permissions Map */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <span className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {t.login.selectedProfileTitle}
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
                  <dt className="text-slate-500">{t.login.roleAffiliation}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {activePersona.title}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t.login.deptCohort}</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {activePersona.departmentOrRegistryId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t.login.whatUnlocks}</dt>
                  <dd className="mt-1.5 space-y-1.5 text-slate-600">
                    {selectedRole === "specialist" ? (
                      <ul className="list-disc space-y-1 pl-4">
                        {language === "vi" ? (
                          <>
                            <li>
                              Phê duyệt các chỉ số OCR có độ tin cậy thấp (&lt;85%) như{" "}
                              <code className="font-mono text-slate-800">
                                Bổ thể C3
                              </code>{" "}
                              và{" "}
                              <code className="font-mono text-slate-800">UPCR</code>
                            </li>
                            <li>
                              Chỉnh sửa trực tiếp giá trị số và đơn vị tham chiếu của chỉ số
                            </li>
                            <li>
                              Lưu trữ hồ sơ đã xác thực vào cơ sở dữ liệu e-CRF SLE dưới chữ ký Bác sĩ
                            </li>
                          </>
                        ) : (
                          <>
                            <li>
                              Approve low-confidence (&lt;85%) OCR reads such as{" "}
                              <code className="font-mono text-slate-800">
                                Complement C3
                              </code>{" "}
                              and{" "}
                              <code className="font-mono text-slate-800">UPCR</code>
                            </li>
                            <li>
                              Edit biomarker numerical values and reference units inline
                            </li>
                            <li>
                              Commit verified records to the SLE e-CRF database under specialist signature
                            </li>
                          </>
                        )}
                      </ul>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4">
                        {language === "vi" ? (
                          <>
                            <li>
                              Tải lên ảnh chụp hoặc tệp PDF phiếu xét nghiệm từ các bệnh viện ngoài
                            </li>
                            <li>
                              Xem trước các chỉ số SLE trích xuất trước khi chuyển tới Bác sĩ Vinmec
                            </li>
                            <li>
                              Theo dõi điều kiện nhận voucher tư vấn khám chuyên khoa sau khi nộp
                            </li>
                          </>
                        ) : (
                          <>
                            <li>
                              Upload smartphone photos or PDFs of external hospital lab reports
                            </li>
                            <li>
                              Pre-screen extracted SLE values before routing to Vinmec specialists
                            </li>
                            <li>
                              Track consultation voucher eligibility upon registry submission
                            </li>
                          </>
                        )}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <p className="font-semibold text-slate-800">
                {t.login.activeSessionTitle}
              </p>
              <p className="mt-1 text-slate-600">
                {currentUser ? (
                  <>
                    {language === "vi" ? (
                      <>
                        Đang đăng nhập với tên{" "}
                        <strong className="text-teal-900">{currentUser.name}</strong>
                        . Đăng nhập ở trên sẽ chuyển đổi phiên sang vai trò tương ứng.
                      </>
                    ) : (
                      <>
                        Logged in as{" "}
                        <strong className="text-teal-900">{currentUser.name}</strong>
                        . Signing in above will switch the active session to the selected role.
                      </>
                    )}
                  </>
                ) : (
                  t.login.guestNotice
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
