"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useTranslation } from "@/hooks/useTranslation";

interface MobileCtaBarProps {
  locale: Locale;
}

const WHATSAPP_URL = "https://wa.me/601175999733";

export function MobileCtaBar({ locale }: MobileCtaBarProps) {
  const { t } = useTranslation(locale);
  const [visible, setVisible] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 320);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        setKeyboardOpen(true);
      }
    }
    function onFocusOut() {
      setKeyboardOpen(false);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const hidden = !visible || keyboardOpen;

  return (
    <div
      aria-hidden={hidden}
      className={[
        "fixed bottom-0 left-0 right-0 z-40 sm:hidden",
        "border-t border-border bg-surface/95 backdrop-blur-xl",
        "px-3 pt-2.5 pb-2 safe-area-pb",
        "transition-transform duration-300 ease-out",
        hidden ? "translate-y-full pointer-events-none" : "translate-y-0",
      ].join(" ")}
    >
      <div className="flex gap-2">
        <Link
          href={`/${locale}/order`}
          className="flex flex-1 h-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-brand text-sm font-semibold text-white shadow-[var(--shadow-sm)] active:translate-y-px transition-transform"
        >
          {t("mobileCtaGet", "Get SIM — RM15/mo")}
        </Link>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("mobileCtaWhatsapp", "WhatsApp")}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-raised text-text-primary active:translate-y-px transition-transform"
        >
          <MessageCircle className="h-5 w-5 text-[#25D366]" fill="currentColor" />
        </a>
      </div>
    </div>
  );
}
