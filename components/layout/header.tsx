/* NEW-DESIGN: Hero.html — migrated 2026-05-19
   Color mode: sun/moon SVG icon-btn (38×38, border, rounded-9px)
   Language: globe SVG + locale label + chevron dropdown
   Profile: ghost "Sign In" button
   Removed: "Network 100% · MY" pill, "Get eSIM" button */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/components/providers/theme-provider";
import type { Locale } from "@/lib/i18n";
import { locales } from "@/lib/i18n";

interface HeaderProps {
  locale: Locale;
}

const localeLabels: Record<Locale, string> = {
  en: "EN",
  ms: "BM",
  zh: "中文",
};

export function Header({ locale }: HeaderProps) {
  const { t, setLocale } = useTranslation(locale);
  const { theme, toggleThemeWithWave } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isDark = theme === "dark";

  useEffect(() => { setMobileOpen(false); }, [locale]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    if (langOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const navLinks = [
    { href: `/${locale}`, label: t("navHome", "Home") },
    { href: `/${locale}/plans`, label: t("navPlans", "Mobile Plans") },
    { href: `/${locale}/roaming`, label: t("navRoaming", "Roaming") },
    { href: `/${locale}/eastelpreneurs`, label: t("epNavLink", "Eastelpreneurs") },
    { href: `/${locale}/faq`, label: t("navFaq", "FAQ") },
    { href: `/${locale}/contact`, label: t("navContact", "Support") },
  ];

  function isActive(href: string) {
    if (href === `/${locale}`) return pathname === href;
    return pathname.startsWith(href);
  }

  // Theme-aware tokens
  const navBgTop   = isDark ? "rgba(7,8,13,0.85)"    : "rgba(255,255,255,0.85)";
  const navBgBot   = isDark ? "rgba(7,8,13,0.45)"    : "rgba(255,255,255,0.55)";
  const borderClr  = isDark ? "rgba(255,255,255,0.07)" : "rgba(10,12,20,0.07)";
  const lineClr    = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,12,20,0.14)";
  const inkColor   = isDark ? "#eef0fa" : "#0a0c14";
  const inkDim     = isDark ? "#b1b6c6" : "#4b5365";
  const inkMute    = isDark ? "#888ea2" : "#6b7488";
  const dropdownBg = isDark ? "rgba(10,12,20,0.96)"  : "rgba(255,255,255,0.96)";
  const drawerBg   = isDark ? "#07080d"               : "#f5f7fc";
  const hoverBg    = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,12,20,0.06)";

  const iconBtn: React.CSSProperties = {
    width: "38px",
    height: "38px",
    borderRadius: "9px",
    border: `1px solid ${lineClr}`,
    background: "transparent",
    color: inkDim,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all .2s",
    flexShrink: 0,
  };

  const ghostBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "38px",
    padding: "0 16px",
    borderRadius: "8px",
    fontSize: "13.5px",
    fontWeight: 500,
    border: `1px solid ${lineClr}`,
    background: "transparent",
    color: inkColor,
    textDecoration: "none",
    transition: "border-color .2s, background .2s",
    whiteSpace: "nowrap" as const,
    cursor: "pointer",
  };

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: "var(--voucher-bar-h, 0px)",
          left: 0,
          right: 0,
          zIndex: 50,
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 40px",
          background: `linear-gradient(180deg, ${navBgTop}, ${navBgBot})`,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${borderClr}`,
          transition: "background .3s ease, border-color .3s ease",
        }}
      >
        <a
          href="#main-content"
          style={{ position: "absolute", left: "-9999px", top: "auto", zIndex: 999 }}
          onFocus={(e) => { e.currentTarget.style.left = "2px"; }}
          onBlur={(e)  => { e.currentTarget.style.left = "-9999px"; }}
        >
          {t("skipToMain", "Skip to main content")}
        </a>

        {/* ── Brand ─────────────────────────────────────────── */}
        <Link href={`/${locale}`} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isDark ? "/images/eastel-logo-white.svg" : "/images/eastel-logo-dark.svg"}
            alt="Eastel"
            style={{ height: "36px", width: "auto" }}
          />
        </Link>

        {/* ── Desktop nav ───────────────────────────────────── */}
        <nav
          className="hidden lg:flex"
          style={{ gap: "34px" }}
          aria-label="Main navigation"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: isActive(link.href) ? inkColor : inkDim,
                textDecoration: "none",
                fontSize: "13.5px",
                fontWeight: 500,
                transition: "color .2s",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ── Right actions ─────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>

          {/* Theme toggle */}
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              toggleThemeWithWave(r.left + r.width / 2, r.top + r.height / 2);
            }}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            style={iconBtn}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
          </button>

          {/* Language dropdown */}
          <div ref={langRef} style={{ position: "relative" }}>
            <button
              onClick={() => setLangOpen((o) => !o)}
              aria-label="Switch language"
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              style={{ ...iconBtn, width: "auto", padding: "0 10px", gap: "6px", fontSize: "13px", letterSpacing: "0.02em" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{localeLabels[locale]}</span>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ transition: "transform .2s", transform: langOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {langOpen && (
              <ul
                role="listbox"
                aria-label="Select language"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  minWidth: "100px",
                  background: dropdownBg,
                  border: `1px solid ${lineClr}`,
                  borderRadius: "10px",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  padding: "6px",
                  zIndex: 60,
                  listStyle: "none",
                  margin: 0,
                }}
              >
                {locales.map((loc) => (
                  <li key={loc} role="option" aria-selected={loc === locale}>
                    <button
                      onClick={() => { setLocale(loc); setLangOpen(false); }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: loc === locale ? inkColor : inkDim,
                        background: loc === locale ? hoverBg : "transparent",
                        border: "none",
                        borderRadius: "7px",
                        cursor: "pointer",
                        transition: "background .15s, color .15s",
                      }}
                    >
                      {localeLabels[loc]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Sign In — ghost button, hidden on xs */}
          <Link
            href={`/${locale}/account/login`}
            style={ghostBtn}
            className="hidden sm:inline-flex"
          >
            {t("navSignIn", "Sign In")}
          </Link>

          {/* Mobile hamburger — hidden on lg+ */}
          <button
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            style={iconBtn}
            className="lg:hidden"
          >
            {mobileOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      <div
        aria-hidden={!mobileOpen}
        style={{
          position: "fixed",
          inset: "calc(64px + var(--voucher-bar-h, 0px)) 0 0 0",
          zIndex: 49,
          background: drawerBg,
          borderTop: `1px solid ${borderClr}`,
          transform: mobileOpen ? "translateY(0)" : "translateY(-100%)",
          opacity: mobileOpen ? 1 : 0,
          transition: "transform .35s cubic-bezier(.4,0,.2,1), opacity .25s",
          pointerEvents: mobileOpen ? "auto" : "none",
          padding: "32px 28px",
          overflowY: "auto",
        }}
      >
        <nav aria-label="Mobile navigation">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 4px",
                    color: isActive(link.href) ? inkColor : inkDim,
                    textDecoration: "none",
                    fontSize: "18px",
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    borderBottom: `1px solid ${borderClr}`,
                  }}
                >
                  {link.label}
                  <span style={{ color: inkMute }}>→</span>
                </Link>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "24px" }}>
            <Link
              href={`/${locale}/account/login`}
              onClick={() => setMobileOpen(false)}
              style={{ ...ghostBtn, height: "48px", fontSize: "15px", width: "100%" }}
            >
              {t("navSignIn", "Sign In")}
            </Link>
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "20px", paddingTop: "20px", borderTop: `1px solid ${borderClr}`, flexWrap: "wrap" }}>
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => { setLocale(loc); setMobileOpen(false); }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: loc === locale ? inkColor : inkDim,
                  background: loc === locale ? hoverBg : "transparent",
                  border: `1px solid ${loc === locale ? lineClr : "transparent"}`,
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                {localeLabels[loc]}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}
