"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import type { Locale } from "@/lib/i18n";

interface VoucherBannerProps {
  locale: Locale;
}

export function VoucherBanner({ locale }: VoucherBannerProps) {
  const { t } = useTranslation(locale);
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  // Skip showing on order and account routes
  const isOrderOrAccount = pathname.includes("/order") || pathname.includes("/account");

  useEffect(() => {
    if (isOrderOrAccount) {
      setVisible(false);
      document.documentElement.style.removeProperty("--voucher-bar-h");
      return;
    }

    if (sessionStorage.getItem("voucher-bar-dismissed") === "1") {
      return;
    }

    async function checkVouchers() {
      try {
        // 1) Logged-in active voucher?
        const vr = await fetch("/api/vouchers?action=my_active");
        const vd = await vr.json();
        
        if (vd.status === "success" && vd.vouchers && vd.vouchers.length > 0) {
          const v = vd.vouchers[0];
          const text = t("voucherBarHave", "You have {label} off — code {code}. Use it at checkout.")
            .replace("{label}", v.label)
            .replace("{code}", v.code);
          setBannerText(text);
          setCtaText(t("voucherBarOrder", "Order now"));
          setCtaHref(`/${locale}/order`);
          setVisible(true);
          return;
        }

        // 2) Welcome teaser
        const tr = await fetch("/api/vouchers?action=welcome_teaser");
        const td = await tr.json();
        if (td.status === "success" && td.enabled) {
          const text = t("voucherBarTeaser", "New here? Sign up and get {label} off your first SIM.")
            .replace("{label}", td.label);
          setBannerText(text);
          setCtaText(t("voucherBarSignup", "Sign up"));
          setCtaHref(`/${locale}/account/register`);
          setVisible(true);
        }
      } catch (e) {
        console.error("[VoucherBanner] failed to check vouchers:", e);
      }
    }

    checkVouchers();
  }, [pathname, locale, isOrderOrAccount, t]);

  // Adjust document offset --voucher-bar-h dynamically based on banner height
  useEffect(() => {
    if (visible && barRef.current) {
      const updateOffset = () => {
        if (barRef.current) {
          document.documentElement.style.setProperty(
            "--voucher-bar-h",
            `${barRef.current.offsetHeight}px`
          );
        }
      };
      updateOffset();
      
      const observer = new ResizeObserver(updateOffset);
      observer.observe(barRef.current);
      window.addEventListener("resize", updateOffset);
      
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updateOffset);
      };
    } else {
      document.documentElement.style.removeProperty("--voucher-bar-h");
    }
  }, [visible]);

  const handleDismiss = () => {
    sessionStorage.setItem("voucher-bar-dismissed", "1");
    setVisible(false);
    document.documentElement.style.removeProperty("--voucher-bar-h");
  };

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      className="bg-gradient-to-r from-[#9b7bff]/95 via-[#8261e6]/95 to-[#5c3ab7]/95 border-b border-[#9b7bff]/20 text-white text-xs sm:text-sm py-2.5 px-4 sticky top-0 z-[100] backdrop-blur-md shadow-lg transition-all duration-300"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center">🎁</span>
          <span className="font-medium text-white">{bannerText}</span>
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1 text-white hover:text-white/80 font-bold underline transition-colors cursor-pointer"
          >
            {ctaText} →
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          className="text-white/70 hover:text-white p-1 rounded transition-colors focus:outline-none"
          aria-label={t("voucherBarClose", "Dismiss")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
