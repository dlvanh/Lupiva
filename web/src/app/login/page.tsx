"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLupiva } from "@/context/LupivaContext";
import { resolveSafeRedirect } from "@/lib/loginRedirect";
import { isValidVietnamPhone } from "@/lib/phone";

type AuthMode = "login" | "register";

function buildAuthModeHref(mode: AuthMode, nextParam: string | null): string {
  const params = new URLSearchParams();
  if (mode === "register") {
    params.set("mode", "register");
  }
  if (nextParam) {
    params.set("next", nextParam);
  }
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

function LoginFormContent({
  initialMode,
  nextParam,
}: {
  initialMode: AuthMode;
  nextParam: string | null;
}) {
  const router = useRouter();
  const {
    language,
    t,
    loginWithCredentials,
    sendRegisterOtp,
    registerAccount,
    showToast,
  } = useLupiva();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState<string>("");
  const [identifier, setIdentifier] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpSending, setOtpSending] = useState<boolean>(false);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  const handleSwitchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setFullName("");
    setIdentifier("");
    setPhone("");
    setOtpCode("");
    setOtpSent(false);
    setOtpCooldown(0);
    setDevOtpHint(null);
    setEmail("");
    setPassword("");
  };

  const handleSendOtp = async () => {
    setErrorMessage(null);
    if (!isValidVietnamPhone(phone)) {
      setErrorMessage(t.toasts.phoneRequiredDesc);
      showToast(
        t.toasts.phoneRequiredTitle,
        t.toasts.phoneRequiredDesc,
        "amber"
      );
      return;
    }

    setOtpSending(true);
    try {
      const res = await sendRegisterOtp(phone.trim());
      if (!res.ok) {
        const msg =
          res.error ||
          (language === "vi"
            ? "Không thể gửi mã OTP."
            : "Unable to send OTP code.");
        setErrorMessage(msg);
        if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
          setOtpCooldown(res.retryAfterSeconds);
        }
        return;
      }

      setOtpSent(true);
      setOtpCooldown(res.cooldownSeconds ?? 60);
      setDevOtpHint(res.devOtp ?? null);
      showToast(
        t.login.otpLabel,
        res.devOtp
          ? `${t.login.otpSentHint} (Demo OTP: ${res.devOtp})`
          : t.login.otpSentHint,
        "teal"
      );
    } finally {
      setOtpSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === "login") {
      if (!identifier.trim()) {
        setErrorMessage(t.toasts.identifierRequiredDesc);
        showToast(
          t.toasts.identifierRequiredTitle,
          t.toasts.identifierRequiredDesc,
          "amber"
        );
        return;
      }
    } else {
      if (fullName.trim().length < 2) {
        const msg =
          language === "vi"
            ? "Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự)."
            : "Please enter your full name (at least 2 characters).";
        setErrorMessage(msg);
        return;
      }

      if (!isValidVietnamPhone(phone)) {
        setErrorMessage(t.toasts.phoneRequiredDesc);
        showToast(
          t.toasts.phoneRequiredTitle,
          t.toasts.phoneRequiredDesc,
          "amber"
        );
        return;
      }

      if (!/^\d{6}$/.test(otpCode.trim())) {
        setErrorMessage(t.toasts.otpRequiredDesc);
        showToast(
          t.toasts.otpRequiredTitle,
          t.toasts.otpRequiredDesc,
          "amber"
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const result =
        mode === "login"
          ? await loginWithCredentials({
              identifier: identifier.trim(),
              password,
              consentChecked: true,
            })
          : await registerAccount({
              fullName: fullName.trim(),
              phone: phone.trim(),
              otpCode: otpCode.trim(),
              email: email.trim() || undefined,
              password,
              role: "patient",
              consentChecked: true,
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

      const destination = resolveSafeRedirect(nextParam, result.user.role);
      router.push(destination);
    } finally {
      setSubmitting(false);
    }
  };

  const registerBtnLabel = language === "vi" ? "Đăng ký" : "Create Account";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 py-10 sm:py-16 focus:outline-none"
    >
      <div className="mx-auto max-w-md px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-8">
          <h1
            id="login-form-heading"
            className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            {mode === "login" ? t.login.title : t.login.registerTitle}
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {mode === "login" ? t.login.subtitle : t.login.registerSubtitle}
          </p>

          {errorMessage && (
            <div
              id="login-error-alert"
              role="alert"
              className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-900"
            >
              {errorMessage}
            </div>
          )}

          <form
            aria-labelledby="login-form-heading"
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
          >
            {mode === "login" ? (
              <div>
                <label
                  htmlFor="login-input-identifier"
                  className="block text-sm font-semibold text-slate-700"
                >
                  {t.login.identifierLabel}
                </label>
                <input
                  id="login-input-identifier"
                  name="identifier"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700"
                  placeholder={t.login.identifierPlaceholder}
                />
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="login-input-fullname"
                    className="block text-sm font-semibold text-slate-700"
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
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700"
                    placeholder={t.login.fullNamePlaceholder}
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-input-phone"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    {t.login.phoneLabel}
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="login-input-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setOtpSent(false);
                        setDevOtpHint(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700"
                      placeholder={t.login.phonePlaceholder}
                    />
                    <button
                      type="button"
                      id="login-btn-send-otp"
                      onClick={handleSendOtp}
                      disabled={otpSending || otpCooldown > 0}
                      className="shrink-0 rounded-lg border border-teal-700 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      {otpSending
                        ? t.login.sendingOtpBtn
                        : otpCooldown > 0
                        ? t.login.resendOtpBtn(otpCooldown)
                        : t.login.sendOtpBtn}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-input-otp"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    {t.login.otpLabel}
                  </label>
                  <input
                    id="login-input-otp"
                    name="otpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm tracking-widest text-slate-900 focus:border-teal-700"
                    placeholder={t.login.otpPlaceholder}
                  />
                  {otpSent && (
                    <p
                      id="login-otp-hint"
                      className="mt-1.5 text-xs text-teal-800"
                    >
                      {t.login.otpSentHint}
                      {devOtpHint ? ` (Demo OTP: ${devOtpHint})` : ""}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="login-input-email"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    {t.login.emailOptionalLabel}
                  </label>
                  <input
                    id="login-input-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700"
                    placeholder="email@example.com"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="login-input-password"
                className="block text-sm font-semibold text-slate-700"
              >
                {t.login.passwordLabel}
              </label>
              <input
                id="login-input-password"
                name="password"
                type="password"
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                aria-describedby={
                  mode === "register" ? "login-password-hint" : undefined
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700"
              />
              {mode === "register" && (
                <p
                  id="login-password-hint"
                  className="mt-1.5 text-xs text-slate-500"
                >
                  {t.login.passwordHintRegister}
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                id="login-btn-submit"
                disabled={submitting}
                className="w-full min-h-11 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-2xs transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? mode === "login"
                    ? t.login.signingInBtn
                    : t.login.creatingAccountBtn
                  : mode === "login"
                  ? t.login.modeSignInTab
                  : registerBtnLabel}
              </button>
            </div>
          </form>

          <p className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
            {mode === "login" ? (
              <>
                {language === "vi"
                  ? "Nếu chưa có tài khoản, "
                  : "Don't have an account? "}
                <Link
                  href={buildAuthModeHref("register", nextParam)}
                  id="login-link-register"
                  onClick={() => handleSwitchMode("register")}
                  className="font-semibold text-teal-800 hover:text-teal-900 hover:underline"
                >
                  {language === "vi"
                    ? "Đăng ký tài khoản"
                    : "Create an account"}
                </Link>
              </>
            ) : (
              <>
                {language === "vi"
                  ? "Đã có tài khoản? "
                  : "Already have an account? "}
                <Link
                  href={buildAuthModeHref("login", nextParam)}
                  id="login-link-signin"
                  onClick={() => handleSwitchMode("login")}
                  className="font-semibold text-teal-800 hover:text-teal-900 hover:underline"
                >
                  {language === "vi" ? "Đăng nhập" : "Sign in"}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}

function LoginFormWithQueryParams() {
  const searchParams = useSearchParams();

  const modeParam = searchParams.get("mode");
  const nextParam = searchParams.get("next");
  const initialMode: AuthMode = modeParam === "register" ? "register" : "login";

  return (
    <LoginFormContent
      key={initialMode}
      initialMode={initialMode}
      nextParam={nextParam}
    />
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
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-600 shadow-2xs">
            Loading authentication workspace...
          </div>
        </main>
      }
    >
      <LoginFormWithQueryParams />
    </Suspense>
  );
}
