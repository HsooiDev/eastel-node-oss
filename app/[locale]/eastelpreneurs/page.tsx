import React from "react";
import Link from "next/link";
import { PublicPageJsonLd } from "@/components/json-ld";
import { headers } from "next/headers";
import "../plans/plans.css";
import type { Metadata } from "next";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { EarningCalculator } from "@/components/earning-calculator";
import { GridCanvas } from "@/components/plans/grid-canvas";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);

  return buildMetadata({
    title: t(translations, "ep.seoTitle"),
    description: t(
      translations,
      "ep.seoDesc",
      "Flexible connectivity and partnerships for confident growth."
    ),
    locale,
    canonical: `${SITE_URL}/${locale}/eastelpreneurs`,
  });
}

/* ─── Registration tier row ──────────────────────────────────────────────── */

const TIER_COLORS = [
  { dot: "#60a5fa", bar: "rgba(96,165,250,0.55)" },  // blue   – Starter
  { dot: "#34d399", bar: "rgba(52,211,153,0.55)" },  // green  – Rising
  { dot: "#fbbf24", bar: "rgba(251,191,36,0.55)" },  // amber  – Builder
  { dot: "#f97316", bar: "rgba(249,115,22,0.55)" },  // orange – Achiever
  { dot: "#f59e0b", bar: "rgba(245,158,11,0.55)" },  // gold   – Champion
] as const;

