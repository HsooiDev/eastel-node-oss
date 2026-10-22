"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

interface PaymentReturnNoticeProps {
  locale: Locale;
  status: "paid" | "failed" | "processing" | "unconfirmed";
  orderRef?: string;
}

export default function PaymentReturnNotice({ locale, status, orderRef }: PaymentReturnNoticeProps) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (status !== "processing") return;
    // Refresh the authenticated server page only. Never initiate another payment.
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setAttempts(count);
      router.refresh();
      if (count >= 20) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [status, router]);

  const labels = locale === "zh" ? {
    paid: "付款已确认", paidBody: "您的订单已记录为已付款。您可以在下方查看订单详情。",
    failed: "付款未成功", failedBody: "订单记录显示付款未成功。如果银行已经扣款，请先联系我们核实，避免重复付款。",
    processing: "正在确认付款", processingBody: "我们正在更新订单状态。如果您已经完成付款，请等待确认，避免重复付款。",
    timeout: "付款仍待确认", unconfirmed: "暂时无法确认付款状态",
    help: "如果银行已经扣款，但订单尚未显示已付款，请联系我们核实，再决定是否重新付款。",
    refresh: "刷新订单状态", contact: "联系 Eastel", checking: "正在更新", reference: "订单编号",
  } : locale === "ms" ? {
    paid: "Pembayaran disahkan", paidBody: "Pesanan anda direkodkan sebagai telah dibayar. Lihat butiran pesanan di bawah.",
    failed: "Pembayaran tidak berjaya", failedBody: "Rekod pesanan menunjukkan pembayaran tidak berjaya. Jika bank telah mendebit akaun anda, hubungi kami sebelum membayar semula.",
    processing: "Mengesahkan pembayaran", processingBody: "Kami sedang mengemas kini status pesanan. Jika anda telah membayar, tunggu pengesahan sebelum membayar semula.",
    timeout: "Pembayaran masih menunggu pengesahan", unconfirmed: "Status pembayaran belum dapat disahkan",
    help: "Jika akaun bank telah didebit tetapi pesanan belum menunjukkan bayaran diterima, hubungi kami sebelum membayar semula.",
    refresh: "Muat semula status pesanan", contact: "Hubungi Eastel", checking: "Mengemas kini", reference: "Rujukan pesanan",
  } : {
    paid: "Payment confirmed", paidBody: "Your order is recorded as paid. You can view its details below.",
    failed: "Payment unsuccessful", failedBody: "The order record shows an unsuccessful payment. If your bank has charged you, contact us before paying again.",
    processing: "Confirming your payment", processingBody: "We are updating your order status. If you have already paid, wait for confirmation before paying again.",
    timeout: "Payment still awaiting confirmation", unconfirmed: "Payment status could not be confirmed",
    help: "If your bank has charged you but the order is not marked paid, contact us before paying again.",
    refresh: "Refresh order status", contact: "Contact Eastel", checking: "Updating", reference: "Order reference",
  };
  const timedOut = status === "processing" && attempts >= 20;
  const title = timedOut ? labels.timeout : labels[status];
  const body = status === "paid" ? labels.paidBody : status === "failed" ? labels.failedBody
    : status === "processing" && !timedOut ? labels.processingBody : labels.help;

  return (
    <section role="status" aria-live="polite" className="mb-6 rounded-xl border border-[color:var(--acc-border)] bg-[color:var(--acc-surface)] p-4 text-[color:var(--acc-text)] sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[color:var(--acc-text-dim)]">{body}</p>
      {orderRef && <p className="mt-2 break-words text-sm">{labels.reference}: <span className="font-mono">{orderRef}</span></p>}
      {status === "processing" && !timedOut && <p className="mt-2 text-xs text-[color:var(--acc-text-dim)]">{labels.checking}… {attempts}/20</p>}
      {status !== "paid" && <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => router.refresh()} className="inline-flex min-h-11 items-center rounded-lg border border-[color:var(--acc-border)] px-3 text-sm font-medium">{labels.refresh}</button>
        <a href="https://wa.me/601175999733" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-cyan-600 underline underline-offset-4">{labels.contact}</a>
      </div>}
    </section>
  );
}
