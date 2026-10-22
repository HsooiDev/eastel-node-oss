"use client";

import { useState } from "react";
import { getRegistrationEarnings } from "@/lib/earning-calculator";

type Translations = Record<string, string>;
function tr(translations: Translations, key: string, fallback: string): string {
  return translations?.[key] ?? fallback;
}

type RankKey = "elite" | "ambassador" | "senior" | "territory";
type RegType = "new" | "mnp" | "mix";

const BASE_RANK_CONFIG: Record<
  RankKey,
  { icon: string; sub: string; g1: boolean; g2: boolean; g3: boolean; labelKey: string; subKey: string; descKey: string; descFallback: string }
> = {
  elite: {
    icon: "💎",
    labelKey: "epCalcRankElite",
    sub: "Lv 1–3",
    subKey: "epCalcRankSub1",
    g1: false, g2: false, g3: false,
    descKey: "epCalcRankDesc1",
    descFallback: "Elite earns on <strong>Levels 1–3</strong> of your reload network.",
  },
  ambassador: {
    icon: "🏅",
    labelKey: "epCalcRankAmb",
    sub: "Lv 1–8 | +1.5%",
    subKey: "epCalcRankSub2",
    g1: true, g2: false, g3: false,
    descKey: "epCalcRankDesc2",
    descFallback: "Ambassador earns on <strong>Levels 1–8</strong>. Levels 4–8 each earn 1.5%.",
  },
  senior: {
    icon: "🥇",
    labelKey: "epCalcRankSenior",
    sub: "Lv 1–13 | +1%",
    subKey: "epCalcRankSub3",
    g1: true, g2: true, g3: false,
    descKey: "epCalcRankDesc3",
    descFallback: "Senior Ambassador earns on <strong>Levels 1–13</strong>. Levels 9–13 each earn 1%.",
  },
  territory: {
    icon: "🌏",
    labelKey: "epCalcRankTerritory",
    sub: "Unlimited | 1%",
    subKey: "epCalcRankSub4",
    g1: true, g2: true, g3: true,
    descKey: "epCalcRankDesc4",
    descFallback: "Territory Partner earns on <strong>unlimited levels</strong>. Level 14+ earns 1%.",
  },
};

