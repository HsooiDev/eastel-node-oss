import type { Metadata } from "next";
import Link from "next/link";

// Landing page for ToyyibPay billReturnUrl on WhatsApp-bot orders
// (lib/whatsapp/ai.ts points here). Order confirmation itself is sent
// to the customer's WhatsApp by /api/payment/callback.

export const metadata: Metadata = {
  title: "Payment Status — Eastel Mobile",
  robots: { index: false, follow: false },
};

export default function PaymentSuccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <span
        className="flex h-20 w-20 items-center justify-center rounded-full text-white"
        style={{ background: "linear-gradient(135deg, oklch(68% 0.21 250), oklch(55% 0.15 250))" }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
      <h1 className="mt-6 text-3xl font-bold">Check Your Payment Status</h1>
      <p className="mt-3 max-w-md leading-relaxed text-foreground-muted">
        Check WhatsApp for your payment status and order updates. If payment was deducted but no confirmation arrives, contact us before paying again.
        <br />
        Semak WhatsApp untuk status pembayaran dan kemas kini pesanan anda. Jika bayaran telah ditolak tetapi tiada pengesahan, hubungi kami sebelum membayar semula.
        <br />
        请在 WhatsApp 查看付款状态和订单更新。如果已扣款但尚未收到确认，请先联系我们，避免重复付款。
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <a
          href="https://wa.me/601175999733"
          className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, oklch(68% 0.21 250), oklch(55% 0.15 250))",
            boxShadow: "0 4px 16px rgba(3,105,161,0.3)",
          }}
        >
          Back to WhatsApp
        </a>
        <Link href="/ms" className="font-semibold underline underline-offset-4">
          Eastel Home
        </Link>
      </div>
    </main>
  );
}
