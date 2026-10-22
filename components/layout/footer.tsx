/* NEW-DESIGN: Hero.html — migrated 2026-05-19
   4-column layout: Brand · Product · Support · Legal
   Only pages that exist in the current Node.js site are linked. */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/components/providers/theme-provider";
import type { Locale } from "@/lib/i18n";
import { locales } from "@/lib/i18n";

interface FooterProps {
  locale: Locale;
}

const localeLabels: Record<Locale, string> = {
  en: "EN",
  ms: "BM",
  zh: "中文",
};

export function Footer({ locale }: FooterProps) {
  const { t, setLocale } = useTranslation(locale);
  const { theme } = useTheme();
  const [scrollVisible, setScrollVisible] = useState(false);
  const isDark = theme === "dark";

  useEffect(() => {
    function onScroll() { setScrollVisible(window.scrollY > 300); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Theme-aware tokens
  const borderClr  = isDark ? "rgba(255,255,255,0.07)"  : "rgba(10,12,20,0.07)";
  const tintBg     = isDark ? "rgba(122,92,255,0.04)"   : "rgba(122,92,255,0.05)";
  const inkDim     = isDark ? "#b1b6c6" : "#4b5365";
  const inkFine    = isDark ? "#c1c6d4" : "#3e455a";
  const inkColor   = isDark ? "#eef0fa" : "#0a0c14";
  const colHead    = isDark ? "#888ea2" : "#6b7488";
  const logoSrc    = isDark ? "/images/eastel-logo-white.svg" : "/images/eastel-logo-dark.svg";
  const scrollBg   = isDark ? "rgba(20,22,32,0.85)"     : "rgba(255,255,255,0.9)";
  const scrollClr  = isDark ? "#b1b6c6" : "#4b5365";

  // Links — only pages that exist in the current Node.js site
  const productLinks = [
    { href: `/${locale}/plans`,           label: t("navPlans",    "Mobile Plans")    },
    { href: `/${locale}/roaming`,         label: t("navRoaming",  "Roaming")         },
    { href: `/${locale}/order`,           label: t("navBuySim",   "Buy SIM")         },
    { href: `/${locale}/eastelpreneurs`,  label: t("epNavLink",   "Eastelpreneurs")  },
  ];

  const supportLinks = [
    { href: `/${locale}/faq`,     label: t("navFaq",     "FAQ")        },
    { href: `/${locale}/contact`, label: t("navContact", "Contact")    },
  ];

  const legalLinks = [
    { href: `/${locale}/terms`,    label: t("navTerms",    "Terms of Service")  },
    { href: `/${locale}/privacy`,  label: t("navPrivacy",  "Privacy Policy")    },
    { href: `/${locale}/delivery`, label: t("navDelivery", "Delivery Policy")   },
  ];

  const colHeadStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11px",
    letterSpacing: "0.12em",
    color: colHead,
    textTransform: "uppercase",
    marginBottom: "18px",
    fontWeight: 500,
  };

  const linkStyle: React.CSSProperties = {
    color: inkDim,
    fontSize: "13.5px",
    textDecoration: "none",
    transition: "color .2s",
    display: "block",
  };

  return (
    <>
      <footer
        style={{
          position: "relative",
          borderTop: `1px solid ${borderClr}`,
          background: `linear-gradient(180deg, transparent, ${tintBg})`,
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "80px 64px 36px",
          }}
          className="ftr-inner"
        >
          {/* ── Top grid ──────────────────────────────────── */}
          <div
            className="ftr-top"
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
              gap: "48px",
              paddingBottom: "56px",
              borderBottom: `1px solid ${borderClr}`,
            }}
          >
            {/* Brand */}
            <div className="ftr-brand">
              <Link href={`/${locale}`} style={{ display: "inline-block", marginBottom: "16px" }}>
                <img src={logoSrc} alt="Eastel" style={{ height: "40px", width: "auto" }} />
              </Link>
              <p style={{ color: inkDim, fontSize: "14px", lineHeight: 1.55, maxWidth: "320px" }}>
                {t("footerTagline", "Elevating connectivity standards across Malaysia through precision engineering and transparent service.")}
              </p>
            </div>

            {/* Product */}
            <div className="ftr-col">
              <h4 style={colHeadStyle}>{t("footerProduct", "Product")}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                {productLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={linkStyle}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support */}
            <div className="ftr-col">
              <h4 style={colHeadStyle}>{t("footerSupport", "Support")}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                {supportLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={linkStyle}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div className="ftr-col">
              <h4 style={colHeadStyle}>{t("footerLegal", "Legal")}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={linkStyle}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Bottom bar ────────────────────────────────── */}
          <div
            className="ftr-bot"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
              paddingTop: "28px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11.5px",
              color: inkFine,
              letterSpacing: "0.04em",
              flexWrap: "wrap",
            }}
          >
            <div>© {new Date().getFullYear()} Eastel · All rights reserved</div>
            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
              {locales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  style={{
                    color: loc === locale ? inkColor : inkFine,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "11.5px",
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.04em",
                    padding: 0,
                    transition: "color .2s",
                  }}
                >
                  {localeLabels[loc]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── Scroll-to-top ─────────────────────────────────── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          left: "1.5rem",
          zIndex: 50,
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: scrollBg,
          border: `1px solid ${borderClr}`,
          color: scrollClr,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          transition: "opacity 0.2s, transform 0.2s",
          opacity: scrollVisible ? 1 : 0,
          transform: scrollVisible ? "translateY(0)" : "translateY(8px)",
          pointerEvents: scrollVisible ? "auto" : "none",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Responsive overrides — avoids globals.css pollution */}
      <style>{`
        @media (max-width: 1100px) {
          .ftr-inner { padding: 64px 40px 28px !important; }
          .ftr-top   { grid-template-columns: repeat(3, 1fr) !important; gap: 32px !important; }
          .ftr-brand { grid-column: span 3; }
        }
        @media (max-width: 768px) {
          .ftr-inner { padding: 48px 20px 24px !important; }
          .ftr-top   { grid-template-columns: 1fr !important; gap: 32px !important; padding-bottom: 36px !important; }
          .ftr-brand { grid-column: auto !important; }
          .ftr-bot   { flex-direction: column; align-items: flex-start !important; font-size: 11px !important; }
        }
      `}</style>
    </>
  );
}
