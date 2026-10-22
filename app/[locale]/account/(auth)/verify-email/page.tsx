"use client";

import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/ui/auth-shell";
import { useTranslation } from "@/hooks/useTranslation";
import { sanitizeLocalRedirect } from "@/lib/safe-redirect";

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);
  const fallbackRedirect = `/${locale}/account/orders`;
  const safeRedirect = sanitizeLocalRedirect(searchParams.get("redirect"), fallbackRedirect);
  const [verificationToken, setVerificationToken] = useState(() => searchParams.get("token") || "");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMsg, setResentMsg] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (resending || loading) return;
    setError("");
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError(t("ordOtpPh", "Please enter the full 6-digit code."));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode, token: verificationToken || undefined }),
      });
      const data = await res.json();
      if (res.ok && data?.status === "success" && data.emailVerified === true) {
        router.push(safeRedirect);
      } else {
        setError(typeof data?.message === "string" ? data.message : t("authVerificationFailed", "Verification failed."));
      }
    } catch {
      setError(t("authVerificationFailed", "Verification failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resending || loading) return;
    setResending(true);
    setResentMsg("");
    setError("");
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: locale }),
      });
      const data = await res.json();
      if (res.ok && data?.status === "success") {
        if (data.emailVerified === true) {
          router.push(safeRedirect);
          return;
        }
        if (typeof data.verificationToken !== "string" || !/^[a-f0-9]{64}$/i.test(data.verificationToken)) {
          setError(t("authFailedResend", "Failed to resend code."));
          return;
        }
        setVerificationToken(data.verificationToken);
        setCode(["", "", "", "", "", ""]);
        setResentMsg(t("authNewCodeSent", "A new code has been sent to your email."));
      } else {
        setError(typeof data?.message === "string" ? data.message : t("authFailedResend", "Failed to resend code."));
      }
    } catch {
      setError(t("authFailedResend", "Failed to resend code."));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("authVerification", "Verification")}
      title={t("authVerifyEmailTitle", "Verify your email")}
      description={t("authVerifyEmailDesc", "Enter the 6-digit code we sent to your email.")}
      footer={
        <>
          <span>{t("authDidNotReceiveCode", "Didn't receive a code?")} </span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || loading}
            className="disabled:opacity-50"
          >
            {resending ? t("authResending", "Sending…") : t("authResend", "Resend")}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {resentMsg && (
        <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          {resentMsg}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-center gap-2 sm:gap-3">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="tabular-num h-14 w-11 sm:w-12 rounded-xl border border-[color:var(--acc-border-strong)] bg-[color:var(--acc-input-bg)] text-center text-xl font-semibold text-[color:var(--acc-text)] focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              autoFocus={i === 0}
            />
          ))}
        </div>
        <Button type="submit" size="lg" loading={loading} disabled={resending} fullWidth>
          {t("authVerifyEmailBtn", "Verify email")}
        </Button>
      </form>
    </AuthShell>
  );
}
