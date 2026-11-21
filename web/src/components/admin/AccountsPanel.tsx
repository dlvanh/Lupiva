"use client";

import React, { useState } from "react";
import type { UserRole } from "@/data/mockData";
import type {
  AdminAccountDTO,
  AdminAccountsResult,
  AdminCreateAccountInput,
  AdminUpdateAccountInput,
} from "@/lib/adminService";
import { generateSecurePassword } from "@/lib/registerPassword";
import type { AdminCopy } from "./adminTranslations";

const ROLE_BADGE_TONES: Record<UserRole, string> = {
  patient: "bg-sky-50 text-sky-900 border-sky-200",
  specialist: "bg-teal-50 text-teal-900 border-teal-200",
  admin: "bg-indigo-50 text-indigo-900 border-indigo-200",
};

export function AccountsPanel({
  data,
  copy,
  currentUserId,
  loading,
  busyId,
  creating,
  searchQuery,
  roleFilter,
  statusFilter,
  onSearchChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onPageChange,
  onUpdateAccount,
  onCreateAccount,
  initialCreateOpen = false,
}: {
  data: AdminAccountsResult | null;
  copy: AdminCopy;
  currentUserId: string;
  loading: boolean;
  busyId: string | null;
  creating: boolean;
  searchQuery: string;
  roleFilter: "all" | UserRole;
  statusFilter: "all" | "active" | "inactive";
  onSearchChange: (q: string) => void;
  onRoleFilterChange: (role: "all" | UserRole) => void;
  onStatusFilterChange: (status: "all" | "active" | "inactive") => void;
  onPageChange: (page: number) => void;
  onUpdateAccount: (userId: string, patch: AdminUpdateAccountInput) => Promise<boolean>;
  onCreateAccount: (input: AdminCreateAccountInput) => Promise<boolean>;
  initialCreateOpen?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("specialist");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleGeneratePassword = () => {
    const generated = generateSecurePassword(16);
    setPassword(generated);
    setShowPassword(true);
    setPasswordStatus(copy.accounts.passwordGenerated);
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(password);
        setPasswordStatus(copy.accounts.passwordCopied);
      }
    } catch {
      // Clipboard write may be restricted; keep the visible password input usable.
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!fullName.trim() || (!email.trim() && !phone.trim())) {
      setFormError(`${copy.accounts.fullName}, ${copy.accounts.email} / ${copy.accounts.phone}`);
      return;
    }
    const ok = await onCreateAccount({
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      password,
      role,
      title: title.trim() || undefined,
      departmentOrRegistryId: department.trim() || undefined,
    });
    if (ok) {
      setCreateOpen(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setShowPassword(false);
      setPasswordStatus(null);
      setTitle("");
      setDepartment("");
    }
  };

  return (
    <section
      id="admin-panel-accounts"
      aria-labelledby="admin-accounts-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="admin-accounts-heading"
            className="text-lg font-bold text-slate-900"
          >
            {copy.accounts.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{copy.accounts.subtitle}</p>
        </div>

        <button
          type="button"
          id="admin-btn-open-create-account"
          onClick={() => {
            setFormError(null);
            setCreateOpen((prev) => !prev);
          }}
          className="min-h-9 cursor-pointer rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
        >
          {createOpen ? copy.accounts.cancel : `+ ${copy.accounts.provisionBtn}`}
        </button>
      </div>

      {/* Summary pills */}
      {data && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
            {copy.accounts.total}:{" "}
            <strong className="tabular-nums text-slate-900">{data.summary.total}</strong>
          </span>
          <span className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 font-medium text-emerald-900">
            {copy.accounts.active}:{" "}
            <strong className="tabular-nums">{data.summary.active}</strong>
          </span>
          <span className="rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1 font-medium text-rose-900">
            {copy.accounts.inactive}:{" "}
            <strong className="tabular-nums">{data.summary.inactive}</strong>
          </span>
          {(["specialist", "patient", "admin"] as const).map((r) => (
            <span
              key={r}
              className={`rounded-lg border px-2.5 py-1 font-medium ${ROLE_BADGE_TONES[r]}`}
            >
              {copy.roles[r]}:{" "}
              <strong className="tabular-nums">{data.summary.byRole[r] ?? 0}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Provision Account Form */}
      {createOpen && (
        <form
          id="admin-create-account-form"
          aria-labelledby="admin-create-account-heading"
          onSubmit={handleCreateSubmit}
          className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4"
        >
          <h3 id="admin-create-account-heading" className="text-sm font-bold text-slate-900">
            {copy.accounts.createTitle}
          </h3>
          {formError && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {formError}
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="admin-create-fullname"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.fullName}
              </label>
              <input
                id="admin-create-fullname"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="admin-create-email"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.email}
              </label>
              <input
                id="admin-create-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="admin-create-phone"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.phone}
              </label>
              <input
                id="admin-create-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="admin-create-role"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.roleLabel}
              </label>
              <select
                id="admin-create-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              >
                <option value="specialist">{copy.roles.specialist}</option>
                <option value="patient">{copy.roles.patient}</option>
                <option value="admin">{copy.roles.admin}</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="admin-create-title"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.titleLabel}
              </label>
              <input
                id="admin-create-title"
                name="title"
                type="text"
                autoComplete="organization-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="admin-create-department"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.departmentLabel}
              </label>
              <input
                id="admin-create-department"
                name="departmentOrRegistryId"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label
                htmlFor="admin-create-password"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.accounts.password}
              </label>
              <p id="admin-create-password-hint" className="mt-0.5 text-[11px] text-slate-500">
                {copy.accounts.passwordHint}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  id="admin-create-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  aria-describedby="admin-create-password-hint"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordStatus) setPasswordStatus(null);
                  }}
                  className="min-h-9 min-w-[220px] flex-1 max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                />
                <button
                  type="button"
                  id="admin-btn-generate-password"
                  onClick={handleGeneratePassword}
                  className="min-h-9 cursor-pointer rounded-lg border border-teal-700 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
                >
                  {copy.accounts.generatePassword}
                </button>
                <button
                  type="button"
                  id="admin-btn-toggle-password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  {showPassword ? copy.accounts.hidePassword : copy.accounts.showPassword}
                </button>
                <button
                  type="button"
                  id="admin-btn-copy-password"
                  disabled={!password}
                  onClick={() => void handleCopyPassword()}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copy.accounts.copyPassword}
                </button>
              </div>
              {passwordStatus && (
                <p role="status" aria-live="polite" className="mt-1 text-[11px] font-semibold text-teal-800">
                  {passwordStatus}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              id="admin-btn-submit-create-account"
              disabled={creating}
              className="min-h-8 cursor-pointer rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {copy.accounts.createSubmit}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-8 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copy.accounts.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          id="admin-accounts-search"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={copy.accounts.searchPlaceholder}
          aria-label={copy.accounts.searchPlaceholder}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
        />
        <select
          id="admin-accounts-role-filter"
          aria-label={copy.accounts.roleLabel}
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as "all" | UserRole)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
        >
          <option value="all">{copy.accounts.roleAll}</option>
          <option value="specialist">{copy.roles.specialist}</option>
          <option value="patient">{copy.roles.patient}</option>
          <option value="admin">{copy.roles.admin}</option>
        </select>
        <select
          id="admin-accounts-status-filter"
          aria-label={copy.accounts.thStatus}
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as "all" | "active" | "inactive")
          }
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
        >
          <option value="all">{copy.accounts.statusAll}</option>
          <option value="active">{copy.accounts.statusActive}</option>
          <option value="inactive">{copy.accounts.statusInactive}</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thAccount}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thContact}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thRole}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thStatus}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thSessions}
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {copy.accounts.thActions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  ...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  {copy.accounts.empty}
                </td>
              </tr>
            ) : (
              data.items.map((account: AdminAccountDTO) => {
                const isSelf = account.id === currentUserId;
                const isBusy = busyId === account.id;
                return (
                  <tr key={account.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">
                          {account.name}
                        </span>
                        {isSelf && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                            {copy.accounts.selfBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {account.title}
                      </p>
                      {account.departmentOrRegistryId && (
                        <p className="text-[11px] text-slate-500">
                          {account.departmentOrRegistryId}
                        </p>
                      )}
                      <p className="mt-0.5 tabular-nums text-[10px] text-slate-400">
                        {account.id}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 align-top tabular-nums text-[11px] text-slate-700">
                      <div>{account.email ?? "—"}</div>
                      <div className="mt-0.5 text-slate-500">
                        {account.phone ?? "—"}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {account.consentSigned
                          ? copy.accounts.consentSigned
                          : copy.accounts.consentPending}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <select
                        aria-label={`${copy.accounts.thRole}: ${account.name}`}
                        value={account.role}
                        disabled={isSelf || isBusy}
                        onChange={(e) =>
                          void onUpdateAccount(account.id, {
                            role: e.target.value as UserRole,
                          })
                        }
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="patient">{copy.roles.patient}</option>
                        <option value="specialist">{copy.roles.specialist}</option>
                        <option value="admin">{copy.roles.admin}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          account.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {account.isActive
                          ? copy.accounts.statusActive
                          : copy.accounts.statusInactive}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top tabular-nums font-semibold text-slate-800">
                      {account.activeSessionCount}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={isSelf || isBusy}
                          onClick={() =>
                            void onUpdateAccount(account.id, {
                              isActive: !account.isActive,
                            })
                          }
                          className={`min-h-7 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            account.isActive
                              ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          {account.isActive
                            ? copy.accounts.suspend
                            : copy.accounts.activate}
                        </button>
                        <button
                          type="button"
                          disabled={
                            isBusy ||
                            account.activeSessionCount === 0 ||
                            (isSelf && account.activeSessionCount <= 1)
                          }
                          onClick={() =>
                            void onUpdateAccount(account.id, {
                              revokeSessions: true,
                            })
                          }
                          className="min-h-7 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copy.accounts.revokeSessions}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <span>
            {copy.pagination.pageOf(
              data.pagination.page,
              data.pagination.totalPages,
              data.pagination.totalItems
            )}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!data.pagination.hasPreviousPage}
              onClick={() => onPageChange(data.pagination.page - 1)}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.pagination.prev}
            </button>
            <button
              type="button"
              disabled={!data.pagination.hasNextPage}
              onClick={() => onPageChange(data.pagination.page + 1)}
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.pagination.next}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
