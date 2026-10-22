"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { AccountCard } from "@/components/ui/account-card";
import { useTranslation } from "@/hooks/useTranslation";
import { TurnstileWidget } from "@/components/turnstile-widget";

export default function PasswordPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError(t("authErrPassMismatch", "Passwords do not match."));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("authErrPassMin", "Password must be at least 8 characters."));
      return;
    }

    if (!turnstileToken) {
      setError(t("ordErrTurnstileReq", "Please complete the security check."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, turnstileToken }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setSuccess(t("profMsgPassSuc", "Password updated successfully!"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        if (data.reauthenticate) router.replace(`/${locale}/account/login`);
      } else {
        setError(data.message);
      }
    } catch {
      setError(t("profErrPassFail", "Failed to update password."));
    } finally {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[color:var(--acc-text)] mb-6">{t("profChangePass", "Change Password")}</h1>
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">{success}</div>
      )}
      <AccountCard className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField id="cur" label={t("profLblCurrent", "Current Password")} value={currentPassword} onChange={setCurrentPassword} required />
          <PasswordField id="new" label={t("profLblNew", "New Password")} value={newPassword} onChange={setNewPassword} required />
          <PasswordField id="cnf" label={t("profLblConfirm", "Confirm New Password")} value={confirmPassword} onChange={setConfirmPassword} required />
          <TurnstileWidget action="update_password" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          <Button type="submit" loading={loading} disabled={!turnstileToken}>{t("profBtnSave", "Update Password")}</Button>
        </form>
      </AccountCard>
    </div>
  );
}