function fmt(v: number) {
  return (
    "RM " +
    v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function Slider({
  label,
  badge,
  badgeColor,
  value,
  min,
  max,
  step = 1,
  onChange,
  minLabel,
  maxLabel,
  prefix,
}: {
  label: string;
  badge?: string;
  badgeColor?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  minLabel?: string;
  maxLabel?: string;
  prefix?: string;
}) {
  const pct = max > min ? Math.round(((value - min) / (max - min)) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-[13px] font-semibold truncate" style={{ color: "var(--calc-label)" }}>
            {label}
          </span>
          {badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={
                badgeColor === "l2"
                  ? { background: "rgba(20,184,166,0.2)", color: "#5eead4" }
                  : badgeColor === "l3"
                  ? { background: "rgba(249,115,22,0.2)", color: "#fdba74" }
                  : badgeColor === "lx"
                  ? { background: "rgba(168,85,247,0.2)", color: "#d8b4fe" }
                  : { background: "rgba(99,102,241,0.25)", color: "#a5b4fc" }
              }
            >
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end">
          {prefix && (
            <span className="text-lg font-bold mr-1" style={{ color: "#a78bfa" }}>
              {prefix}
            </span>
          )}
          <input
            type="number"
            value={value.toString()}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : 0;
              onChange(isNaN(val) ? 0 : val);
            }}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : 0;
              onChange(isNaN(val) ? min : Math.min(max, Math.max(min, val)));
            }}
            className="w-[70px] bg-transparent text-right text-lg font-bold outline-none"
            style={{ color: "#a78bfa" }}
            min={min}
            max={max}
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-full appearance-none cursor-pointer outline-none"
        style={{
          height: "6px",
          background: `linear-gradient(to right, #7c3aed ${pct}%, var(--calc-track) ${pct}%)`,
        }}
      />
      <div
        className="flex justify-between px-1 text-[10px] font-semibold"
        style={{ color: "var(--calc-hint)" }}
      >
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? max.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function EarningCalculator({
  whatsappUrl = "https://wa.me/601175999733?text=Hi%2C%20I%27d%20like%20to%20know%20more%20about%20the%20Eastelpreneur%20Programme!",
  translations = {} as Translations,
}: {
  whatsappUrl?: string;
  translations?: Translations;
} = {}) {
  const [rank, setRank] = useState<RankKey>("elite");
  const [l1, setL1] = useState(20);
  const [l2, setL2] = useState(50);
  const [l3, setL3] = useState(100);
  const [g1, setG1] = useState(0);
  const [g2, setG2] = useState(0);
  const [g3, setG3] = useState(0);
  const [avgReload, setAvgReload] = useState(50);
  const [regCount, setRegCount] = useState(10);
  const [regType, setRegType] = useState<RegType>("new");

  const RANK_CONFIG = Object.fromEntries(
    Object.entries(BASE_RANK_CONFIG).map(([k, v]) => [
      k,
      {
        ...v,
        label: tr(translations, v.labelKey, v.icon + " " + k.charAt(0).toUpperCase() + k.slice(1)),
        sub: tr(translations, v.subKey, v.sub),
        desc: tr(translations, v.descKey, v.descFallback),
      },
    ])
  ) as unknown as Record<RankKey, { icon: string; sub: string; g1: boolean; g2: boolean; g3: boolean; label: string; desc: string }>;

  const cfg = RANK_CONFIG[rank];

  const earn1 = l1 * avgReload * 0.13;
  const earn2 = l2 * avgReload * 0.03;
  const earn3 = l3 * avgReload * 0.08;
  const earnG1 = cfg.g1 ? g1 * avgReload * 0.015 : 0;
  const earnG2 = cfg.g2 ? g2 * avgReload * 0.01 : 0;
  const earnG3 = cfg.g3 ? g3 * avgReload * 0.01 : 0;
  const earnReg = getRegistrationEarnings(regCount, regType);
  const totalMonthly = earn1 + earn2 + earn3 + earnG1 + earnG2 + earnG3 + earnReg;
  const totalAnnual = totalMonthly * 12;

  const WHATSAPP_URL = whatsappUrl;

  return (
    <section className="py-16 sm:py-20" id="calculator">
      <style>{`
        #calculator {
          --calc-label: rgba(255,255,255,0.82);
          --calc-hint: rgba(255,255,255,0.5);
          --calc-sect: rgba(255,255,255,0.35);
          --calc-input-bg: transparent;
          --calc-input-border: rgba(255,255,255,0.09);
          --calc-info-bg: rgba(124,58,237,0.08);
          --calc-info-border: rgba(124,58,237,0.22);
          --calc-info-color: rgba(255,255,255,0.75);
          --calc-badge-bg: linear-gradient(135deg,rgba(124,58,237,0.3),rgba(16,185,129,0.2));
          --calc-badge-border: rgba(124,58,237,0.5);
          --calc-badge-color: #c4b5fd;
          --calc-result-bg: transparent;
          --calc-result-border: rgba(124,58,237,0.3);
          --calc-result-top-bg: transparent;
          --calc-result-amount-bg: linear-gradient(135deg,#c4b5fd 0%,#34d399 100%);
          --calc-result-sep: rgba(255,255,255,0.06);
          --calc-result-meta: rgba(255,255,255,0.5);
          --calc-result-strong: rgba(255,255,255,0.92);
          --calc-result-pill-bg: rgba(255,255,255,0.07);
          --calc-result-pill-border: rgba(255,255,255,0.1);
          --calc-breakdown-sep: rgba(255,255,255,0.06);
          --calc-breakdown-label: rgba(255,255,255,0.65);
          --calc-edit-btn: rgba(255,255,255,0.85);
          --calc-track: rgba(255,255,255,0.12);
          --calc-disc: rgba(255,255,255,0.22);
          --calc-btn-bg: rgba(255,255,255,0.05);
          --calc-btn-border: rgba(255,255,255,0.1);
          --calc-active-sub: rgba(196,181,253,0.9);
        }
        [data-theme='light'] #calculator {
          --calc-label: #1e1b4b;
          --calc-hint: #6b7280;
          --calc-sect: #374151;
          --calc-input-bg: transparent;
          --calc-input-border: #d1d5db;
          --calc-info-bg: rgba(124,58,237,0.06);
          --calc-info-border: rgba(124,58,237,0.18);
          --calc-info-color: #4b5563;
          --calc-badge-bg: linear-gradient(135deg,rgba(124,58,237,0.1),rgba(16,185,129,0.1));
          --calc-badge-border: rgba(124,58,237,0.3);
          --calc-badge-color: #6d28d9;
          --calc-result-bg: transparent;
          --calc-result-border: rgba(124,58,237,0.2);
          --calc-result-top-bg: transparent;
          --calc-result-amount-bg: linear-gradient(135deg,#6d28d9 0%,#059669 100%);
          --calc-result-sep: rgba(0,0,0,0.07);
          --calc-result-meta: #4b5563;
          --calc-result-strong: #111827;
          --calc-result-pill-bg: rgba(0,0,0,0.04);
          --calc-result-pill-border: rgba(0,0,0,0.08);
          --calc-breakdown-sep: rgba(0,0,0,0.06);
          --calc-breakdown-label: #374151;
          --calc-edit-btn: #7c3aed;
          --calc-track: #e5e7eb;
          --calc-disc: #6b7280;
          --calc-btn-bg: #f3f4f6;
          --calc-btn-border: #e5e7eb;
          --calc-active-sub: #6d28d9;
        }
      `}</style>
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 text-center">
          <span
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{
              background: "var(--calc-badge-bg)",
              borderColor: "var(--calc-badge-border)",
              color: "var(--calc-badge-color)",
            }}
          >
            {tr(translations, "epCalcV2Label", "Earning Calculator")}
          </span>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {tr(translations, "epCalcV2Title", "Estimate Your Monthly Income")}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-foreground-muted">
            {tr(translations, "epCalcV2Sub", "Adjust the controls below to model your network — earnings update in real time.")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            {/* LEFT: INPUTS */}
            <div
              className="rounded-2xl p-7 flex flex-col gap-5 bg-surface"
              style={{
                border: "1px solid var(--calc-input-border)",
              }}
            >
              {/* Rank selector */}
              <div>
                <p
                  className="mb-3 text-[13px] font-semibold"
                  style={{ color: "var(--calc-label)" }}
                >
                  {tr(translations, "epCalcV2RankHead", "Your Current Rank")}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.entries(RANK_CONFIG) as [RankKey, typeof RANK_CONFIG[RankKey]][]).map(
                    ([key, rc]) => (
                      <button
                        key={key}
                        onClick={() => setRank(key)}
                        className="flex flex-col items-center justify-center rounded-[10px] px-2 py-2.5 text-center transition-all min-h-[52px]"
                        style={
                          rank === key
                            ? {
                                background: "transparent",
                                border: "1px solid rgba(124,58,237,0.6)",
                                color: "var(--calc-label)",
                                boxShadow: "0 0 0 3px rgba(124,58,237,0.12)",
                              }
                            : {
                                background: "var(--calc-btn-bg)",
                                border: "1px solid var(--calc-btn-border)",
                                color: "var(--calc-hint)",
                              }
                        }
                      >
                        <span className="text-[11px] font-bold leading-tight">
                          {rc.label}
                        </span>
                        <span
                          className="mt-0.5 text-[8.5px] font-semibold leading-snug"
                          style={{
                            color:
                              rank === key
                                ? "var(--calc-active-sub)"
                                : "var(--calc-hint)",
                          }}
                        >
                          {rc.sub}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Rank info */}
              <div
                className="flex gap-2 rounded-[10px] px-3.5 py-2.5 text-[11px] font-semibold leading-relaxed"
                style={{
                  background: "var(--calc-info-bg)",
                  border: "1px solid var(--calc-info-border)",
                  color: "var(--calc-info-color)",
                }}
                dangerouslySetInnerHTML={{ __html: "ℹ️ " + cfg.desc }}
              />

              <hr style={{ borderColor: "var(--calc-input-border)" }} />

              {/* Reload incentive section */}
              <p
                className="text-[9px] font-bold uppercase tracking-[3px]"
                style={{ color: "var(--calc-hint)" }}
              >
                {tr(translations, "epCalcV2ReloadHead", "Reload Incentive Network")}
              </p>

              <Slider
                label={tr(translations, "epCalcV2L1", "Level 1 Members")}
                badge="13%"
                value={l1}
                min={0}
                max={500}
                onChange={setL1}
                maxLabel="500"
              />
              <Slider
                label={tr(translations, "epCalcV2L2", "Level 2 Members")}
                badge="3%"
                badgeColor="l2"
                value={l2}
                min={0}
                max={1000}
                onChange={setL2}
                maxLabel="1,000"
              />
              <Slider
                label={tr(translations, "epCalcV2L3", "Level 3 Members")}
                badge="8%"
                badgeColor="l3"
                value={l3}
                min={0}
                max={5000}
                onChange={setL3}
                maxLabel="5,000"
              />

              {cfg.g1 && (
                <Slider
                  label={tr(translations, "epCalcV2G1", "Level 4–8 Members")}
                  badge="1.5%"
                  badgeColor="lx"
                  value={g1}
                  min={0}
                  max={9999}
                  onChange={setG1}
                  maxLabel="9,999"
                />
              )}
              {cfg.g2 && (
                <Slider
                  label={tr(translations, "epCalcV2G2", "Level 9–13 Members")}
                  badge="1%"
                  badgeColor="lx"
                  value={g2}
                  min={0}
                  max={9999}
                  onChange={setG2}
                  maxLabel="9,999"
                />
              )}
              {cfg.g3 && (
                <Slider
                  label={tr(translations, "epCalcV2G3", "Level 14+ Members")}
                  badge="1%"
                  badgeColor="lx"
                  value={g3}
                  min={0}
                  max={9999}
                  onChange={setG3}
                  maxLabel="9,999"
                />
              )}

              <Slider
                label={tr(translations, "epCalcV2Avg", "Avg. Monthly Reload / Member")}
                value={avgReload}
                min={35}
                max={500}
                onChange={setAvgReload}
                minLabel="RM 35"
                maxLabel="RM 500"
                prefix="RM "
              />

              <hr style={{ borderColor: "var(--calc-input-border)" }} />

              {/* Registration bonus */}
              <p
                className="text-[9px] font-bold uppercase tracking-[3px]"
                style={{ color: "var(--calc-hint)" }}
              >
                {tr(translations, "epCalcV2RegHead", "Registration Bonus")}
              </p>

              <Slider
                label={tr(translations, "epCalcV2RegCount", "Monthly New Registrations")}
                value={regCount}
                min={0}
                max={500}
                onChange={setRegCount}
                maxLabel="500"
              />

              <div>
                <p
                  className="mb-2 text-[13px] font-semibold"
                  style={{ color: "var(--calc-label)" }}
                >
                  {tr(translations, "epCalcV2RegType", "Registration Type")}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {(
                    [
                      { key: "new" as RegType, label: tr(translations, "epCalcV2TypeNew", "New SIM") },
                      { key: "mnp" as RegType, label: tr(translations, "epCalcV2TypeMnp", "MNP Port-In") },
                      { key: "mix" as RegType, label: tr(translations, "epCalcV2TypeMix", "Mixed (50/50)") },
                    ]
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setRegType(key)}
                      className="rounded-[10px] px-3.5 py-2 text-[12px] font-bold transition-all"
                      style={
                        regType === key
                          ? {
                              background: "rgba(16,185,129,0.14)",
                              border: "1px solid rgba(16,185,129,0.5)",
                              color: "#6ee7b7",
                              boxShadow: "0 0 0 3px rgba(16,185,129,0.08)",
                            }
                          : {
                              background: "var(--calc-btn-bg)",
                              border: "1px solid var(--calc-btn-border)",
                              color: "var(--calc-hint)",
                            }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: RESULTS */}
            <div
              className="rounded-2xl overflow-hidden bg-surface"
              style={{
                border: "1px solid var(--calc-result-border)",
                boxShadow: "0 20px 50px rgba(124,58,237,0.18)",
              }}
            >
              {/* Total */}
              <div
                className="px-6 pb-6 pt-8 text-center relative overflow-hidden bg-surface-alt"
                style={{
                  borderBottom: "1px solid var(--calc-result-sep)",
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{
                    background: "linear-gradient(90deg,#7c3aed,#10b981,#7c3aed)",
                  }}
                />
                <p
                  className="mb-2.5 text-[9px] font-bold uppercase tracking-[3px]"
                  style={{ color: "var(--calc-result-meta)" }}
                >
                  {tr(translations, "epCalcV2TotalLabel", "Total Monthly Earnings")}
                </p>
                <p
                  className="text-5xl font-black leading-none tracking-tight"
                  style={{
                    background: "var(--calc-result-amount-bg)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {fmt(totalMonthly)}
                </p>
                <p
                  className="mt-1.5 text-[11px] font-semibold"
                  style={{ color: "var(--calc-result-meta)" }}
                >
                  {tr(translations, "epCalcV2TotalNote", "estimated per month")}
                </p>
                <div
                  className="mt-3 flex items-center justify-center gap-2 px-3.5 py-1.5"
                >
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: "var(--calc-result-meta)" }}
                  >
                    {tr(translations, "epCalcV2AnnualLabel", "Annual Projection")}
                  </span>
                  <span
                    className="text-[13px] font-black"
                    style={{ color: "var(--calc-result-strong)" }}
                  >
                    {fmt(totalAnnual)}
                  </span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="px-5 pb-1.5 pt-4">
                <p
                  className="mb-3 text-[9px] font-bold uppercase tracking-[2.5px]"
                  style={{ color: "var(--calc-result-meta)" }}
                >
                  {tr(translations, "epCalcV2BkTitle", "Earnings Breakdown")}
                </p>
                {[
                  { dot: "#818cf8", label: tr(translations, "epCalcV2Bk1", "Reload — Level 1 (13%)"), amt: earn1 },
                  { dot: "#2dd4bf", label: tr(translations, "epCalcV2Bk2", "Reload — Level 2 (3%)"), amt: earn2 },
                  { dot: "#fb923c", label: tr(translations, "epCalcV2Bk3", "Reload — Level 3 (8%)"), amt: earn3 },
                  ...(cfg.g1 || cfg.g2 || cfg.g3
                    ? [
                        {
                          dot: "#a78bfa",
                          label: tr(translations, "epCalcV2BkLx", "Reload — Deep Levels"),
                          amt: earnG1 + earnG2 + earnG3,
                        },
                      ]
                    : []),
                  { dot: "#34d399", label: tr(translations, "epCalcV2RegHead", "Registration Bonus"), amt: earnReg },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: "1px solid var(--calc-breakdown-sep)" }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: row.dot,
                          boxShadow: `0 0 5px ${row.dot}`,
                        }}
                      />
                      <span
                        className="text-[11px] font-semibold truncate"
                        style={{ color: "var(--calc-breakdown-label)" }}
                      >
                        {row.label}
                      </span>
                    </div>
                    <span
                      className="text-[13px] font-bold whitespace-nowrap"
                      style={{ color: "var(--calc-result-strong)" }}
                    >
                      {fmt(row.amt)}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-5 pb-5 pt-4">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold text-white transition-all"
                  style={{
                    background: "linear-gradient(135deg,#25d366,#128c7e)",
                    boxShadow: "0 8px 22px rgba(37,211,102,0.32)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.046 22l4.96-1.37A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.66 0-3.21-.49-4.5-1.33l-.32-.19-3.32.92.89-3.25-.21-.34A7.963 7.963 0 014 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z" />
                  </svg>
                  {tr(translations, "epCalcV2Cta", "Start Earning Today")}
                </a>
                <p
                  className="mt-3 text-center text-[10px] leading-relaxed"
                  style={{ color: "var(--calc-disc)" }}
                >
                  {tr(translations, "epCalcV2Disc", "* Estimates only. Actual earnings depend on network activity & T&C. Deep-level rates are indicative.")}
                </p>
              </div>
            </div>
        </div>
      </div>
    </section>
  );
}
