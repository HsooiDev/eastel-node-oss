"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { AuthShell } from "@/components/ui/auth-shell";
import { useTranslation } from "@/hooks/useTranslation";
import { sanitizeLocalRedirect } from "@/lib/safe-redirect";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const redirectUrl = searchParams.get("redirect");
  const fallbackRedirect = `/${locale}/account/orders`;
  const safeRedirect = sanitizeLocalRedirect(redirectUrl, fallbackRedirect);
  const redirectQuery = safeRedirect !== fallbackRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json();

      if (!res.ok || data?.status !== "success") {
        setError(typeof data?.message === "string" ? data.message : t("authErrLoginFail", "Login failed. Please try again."));
        return;
      }

      if (!data.emailVerified) {
        router.push(`/${locale}/account/verify-email${redirectQuery}`);
      } else if (data.requiresPasswordChange) {
        router.push(`/${locale}/account/password`);
      } else {
        router.push(safeRedirect);
      }
    } catch {
      setError(t("authErrLoginFail", "Login failed. Please try again."));
    } finally {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("authTitle", "Account")}
      title={t("ordWelcomePrefix", "Welcome back")}
      description={t("authSubtitle", "Sign in to manage orders, reload, and track delivery.")}
      footer={
        <>
          <span>{t("authNoAccount", "Don't have an account?")} </span>
          <Link href={`/${locale}/account/register${redirectQuery}`}>
            {t("authRegisterLink", "Create one")}
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
        <Input
          label={t("authLblEmail", "Email address")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-[color:var(--acc-text-muted)]">
              {t("authLblPass", "Password")}
            </label>
            <Link href={`/${locale}/account/forgot`} className="text-xs font-medium text-cyan-500 hover:underline">
              {t("authTitleForgot", "Forgot?")}
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full h-11 rounded-xl border border-[color:var(--acc-border-strong)] bg-[color:var(--acc-input-bg)] px-4 pr-11 text-base sm:text-sm text-[color:var(--acc-text)] placeholder:text-[color:var(--acc-text-faint)] focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--acc-text-dim)] hover:text-[color:var(--acc-text)] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <TurnstileWidget action="login" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
        <Button type="submit" size="lg" loading={loading} fullWidth disabled={!turnstileToken}>
          {t("authBtnLogin", "Sign in")}
        </Button>
      </form>
    </AuthShell>
  );
}
