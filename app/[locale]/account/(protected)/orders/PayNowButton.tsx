"use client";

import { useState } from "react";

// Pay Now for pending or failed attempts against the original payable bill.
// Calls /api/payment/check-payment: if ToyyibPay says already paid → refresh
// (DB gets updated by the API); otherwise redirect to the payment page.
// NOTE: that endpoint returns { status: "ok" } (PHP-style), not "success".

interface PayNowButtonProps {
  billCode: string;
  label: string;
  busyLabel: string;
}

export default function PayNowButton({ billCode, label, busyLabel }: PayNowButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payment/check-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_code: billCode }),
      });
      const data = await res.json();
      if (data.status === "ok" && data.paid) {
        window.location.reload();
        return;
      }
      if (data.pay_url) {
        window.location.href = data.pay_url;
        return;
      }
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="min-h-11 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
