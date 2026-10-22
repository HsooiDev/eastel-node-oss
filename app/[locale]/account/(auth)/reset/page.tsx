"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { AuthShell } from "@/components/ui/auth-shell";
import { useTranslation } from "@/hooks/useTranslation";
import { TurnstileWidget } from "@/components/turnstile-widget";

export default function ResetPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("authErrPassMismatch", "Passwords do not match."));
      return;
    }
    if (password.length < 8) {
      setError(t("authErrPassMin", "Password must be at least 8 characters."));
      return;
    }

    if (!turnstileToken) {
      setError(t("ordErrTurnstileReq", "Please complete the security check."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, turnstileToken }),
      });
      const data = await res.json();
      if (data.status === "success") {
        router.push(`/${locale}/account/login`);
      } else {
        setError(data.message);
      }
    } catch {
      setError(t("authErrResetFail", "Password reset failed."));
    } finally {
      // Siteverify tokens are single use, including a failed reset attempt.
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        eyebrow={t("authTitleForgot", "Password reset")}
        title={t("authErrInvalidToken", "Invalid reset link")}
        description={t("authErrResetFail", "This reset link is invalid or has expired.")}
        footer={
          <Link href={`/${locale}/account/forgot`}>{t("authTitleForgot", "Request a new link")}</Link>
        }
      >
        <p className="text-sm text-[color:var(--acc-text-dim)] text-center py-2">
          {t("email.reset.expiry", "Reset links expire 1 hour after they're issued.")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("authTitleForgot", "Password reset")}
      title={t("authTitleReset", "Set a new password")}
      description={t("authSubtitleReset", "Choose something memorable. Minimum 8 characters.")}
      footer={
        <Link href={`/${locale}/account/login`}>{t("authBackToLogin", "Back to sign in")}</Link>
      }
    >
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <PasswordField id="pw" label={t("authLblNewPass", "New password")} value={password} onChange={setPassword} required />
        <PasswordField id="pwc" label={t("authLblConfirm", "Confirm password")} value={confirmPassword} onChange={setConfirmPassword} required />
        <TurnstileWidget action="reset_password" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
        <Button type="submit" size="lg" loading={loading} disabled={!turnstileToken} fullWidth>
          {t("authBtnReset", "Reset password")}
        </Button>
      </form>
    </AuthShell>
  );
}
