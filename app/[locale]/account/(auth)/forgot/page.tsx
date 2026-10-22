"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell } from "@/components/ui/auth-shell";
import { useTranslation } from "@/hooks/useTranslation";

export default function ForgotPage() {
  const params = useParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!turnstileToken) {
      setError(t("ordErrTurnstileReq", "Please complete the security check."));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken, lang: locale }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") setError(typeof data?.message === "string" ? data.message : t("authErrConn", "Request failed. Please try again."));
      else setSent(true);
    } catch {
      setError(t("authErrConn", "Request failed. Please try again."));
    } finally {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        eyebrow={t("authTitleForgot", "Password reset")}
        title={t("authCheckEmail", "Check your email")}
        description={t("authResetSentInstructions", "If an account exists for that email, check your inbox and spam folder for a reset link.")}
        footer={
          <Link href={`/${locale}/account/login`}>{t("authBackToLogin", "Back to sign in")}</Link>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 mb-4">
            <Mail className="h-6 w-6" />
          </div>
          <p className="text-sm text-[color:var(--acc-text-dim)]">
            {t("authResetRequestedFor", "Reset requested for")}{" "}
            <span className="font-semibold text-[color:var(--acc-text)]">{email}</span>.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("authTitleForgot", "Password reset")}
      title={t("authTitleForgot", "Forgot password?")}
      description={t("authSubForgot", "Enter your email and we'll send you a reset link.")}
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
        <Input
          label={t("authLblEmail", "Email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <TurnstileWidget action="forgot_password" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
        <Button type="submit" size="lg" loading={loading} fullWidth disabled={!turnstileToken}>
          {t("authBtnForgot", "Send reset link")}
        </Button>
      </form>
    </AuthShell>
  );
}