function StyledTierRow({
  index,
  tierLabel,
  range,
  isChampion,
  newBonus,
  mnpBonus,
  translations,
}: {
  index: number;
  tierLabel: string;
  range: string;
  isChampion?: boolean;
  newBonus: string;
  mnpBonus: string;
  translations: Record<string, string>;
}) {
  const color = TIER_COLORS[index];
  return (
    <div
      className="relative flex flex-col gap-1 rounded-xl px-5 py-4 sm:flex-row sm:items-center sm:gap-0 bg-surface border border-border"
      style={{
        borderLeft: `3px solid ${color.bar}`,
      }}
    >
      {/* Tier name + champion badge */}
      <div className="flex min-w-[9rem] items-center gap-2.5">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{
            background: color.dot,
            boxShadow: `0 0 6px ${color.dot}`,
          }}
        />
        <span className="text-sm font-semibold text-foreground">
          {tierLabel}
        </span>
        {isChampion && (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{
              background: "linear-gradient(135deg,#f59e0b,#ef4444)",
              color: "#fff",
            }}
          >
            {t(translations, "epRegPromoTag", "Promo")}
          </span>
        )}
      </div>

      {/* Range */}
      <div className="flex-1 text-xs text-foreground-muted sm:pl-4">
        <span>{range}</span>
        <span className="ml-1 opacity-60">{t(translations, "epRegPerMonth", "/ month")}</span>
      </div>

      {/* Bonuses */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">
            {t(translations, "epRegCellNew", "New SIM")}
          </p>
          <p
            className="text-base font-bold"
            style={{ color: color.dot }}
          >
            {newBonus}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">
            {t(translations, "epRegCellMnp", "MNP")}
          </p>
          <p
            className="text-base font-bold"
            style={{ color: color.dot }}
          >
            {mnpBonus}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── RIF level step card (with cumulative badge) ────────────────────────── */

function RifLevelCard({
  level,
  percentage,
  cumulative,
  title,
  description,
  accentColor,
  badges,
}: {
  level: string;
  percentage: string;
  cumulative: string;
  title: string;
  description: string;
  accentColor: string;
  badges: string[];
}) {
  return (
    <div
      className="relative rounded-xl p-6 bg-surface border border-border"
      style={{
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      {/* Cumulative badge */}
      <span
        className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold"
        style={{
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}55`,
          color: accentColor,
        }}
      >
        ∑ {cumulative}
      </span>

      {/* Level badge */}
      <span
        className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          background: `${accentColor}18`,
          color: accentColor,
        }}
      >
        {level}
      </span>

      {/* Percentage */}
      <p
        className="text-3xl font-black"
        style={{ color: accentColor }}
      >
        {percentage}
      </p>

      <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
        {description}
      </p>

      {/* Cumulative level badges */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {badges.map((b, i) => (
          <span
            key={i}
            className="rounded-full px-2 py-0.5 text-[9px] font-bold"
            style={
              i < badges.length - 1
                ? {
                    background: `${accentColor}22`,
                    color: `${accentColor}cc`,
                    border: `1px solid ${accentColor}33`,
                  }
                : {
                    background: accentColor,
                    color: "#fff",
                  }
            }
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Rank tier card ─────────────────────────────────────────────────────── */

type LevelRow = { name: string; widthPct: number; pct: string; style?: string };

function RankTierCard({
  icon,
  rank,
  minReload,
  requirement,
  accentColor,
  gradient,
  isTopRank,
  levelRows,
  translations,
}: {
  icon: string;
  rank: string;
  minReload: string;
  requirement: React.ReactNode;
  accentColor: string;
  gradient: string;
  isTopRank?: boolean;
  levelRows: LevelRow[];
  translations: Record<string, string>;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl flex flex-col"
      style={{
        border: `1px solid ${accentColor}44`,
        boxShadow: `0 4px 24px ${accentColor}18`,
      }}
    >
      {isTopRank && (
        <div
          className="absolute right-0 top-0 rounded-bl-xl px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
        >
          {t(translations, "epTierTopRank", "Top Rank")}
        </div>
      )}

      {/* Card header */}
      <div className="px-6 py-5" style={{ background: gradient }}>
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
            <div className="min-h-[54px] flex items-center">
              <p className="text-lg font-bold text-white leading-tight">{rank}</p>
            </div>
          </div>
          <div
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55`, color: accentColor }}
          >
            {minReload}<span className="font-normal opacity-75 ml-0.5">{t(translations, "epTierReloadMo", "reload/mo")}</span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div
        className="px-6 py-5 flex flex-col gap-4 flex-1 bg-surface"
      >
        {/* Upgrade requirement */}
        <div>
          <p
            className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-foreground-muted"
          >
            {t(translations, "epTierUpgradeReq", "Upgrade Requirement")}
          </p>
          <p className="text-xs text-foreground-muted leading-relaxed min-h-[58px]">{requirement}</p>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Commission levels */}
        <div>
          <p
            className="mb-3 text-[9px] font-bold uppercase tracking-wider text-foreground-muted"
          >
            {t(translations, "epTierCommLvls", "Commission Levels")}
          </p>
          <div className="flex flex-col gap-2.5">
            {levelRows.map((lr, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-[75px] shrink-0 text-[11px] font-semibold text-foreground-muted">{lr.name}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-border">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${lr.widthPct}%`, background: `linear-gradient(90deg,${accentColor}88,${accentColor})` }}
                  />
                </div>
                <span
                  className="min-w-[50px] shrink-0 text-right text-[11px] font-bold whitespace-nowrap"
                  style={{ color: accentColor }}
                >
                  {lr.pct}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ accordion item ─────────────────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details
      className="group rounded-xl border border-border bg-surface"
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-foreground select-none"
        style={{ WebkitUserSelect: "none" }}
      >
        <span>{q}</span>
        <svg
          className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180 text-foreground-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="px-5 pb-5 pt-1 text-sm leading-relaxed text-foreground-muted">
        {a}
      </div>
    </details>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function EastelpreneursPage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const WA_BASE = "https://wa.me/601175999733?text=";
  const WHATSAPP_CALC_URL =
    WA_BASE + encodeURIComponent(t(translations, "epWaMsgCalc", "Hi, I'd like to know more about the Eastelpreneur Programme!"));


  return (
    <div className="plans-section" style={{ minHeight: '100vh' }}>
      <GridCanvas showParticles={true} crosshair={false} particleMode="vortex-only" />
      <div className="plans-grid-mask" aria-hidden />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <PublicPageJsonLd translations={translations} locale={locale} path="eastelpreneurs"
          title={t(translations, "ep.seoTitle")} description={t(translations, "ep.seoDesc")} nonce={nonce} />

        {/* ── Hero ── */}
        <section className="relative py-20 sm:py-28">
          <div className="relative mx-auto max-w-7xl px-4 text-center">
          <span className="mb-4 inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            {t(translations, "epTag", "EASTELpreneurs Programme")}
          </span>
          <h1 className="mx-auto max-w-4xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t(translations, "epHeroTitle", "Grow More. Earn More.")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-foreground-muted sm:text-lg">
            {t(
              translations,
              "epHeroDesc",
              "Flexible connectivity and partnerships for confident growth. Build your network and earn while you stay connected."
            )}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={`/${locale}/order`}
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-primary to-blue-600 px-7 py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
            >
              {t(translations, "epHeroBtn1", "Order a SIM")}
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-lg border border-border bg-surface px-7 py-3 text-base font-medium text-foreground transition-colors hover:bg-surface-alt"
            >
              {t(translations, "epHeroBtn2", "See How It Works")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Registration Rewards ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              {t(translations, "epRegLabel", "Onboarding Campaign")}
            </span>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              {t(translations, "epRegTitle", "Registration Rewards Program")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-foreground-muted">
              {t(
                translations,
                "epRegSub",
                "Earn a bonus for every qualified registration you bring in."
              )}
            </p>
          </div>

          {/* Column headers */}
          <div className="mb-2 hidden grid-cols-[9rem_1fr_5rem_5rem] gap-4 px-5 text-[10px] font-bold uppercase tracking-widest text-foreground-muted sm:grid">
            <span>{t(translations, "epRegColTier", "Tier")}</span>
            <span>{t(translations, "epRegColReg", "Registrations")}</span>
            <span className="text-center">{t(translations, "epRegCellNew", "New SIM")}</span>
            <span className="text-center">{t(translations, "epRegCellMnp", "MNP")}</span>
          </div>

          {/* Styled tier rows */}
          <div className="flex flex-col gap-2">
            {[
              {
                tierLabel: t(translations, "epRegT1Name", "Starter"),
                range: t(translations, "epRegT1Range", "1 – 10"),
                newBonus: "RM8",
                mnpBonus: "RM13",
              },
              {
                tierLabel: t(translations, "epRegT2Name", "Rising"),
                range: t(translations, "epRegT2Range", "11 – 30"),
                newBonus: "RM9",
                mnpBonus: "RM14",
              },
              {
                tierLabel: t(translations, "epRegT3Name", "Builder"),
                range: t(translations, "epRegT3Range", "31 – 50"),
                newBonus: "RM10",
                mnpBonus: "RM15",
              },
              {
                tierLabel: t(translations, "epRegT4Name", "Achiever"),
                range: t(translations, "epRegT4Range", "51 – 100"),
                newBonus: "RM11",
                mnpBonus: "RM17",
              },
              {
                tierLabel: t(translations, "epRegT5Name", "Champion"),
                range: t(translations, "epRegT5Range", "101+"),
                isChampion: true,
                newBonus: "RM13",
                mnpBonus: "RM20",
              },
            ].map((row, i) => (
              <StyledTierRow key={i} index={i} {...row} translations={translations} />
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-foreground-muted">
            {t(
              translations,
              "epRegTnc",
              "*Terms & Conditions Apply. Champion Tier is a 12-month promotional campaign from date of issuance."
            )}
          </p>

          {/* Rules */}
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t(translations, "epRegRule1Title", "Same Calendar Month")}
              </h3>
              <p className="text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRegRule1Desc",
                  "Both activation and minimum RM35 reload must be completed within the same calendar month to qualify."
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t(translations, "epRegRule2Title", "Monthly Reset")}
              </h3>
              <p className="text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRegRule2Desc",
                  "Registration counts reset at the start of each month. Your tier is recalculated fresh every month."
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t(translations, "epRegRule3Title", "Not for Rank Upgrade")}
              </h3>
              <p className="text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRegRule3Desc",
                  "Onboarding bonuses are not counted towards rank upgrade eligibility and are not convertible to eCOMM."
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Reload Incentive Framework ── */}
      <section
        id="how-it-works"
        className="border-t border-border py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              {t(translations, "epRifLabel", "How It Works")}
            </span>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              {t(translations, "epRifTitle", "Reload Incentive Framework")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-foreground-muted">
              {t(
                translations,
                "epRifSub",
                "Every time someone in your network reloads, you earn a commission — automatically."
              )}
            </p>
          </div>

          {/* Commission equation */}
          <div
            className="mb-10 flex flex-wrap items-center justify-center gap-2 rounded-2xl px-6 py-5 bg-surface border border-border"
          >
            {[
              { label: "Level 1", value: "13%", color: "#60a5fa" },
              { label: "Level 2", value: "3%",  color: "#34d399" },
              { label: "Level 3", value: "8%",  color: "#a78bfa" },
            ].map((item, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="rounded-full px-4 py-1.5 text-sm font-bold"
                  style={{
                    background: `${item.color}18`,
                    border: `1px solid ${item.color}44`,
                    color: item.color,
                  }}
                >
                  {item.label} — {item.value}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-lg font-bold text-foreground-muted">+</span>
                )}
              </div>
            ))}
            <span className="text-lg font-bold text-foreground-muted">=</span>
            <span
              className="rounded-full px-4 py-1.5 text-sm font-bold"
              style={{
                background: "linear-gradient(135deg,rgba(96,165,250,0.2),rgba(167,139,250,0.2))",
                border: "1px solid rgba(167,139,250,0.4)",
                color: "#c4b5fd",
              }}
            >
              24% Total
            </span>
          </div>

          {/* Level step cards (cumulative) */}
          <div className="grid gap-6 sm:grid-cols-3">
            <RifLevelCard
              level={t(translations, "epRifLvl1", "Level 1")}
              percentage="13%"
              cumulative="13%"
              title={t(translations, "epRifC1Name", "Direct Network")}
              description={t(
                translations,
                "epRifC1Desc",
                "Earn 13% from every reload made by subscribers you personally registered."
              )}
              accentColor="#60a5fa"
              badges={[t(translations, "epRifBadge1a", "Level 1 ✓")]}
            />
            <RifLevelCard
              level={t(translations, "epRifLvl2", "Level 2")}
              percentage="+3%"
              cumulative="16%"
              title={t(translations, "epRifC2Name", "Second Generation")}
              description={t(
                translations,
                "epRifC2Desc",
                "Earn an additional 3% from reloads by subscribers registered under your Level 1 network."
              )}
              accentColor="#34d399"
              badges={[
                t(translations, "epRifBadge1a", "Level 1 ✓"),
                t(translations, "epRifBadge2a", "Level 2 ✓")
              ]}
            />
            <RifLevelCard
              level={t(translations, "epRifLvl3", "Level 3")}
              percentage="+8%"
              cumulative="24%"
              title={t(translations, "epRifC3Name", "Third Generation")}
              description={t(
                translations,
                "epRifC3Desc",
                "Earn a further 8% from reloads by subscribers two levels deep in your network."
              )}
              accentColor="#a78bfa"
              badges={[
                t(translations, "epRifBadge1a", "Level 1 ✓"),
                t(translations, "epRifBadge2a", "Level 2 ✓"),
                t(translations, "epRifBadge3a", "Level 3 ✓")
              ]}
            />
          </div>

          {/* Framework note */}
          <p className="mt-6 text-center text-xs text-foreground-muted">
            {t(
              translations,
              "epRifNote",
              "Our incentive framework consists of three levels of reload commission. Higher ranks unlock deeper levels beyond Level 3."
            )}
          </p>

          {/* Payout info */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <p className="text-xs text-foreground-muted">
                {t(translations, "epRifPayLbl", "Payout Schedule")}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {t(translations, "epRifPayVal", "18th")}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRifPayDesc",
                  "Incentives are disbursed on the 18th of the following month."
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <p className="text-xs text-foreground-muted">
                {t(translations, "epRifMinLbl", "Minimum Payout")}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">RM30</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRifMinDesc",
                  "Earnings accumulate until the RM30 threshold is met."
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <p className="text-xs text-foreground-muted">
                {t(translations, "epRifFeeLbl", "Processing Fee")}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">RM2</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {t(
                  translations,
                  "epRifFeeDesc",
                  "A flat RM2 processing fee is deducted from each disbursement."
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rank Structure ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              {t(translations, "epRankLabel", "Reload Incentive Structure")}
            </span>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              {t(translations, "epRankTitle", "Grow Your Rank. Earn More Levels.")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-foreground-muted">
              {t(
                translations,
                "epRankSub",
                "Earn residual commissions whenever your downline network reloads."
              )}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* ELITE */}
            <RankTierCard
              icon="💎"
              rank={t(translations, "epTierElite", "Elite")}
              minReload="RM35"
              gradient="linear-gradient(135deg,#1e3a5f,#1e293b)"
              accentColor="#60a5fa"
              isTopRank={false}
              translations={translations}
              requirement={<span>{t(translations, "epTierEliteReq", "Register a SIM card to begin your journey")}</span>}
              levelRows={[
                { name: t(translations, "epRifLvl1", "Level 1"), widthPct: 100, pct: "13%" },
                { name: t(translations, "epRifLvl2", "Level 2"), widthPct: 23, pct: "3%" },
                { name: t(translations, "epRifLvl3", "Level 3"), widthPct: 62, pct: "8%" },
              ]}            />
            {/* AMBASSADOR */}
            <RankTierCard
              icon="🏅"
              rank={t(translations, "epTierAmb", "Ambassador")}
              minReload="RM60"
              gradient="linear-gradient(135deg,#1a3f2f,#1e293b)"
              accentColor="#34d399"
              isTopRank={false}
              translations={translations}
              requirement={
                <span>
                  {t(translations, "epTierAccumulate", "Accumulate")} <strong>RM500</strong> {t(translations, "epTierInMonth", "in overriding incentive within a single month")}
                </span>
              }
              levelRows={[
                { name: t(translations, "epTierLv123", "Levels 1–3"), widthPct: 100, pct: t(translations, "epTierIncluded", "Included"), style: "dim" },
                { name: t(translations, "epTierLv48", "Levels 4–8"), widthPct: 38, pct: "1.5%" },
              ]}            />
            {/* SENIOR AMBASSADOR */}
            <RankTierCard
              icon="🥇"
              rank={t(translations, "epTierSenior", "Senior Ambassador")}
              minReload="RM80"
              gradient="linear-gradient(135deg,#3f2a1a,#1e293b)"
              accentColor="#fbbf24"
              isTopRank={false}
              translations={translations}
              requirement={
                <span>
                  {t(translations, "epTierAccumulate", "Accumulate")} <strong>RM3,500</strong> {t(translations, "epTierInMonth", "in overriding incentive within a single month")}
                </span>
              }
              levelRows={[
                { name: t(translations, "epTierLv1_8", "Levels 1–8"), widthPct: 100, pct: t(translations, "epTierIncluded", "Included"), style: "dim" },
                { name: t(translations, "epTierLv913", "Levels 9–13"), widthPct: 25, pct: "1%" },
              ]}            />
            {/* TERRITORY PARTNER */}
            <RankTierCard
              icon="🌏"
              rank={t(translations, "epTierTerritory", "Territory Partner")}
              minReload="RM120"
              gradient="linear-gradient(135deg,#2d1b4e,#1e293b)"
              accentColor="#8b5cf6"
              isTopRank
              translations={translations}
              requirement={
                <span>
                  {t(translations, "epTierAccumulate", "Accumulate")} <strong>RM15,000</strong> {t(translations, "epTierTerritoryReq", "earnings AND have 5 Ambassadors + 2 Senior Ambassadors in downline")}
                </span>
              }
              levelRows={[
                { name: t(translations, "epTierLv1_13", "Levels 1–13"), widthPct: 100, pct: t(translations, "epTierIncluded", "Included"), style: "dim" },
                { name: t(translations, "epTierLvUnlimited", "Unlimited"), widthPct: 25, pct: "1%" },
              ]}            />
          </div>

          <p className="mt-6 text-center text-xs text-foreground-muted">
            {t(translations, "epRankTnc", "*Terms & Conditions Apply.")}
          </p>
        </div>
      </section>

      {/* ── Earning Calculator ── */}
      <EarningCalculator whatsappUrl={WHATSAPP_CALC_URL} translations={translations} />

      {/* ── CTA ── */}
      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t(translations, "epCtaTitle", "BE PART OF EASTEL")}
          </h2>
          <p className="mt-3 text-sm text-foreground-muted">
            {t(
              translations,
              "epCtaSub",
              "Join thousands of Eastelpreners earning while staying connected."
            )}
          </p>
          <Link
            href={`/${locale}/contact`}
            className="mt-8 inline-flex items-center rounded-lg bg-gradient-to-r from-primary to-blue-600 px-7 py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
          >
            {t(translations, "epCtaBtn", "Contact us")}
          </Link>
        </div>
      </section>
      </div>
    </div>
  );
}
