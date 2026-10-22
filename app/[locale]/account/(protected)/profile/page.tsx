"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountCard } from "@/components/ui/account-card";
import { useTranslation } from "@/hooks/useTranslation";
import { TurnstileWidget } from "@/components/turnstile-widget";

export default function ProfilePage() {
  const params = useParams();
  const locale = params.locale as string;
  const { t } = useTranslation(locale as any);

  const [form, setForm] = useState({ name: "", phone: "", address: "", postcode: "", state: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();
        if (!response.ok || data.status !== "success" || !data.customer) throw new Error("Profile unavailable");
        if (!cancelled) setForm({
          name: data.customer.name || "",
          phone: data.customer.phone || "",
          address: data.customer.address || "",
          postcode: data.customer.postcode || "",
          state: data.customer.state || "",
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!turnstileToken) {
      setIsSuccess(false);
      setMessage(t("ordErrTurnstileReq", "Please complete the security check."));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setIsSuccess(true);
        setMessage(t("profMsgUpdateSuc", "Profile updated!"));
      } else {
        setIsSuccess(false);
        setMessage(data.message);
      }
    } catch {
      setIsSuccess(false);
      setMessage(t("profErrUpdateFail", "Failed to update profile."));
    } finally {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setSaving(false);
    }
  }

  if (loading) return <div className="text-[color:var(--acc-text-faint)] text-sm">{t("ordLoading", "Loading...")}</div>;
  if (loadFailed) return (
    <div role="alert" className="space-y-4">
      <p>{t("profErrLoad", "Failed to load profile.")}</p>
      <Button type="button" onClick={() => {
        setLoading(true);
        setLoadFailed(false);
        setLoadAttempt((attempt) => attempt + 1);
      }}>{t("tyTryAgain", "Try again")}</Button>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[color:var(--acc-text)] mb-6">{t("profEditTitle", "Edit Profile")}</h1>
      {message && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${isSuccess ? "border-green-500/30 bg-green-500/10 text-green-600" : "border-red-500/30 bg-red-500/10 text-red-600"}`}>
          {message}
        </div>
      )}
      <AccountCard className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {[
            { label: t("profLblName", "Full Name"), field: "name", type: "text", autoComplete: "name" },
            { label: t("profLblPhone", "Phone"), field: "phone", type: "tel", autoComplete: "tel" },
            { label: t("accAddrLabel", "Address"), field: "address", type: "text", autoComplete: "street-address" },
            { label: t("accPostcodeLabel", "Postcode"), field: "postcode", type: "text", autoComplete: "postal-code" },
            { label: t("accStateLabel", "State"), field: "state", type: "text", autoComplete: "address-level1" },
          ].map(({ label, field, type, autoComplete }) => (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={field} className="text-sm font-medium text-[color:var(--acc-text-muted)]">{label}</label>
              <input
                id={field}
                type={type}
                value={form[field as keyof typeof form]}
                onChange={(e) => update(field, e.target.value)}
                autoComplete={autoComplete}
                className="w-full h-11 rounded-xl border border-[color:var(--acc-border-strong)] bg-[color:var(--acc-input-bg)] px-4 text-sm text-[color:var(--acc-text)] placeholder:text-[color:var(--acc-text-faint)] focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400/60"
              />
            </div>
          ))}
          <p className="text-sm text-[color:var(--acc-text-muted)]">
            {t("profReviewReapproval", "Saving your profile updates the name on your public reviews and sends them for approval again. Anonymous reviews stay anonymous.")}
          </p>
          <TurnstileWidget action="update_profile" onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          <Button type="submit" loading={saving} disabled={!turnstileToken}>{t("profBtnUpdate", "Save Changes")}</Button>
        </form>
      </AccountCard>
    </div>
  );
}
