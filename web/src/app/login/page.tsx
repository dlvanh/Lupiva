"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRole } from "@/data/mockData";
import { useLupiva } from "@/context/LupivaContext";
import { getLocalizedDemoUsers } from "@/data/translations";

type AuthMode = "login" | "register";

function resolveSafeRedirect(nextParam: string | null, role: UserRole): string {
  const defaultRoute = role === "patient" ? "/upload" : "/ocr";
  if (!nextParam) return defaultRoute;

  const isSafeRelative =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.startsWith("/\\");

  if (!isSafeRelative) return defaultRoute;

  const isSpecialistRoute =
    nextParam.startsWith("/ocr") ||
    nextParam.startsWith("/crf") ||
    nextParam.startsWith("/scores");

  if (role === "patient" && isSpecialistRoute) {
    return "/upload";
  }

  return nextParam;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    language,
    t,
    currentUser,
    loginWithCredentials,
    registerAccount,
    showToast,
  } = useLupiva();

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const localizedUsers = getLocalizedDemoUsers(language);
  const initialRole: UserRole = currentUser?.role || "specialist";

  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const activePersona = localizedUsers[selectedRole];

  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>(() =>
    isDemoMode ? localizedUsers[initialRole].email : ""
  );
  const [password, setPassword] = useState<string>(() =>
    isDemoMode ? localizedUsers[initialRole].passwordHint : ""
  );
  const [inviteCode, setInviteCode] = useState<string>("");
  const [consentChecked, setConsentChecked] = useState<boolean>(isDemoMode);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSwitchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    if (nextMode === "register") {
      setFullName("");
      setEmail("");
      setPassword("");
      setInviteCode("");
      setConsentChecked(false);
    } else if (isDemoMode) {
      const persona = localizedUsers[selectedRole];
      setEmail(persona.email);
      setPassword(persona.passwordHint);
      setConsentChecked(true);
    } else {
      setEmail("");
      setPassword("");
      setConsentChecked(false);
    }
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMessage(null);
    if (mode === "login" && isDemoMode) {
      setEmail(localizedUsers[role].email);
      setPassword(localizedUsers[role].passwordHint);
      setConsentChecked(true);
    } else if (role === "patient") {
      setInviteCode("");
    }
  };

  const handleAutofillDemo = () => {
    const persona = localizedUsers[selectedRole];
    setMode("login");
    setEmail(persona.email);
    setPassword(persona.passwordHint);
    setConsentChecked(true);
    setErrorMessage(null);
    showToast(
      t.toasts.autofillTitle,
      t.toasts.autofillDesc(persona.name),
      "navy"
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage(t.toasts.emailRequiredDesc);
      showToast(
        t.toasts.emailRequiredTitle,
        t.toasts.emailRequiredDesc,
        "amber"
      );
      return;
    }

    if (mode === "register" && fullName.trim().length < 2) {
      const msg =
        language === "vi"
          ? "Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự)."
          : "Please enter your full name (at least 2 characters).";
      setErrorMessage(msg);
      return;
    }

    if (
      (mode === "register" || selectedRole === "patient") &&
      !consentChecked
    ) {
      setErrorMessage(t.toasts.consentRequiredDesc);
      showToast(
        t.toasts.consentRequiredTitle,
        t.toasts.consentRequiredDesc,
        "amber"
      );
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === "login"
          ? await loginWithCredentials({
              email: email.trim(),
              password,
              selectedRole,
              consentChecked,
            })
          : await registerAccount({
              fullName: fullName.trim(),
              email: email.trim(),
              password,
              role: selectedRole,
              consentChecked,
              inviteCode:
                selectedRole === "specialist" ? inviteCode.trim() : undefined,
            });

      if (!result.ok || !result.user) {
        setErrorMessage(
          result.error ||
            (language === "vi"
              ? "Xác thực không thành công."
              : "Authentication failed.")
        );
        return;
      }

      const destination = resolveSafeRedirect(
        searchParams.get("next"),
        result.user.role
      );
      router.push(destination);
    } finally {
      setSubmitting(false);
    }
  };

  const roleDisplayLabel =
    selectedRole === "specialist"
      ? t.login.specialistTabTitle
      : t.login.patientTabTitle;

  const passwordHelperText =
    mode === "register"
      ? t.login.passwordHintRegister
      : isDemoMode
      ? t.login.passwordHint
      : t.login.passwordHintProduction;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 py-10 sm:py-14 focus:outline-none"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Auth Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-teal-800">
                  {t.login.roleAccessTag}
                </span>
                <h1
                  id="login-form-heading"
                  className="mt-1 text-2xl font-bold text-slate-900"
                >
                  {mode === "login" ? t.login.title : t.login.registerTitle}
                </h1>
              </div>

              {isDemoMode && mode === "login" && (
                <button
                  type="button"
                  id="login-btn-autofill"
                  onClick={handleAutofillDemo}
                  className="rounded-lg border border-teal-700/30 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 cursor-pointer"
                >
                  {t.login.autofillBtn}
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-slate-600">
              {mode === "register"
                ? t.login.registerSubtitle
                : isDemoMode
                  ? t.login.subtitle
                  : language === "vi" ? "Đăng nhập bằng tài khoản của bạn." : "Sign in with your account."}
            </p>

            {/* Sign In vs Create Account Switcher */}
            <div
              role="tablist"
              aria-label={t.login.roleAccessTag}
              className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              <button
                type="button"
                role="tab"
                id="login-mode-signin"
                aria-selected={mode === "login"}
                onClick={() => handleSwitchMode("login")}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.login.modeSignInTab}
              </button>
              <button
                type="button"
                role="tab"
                id="login-mode-register"
                aria-selected={mode === "register"}
                onClick={() => handleSwitchMode("register")}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.login.modeRegisterTab}
              </button>
            </div>

            {/* Role Switcher Tabs */}
            <div
              role="group"
              aria-label={t.login.roleAccessTag}
              className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-slate-100 p-1.5"
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
                <div className="flex items-center justify-between gap-1">
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
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold">
                    {t.login.patientTabTitle}
                  </span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-900">
                    {t.login.patientTabBadge}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {isDemoMode ? t.login.patientTabDesc : language === "vi"
                    ? "Gửi tài liệu & theo dõi trạng thái hồ sơ"
                    : "Submit documents & track their review status"}
                </p>
              </button>
            </div>

            {errorMessage && (
              <div
                id="login-error-alert"
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-900"
              >
                {errorMessage}
              </div>
            )}

            {/* Auth Form */}
            <form
              aria-labelledby="login-form-heading"
              onSubmit={handleSubmit}
              className="mt-5 space-y-4"
            >
              {mode === "register" && (
                <div>
                  <label
                    htmlFor="login-input-fullname"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {t.login.fullNameLabel}
                  </label>
                  <input
                    id="login-input-fullname"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-teal-700"
                    placeholder={t.login.fullNamePlaceholder}
                  />
                </div>
              )}

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
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                  placeholder="name@vinmec.com"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                    {passwordHelperText}
                  </span>
                </div>
                <input
                  id="login-input-password"
                  name="password"
                  type="password"
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  aria-describedby="login-password-hint"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                />
              </div>

              {mode === "register" && selectedRole === "specialist" && (
                <div>
                  <label
                    htmlFor="login-input-invite-code"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {t.login.inviteCodeLabel}
                  </label>
                  <input
                    id="login-input-invite-code"
                    name="inviteCode"
                    type="password"
                    required
                    autoComplete="off"
                    aria-describedby="login-invite-hint"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder={t.login.inviteCodePlaceholder}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700"
                  />
                  <p
                    id="login-invite-hint"
                    className="mt-1 text-[11px] text-slate-500"
                  >
                    {t.login.inviteCodeHint}
                  </p>
                </div>
              )}

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
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-teal-700 px-5 py-3 text-xs font-semibold text-white shadow-2xs transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {submitting
                    ? mode === "login"
                      ? t.login.signingInBtn
                      : t.login.creatingAccountBtn
                    : mode === "login"
                    ? t.login.submitBtn(
                        isDemoMode &&
                          email.trim().toLowerCase() ===
                            activePersona.email.toLowerCase()
                          ? activePersona.name
                          : roleDisplayLabel
                      )
                    : t.login.submitRegisterBtn(roleDisplayLabel)}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Active Persona / Encryption Vault & Permissions Map */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <span className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {mode === "login"
                      ? t.login.selectedProfileTitle
                      : t.login.registerProfileTitle}
                  </span>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                    {mode === "register"
                      ? fullName.trim() || roleDisplayLabel
                      : isDemoMode ? activePersona.name : roleDisplayLabel}
                  </h2>
                </div>
                {isDemoMode && (
                  <span className="rounded-md bg-teal-100 px-2.5 py-1 font-mono text-xs font-bold text-teal-900">
                    {activePersona.badgeText}
                  </span>
                )}
              </div>

              <dl className="mt-4 space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">{t.login.roleAffiliation}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {isDemoMode ? activePersona.title : roleDisplayLabel}
                  </dd>
                </div>
                {isDemoMode && <div>
                  <dt className="text-slate-500">{t.login.deptCohort}</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {activePersona.departmentOrRegistryId}
                  </dd>
                </div>}
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
                              Theo dõi trạng thái tài liệu đã gửi cho bác sĩ
                            </li>
                            <li>
                              Xem trạng thái phê duyệt của hồ sơ
                            </li>
                          </>
                        ) : (
                          <>
                            <li>
                              Upload smartphone photos or PDFs of external hospital lab reports
                            </li>
                            <li>
                              Track the status of documents sent to your doctor
                            </li>
                            <li>
                              View the review status of your submission
                            </li>
                          </>
                        )}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 rounded-xl border border-teal-200/80 bg-teal-50/50 p-3.5 text-xs">
                <p className="font-semibold text-teal-950">
                  {t.login.securityVaultTitle}
                </p>
                <p className="mt-1 leading-relaxed text-teal-900/90">
                  {t.login.securityVaultDesc}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
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
                        . Đăng nhập ở trên sẽ cập nhật phiên HttpOnly sang tài khoản mới.
                      </>
                    ) : (
                      <>
                        Logged in as{" "}
                        <strong className="text-teal-900">{currentUser.name}</strong>
                        . Signing in above will switch the HttpOnly session cookie to the selected account.
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 items-center justify-center py-16"
        >
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-xs font-medium text-slate-600 shadow-2xs">
            Loading authentication workspace...
          </div>
        </main>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
