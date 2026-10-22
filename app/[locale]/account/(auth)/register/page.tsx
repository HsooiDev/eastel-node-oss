"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell } from "@/components/ui/auth-shell";
import { useTranslation } from "@/hooks/useTranslation";
import { sanitizeLocalRedirect } from "@/lib/safe-redirect";

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const redirectUrl = searchParams.get("redirect");
  const fallbackRedirect = `/${locale}/account/orders`;
  const safeRedirect = sanitizeLocalRedirect(redirectUrl, fallbackRedirect);
  const redirectQuery = safeRedirect !== fallbackRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : "";
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError(t("authErrPassMismatch", "Passwords do not match."));
      return;
    }

    if (!turnstileToken) {
      setError(t("ordErrTurnstileReq", "Please complete the security check."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken, lang: locale }),
      });
      const data = await res.json();

      if (!res.ok || data?.status !== "success") {
        setError(typeof data?.message === "string" ? data.message : t("authErrRegFail", "Registration failed. Please try again."));
        return;
      }

      if (!data.emailVerified) {
        const verificationQuery = new URLSearchParams();
        if (data.verificationToken) verificationQuery.set("token", data.verificationToken);
        if (safeRedirect !== fallbackRedirect) verificationQuery.set("redirect", safeRedirect);
        const suffix = verificationQuery.toString() ? `?${verificationQuery.toString()}` : "";
        router.push(`/${locale}/account/verify-email${suffix}`);
      } else {
        router.push(safeRedirect);
      }
    } catch {
      setError(t("authErrRegFail", "Registration failed. Please try again."));
    } finally {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("authTabRegister", "Get started")}
      title={t("authBtnRegister", "Create your account")}
      description={t("authSubtitle", "Manage your SIM orders and account details.")}
      footer={
        <>
          <span>{t("authHaveAccount", "Already have an account?")} </span>
          <Link href={`/${locale}/account/login${redirectQuery}`}>
            {t("authLoginLink", "Sign in")}
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input label={t("authLblName", "Full name")} value={form.name} onChange={(e) => update("name", e.target.value)} required autoComplete="name" />
        <Input label={t("authLblEmail", "Email address")} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required autoComplete="email" />
        <Input label={t("authLblPhone", "Phone number")} type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required autoComplete="tel" />
        <PasswordField
          id="password"
          label={t("authLblNewPass", "Password")}
          value={form.password}
          onChange={(v) => update("password", v)}
          required
          placeholder={t("regPassPh", "Min. 8 characters")}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm"
          label={t("authLblConfirm", "Confirm password")}
          value={form.confirmPassword}
          onChange={(v) => update("confirmPassword", v)}
          required
          placeholder={t("regConfirmPh", "Re-enter password")}
          autoComplete="new-password"
        />
        <TurnstileWidget action="register" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
        <Button type="submit" size="lg" loading={loading} fullWidth disabled={!turnstileToken}>
          {t("authBtnRegister", "Create account")}
        </Button>
      </form>
    </AuthShell>
  );
}
