/* NEW-DESIGN: Hero.html faithful — glass cards, aurora, grid-floor, correct CTAs */

import type { Metadata } from "next";
import { PublicPageJsonLd } from "@/components/json-ld";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { buildMetadata } from "@/components/seo-head";
import { SITE_URL } from "@/lib/site";
import { MONTHLY_PLANS } from "@/lib/plans-data";
import { LicensesSection } from "@/components/home/LicensesSection";
import { HomeReviewsCarousel } from "@/components/home/HomeReviewsCarousel";
import { ParticleCanvas } from "@/components/home/ParticleCanvas";
import { HeroSimTilt } from "@/components/home/HeroSimTilt";

interface PageProps { params: Promise<{ locale: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  return buildMetadata({
    title: t(translations, "seoTitleHome", "Eastel SIM cards in Malaysia"),
    description: t(translations, "home.hero.desc", "Buy an Eastel physical SIM card and check your website order. Mobile plans are reference information."),
    locale,
    canonical: `${SITE_URL}/${locale}`,
  });
}

// ── Data ─────────────────────────────────────────────────────────────────────

const HOME_PLAN_IDS = ["ez35", "ez50", "ez98"];
const HOME_PLANS = MONTHLY_PLANS
  .filter((p) => HOME_PLAN_IDS.includes(p.id))
  .sort((a, b) => HOME_PLAN_IDS.indexOf(a.id) - HOME_PLAN_IDS.indexOf(b.id));

function getPlanFeatures(
  plan: (typeof MONTHLY_PLANS)[number],
  translations: Record<string, string>
): string[] {
  const features: string[] = [];
  if (plan.data) {
    features.push(`${plan.data} ${t(translations, 'home.plans.data', 'Data')}`);
  }
  if (plan.calls === "Unlimited") {
    features.push(t(translations, 'plans.featUnlimitedCalls', 'Unlimited Calls'));
  } else if (plan.calls) {
    features.push(plan.calls);
  }
  if (plan.hotspot === "Full Hotspot") {
    features.push(t(translations, 'plans.featUnlimitedHotspot', 'Unlimited Hotspot'));
  } else if (plan.hotspot) {
    const cleanHotspot = plan.hotspot.trim();
    if (cleanHotspot === '100GB Hotspot') {
      features.push(t(translations, 'plans.val100GbHotspot', '100GB Hotspot'));
    } else {
      features.push(plan.hotspot);
    }
  }
  if (plan.roaming) {
    features.push(`${plan.roaming} ${t(translations, 'home.plans.roaming', 'Roaming')}`);
  }
  features.push(t(translations, 'plans.featUMobile5G', 'U Mobile 5G Network'));
  return features;
}

// ── SVG check — exact polyline from Hero.html ─────────────────────────────────

function CheckSVG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--hp-head-2-b)" }} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowSVG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  );
}

function HotspotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/><path d="M16.5 7.5a6.36 6.36 0 0 1 0 9"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function FloatCard({
  className,
  icon,
  title,
  subtitle,
  iconStyle,
  subtitleNode,
}: {
  className: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  iconStyle?: React.CSSProperties;
  subtitleNode?: React.ReactNode;
}) {
  return (
    <div className={`hp-float-card ${className}`}>
      <div className="hp-fc-ico" style={iconStyle}>
        {icon}
      </div>
      <div className="hp-fc-lbl">
        <strong className="hp-fc-t">{title}</strong>
        <span className="hp-fc-s">{subtitleNode || subtitle}</span>
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ translations, locale }: { translations: Record<string, string>; locale: string }) {
  return (
    <section className="hp-stage">
      {/* Particle network canvas — blinking stars / connected nodes */}
      <ParticleCanvas />
      {/* Mouse-tilt effect on SIM card — client only, hover devices only */}
      <HeroSimTilt />
      {/* Aurora — single element, multiple radial-gradients */}
      <div className="hp-aurora" aria-hidden="true" />
      {/* Grid floor with perspective */}
      <div className="hp-grid-floor" aria-hidden="true" />
      {/* Vignette */}
      <div className="hp-vignette" aria-hidden="true" />

      <div className="hp-hero">
        {/* LEFT: copy */}
        <div className="hp-copy">
          {/* Eyebrow: pill + inner gradient chip */}
          <div className="hp-eyebrow">
            <span className="hp-eyebrow-tag">{t(translations, "home.hero.eyebrowTag", "NEW")}</span>
            <span>{t(translations, "home.hero.eyebrowText", "Malaysia’s Best Value SIM")}</span>
          </div>

          <h1 className="hp-h1">
            <span className="hp-accent">{t(translations, "home.hero.titleLine1", "Fast, reliable")}</span>{" "}
            <span className="hp-accent">{t(translations, "home.hero.titleLine3", "internet for ")}</span>{" "}
            <span className="hp-glow">{t(translations, "home.hero.titleLine2", "Malaysia.")}</span>
          </h1>

          <p className="hp-sub">
            {t(translations, "home.hero.desc", "Malaysia's best-value SIM on U Mobile's 5G network. No contract, no hidden fees. From RM15/month.")}
          </p>

          <div className="hp-cta-row">
            <Link href={`/${locale}/order`} className="hp-btn hp-btn-cta hp-btn-primary">
              {t(translations, "home.hero.cta1", "Order Now")}
              <ArrowSVG />
            </Link>
            <Link href={`/${locale}/plans`} className="hp-btn hp-btn-cta hp-btn-ghost">
              {t(translations, "home.hero.cta2", "View Plans")}
            </Link>
          </div>

          <div className="hp-meta-row">
            <div className="hp-stat"><b>SIM</b><span className="hp-stat-l">{t(translations, "home.hero.stat1.label", "Max Data")}</span></div>
            <div className="hp-stat"><b>App</b><span className="hp-stat-l">{t(translations, "home.hero.stat2.label", "U Mobile Network")}</span></div>
            <div className="hp-stat"><b>MY</b><span className="hp-stat-l">{t(translations, "home.hero.stat3.label", "From / Month")}</span></div>
          </div>
        </div>

        {/* RIGHT: SIM + float cards */}
        <div className="hp-product">
          <div className="hp-plinth" aria-hidden="true" />
          <div className="hp-sim-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hp-sim-img"
              src="/images/eastel-simcard.webp"
              alt="Eastel SIM card"
              width={380}
              height={516}
              loading="eager"
              fetchPriority="high"
            />
          </div>

          {/* Floating glass cards */}
          <div className="hp-float-cards">
            <FloatCard
              className="hp-fc1"
              icon={<SignalIcon />}
              title={t(translations, "home.hero.fc1.t", "5G Ready")}
              subtitle={t(translations, "home.hero.fc1.s", "U Mobile · Nationwide")}
            />
            <FloatCard
              className="hp-fc2"
              iconStyle={{ background: "linear-gradient(145deg,rgba(92,255,174,0.18),rgba(93,168,255,0.16))" }}
              icon={<HotspotIcon />}
              title={t(translations, "home.hero.fc2.t", "Full Hotspot")}
              subtitle={t(translations, "home.hero.fc2.s", "Unlimited tethering")}
            />
            <FloatCard
              className="hp-fc3"
              icon={<PhoneIcon />}
              title={t(translations, "home.hero.fc3.t", "Keep Old Number")}
              subtitle={t(translations, "home.hero.fc3.s", "MNP")}
            />
            <FloatCard
              className="hp-fc4"
              icon={<DollarIcon />}
              title={t(translations, "home.hero.fc4.t", "Earn Incentive")}
              subtitleNode={<><span className="hp-live-dot" />{t(translations, "home.hero.fc4.s", "Up to 24% Incentive")}</>}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Plans ─────────────────────────────────────────────────────────────────────

function PlansSection({ translations, locale }: { translations: Record<string, string>; locale: string }) {
  return (
    <>
      <div className="hp-section-divider" />
      <section className="hp-section" id="plans">
        <div className="hp-section-head">
          <div className="hp-section-meta">
            <span className="hp-eyebrow-lbl">{t(translations, 'home.plans.eyebrow', 'Plans')}</span>
            <h2>{t(translations, "home.plans.title", "Curated Connectivity.")}</h2>
            <p className="hp-lede">{t(translations, "home.plans.desc", "Select a plan that aligns with your lifestyle. Transparent pricing, uncompromising quality.")}</p>
          </div>
          <div className="hp-section-meta-r">
            <div className="hp-pill">
              <span className="hp-pill-dot" />
              {t(translations, 'plans.allPlansFeatures', 'Monthly plans include unlimited calls · No contract')}
            </div>
          </div>
        </div>

        <div className="hp-plans-grid">
          {HOME_PLANS.map((plan) => {
            const isPopular = plan.badge === "popular";
            const features = getPlanFeatures(plan, translations);
            return (
              <div key={plan.id} className={`hp-plan${isPopular ? " hp-plan-featured" : ""}`}>
                {isPopular && <div className="hp-ribbon">{t(translations, 'home.plans.mostPopular', 'Most Popular')}</div>}
                <div className="hp-tier">{plan.name}</div>
                <div className="hp-price">
                  <span className="hp-rm">RM</span>
                  <span className="hp-amt">{plan.priceNumeric}</span>
                  <span className="hp-per">
                    {plan.validity === '15 Days' 
                      ? t(translations, 'home.plans.per15Days', '/15 days') 
                      : t(translations, 'home.plans.perMo', '/mo')}
                  </span>
                </div>
                <ul className="hp-feats">
                  {features.map((f) => (
                    <li key={f}><CheckSVG />{f}</li>
                  ))}
                </ul>
                {plan.noteKeys.length > 0 && (
                  <div className="hp-fineprint">
                    {plan.noteKeys.map((nk) => (
                      <p key={nk}>{t(translations, nk, nk)}</p>
                    ))}
                  </div>
                )}
                <Link href={`/${locale}/plans`} className={`hp-btn-plan${isPopular ? " hp-btn-plan-feat" : ""}`}>
                  {t(translations, "home.plans.cta", "Select Plan")}
                  <ArrowSVG />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="hp-view-all">
          <Link href={`/${locale}/plans`} className="hp-btn hp-btn-ghost" style={{ height: "44px", padding: "0 24px" }}>
            {t(translations, "home.plans.viewAll", "View all plans")}
            <ArrowSVG />
          </Link>
        </div>
      </section>
    </>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────────────

function ReviewsSection({ translations }: { translations: Record<string, string> }) {
  return (
    <>
      <div className="hp-section-divider" />
      <section className="hp-section" id="reviews">
        <div className="hp-section-head">
          <div className="hp-section-meta">
            <span className="hp-eyebrow-lbl">{t(translations, 'home.reviews.eyebrow', 'Reviews')}</span>
            <h2>{t(translations, "home.reviews.title", "What customers say.")}</h2>
            <p className="hp-lede">{t(translations, "home.reviews.desc", "Real feedback from real Eastel subscribers.")}</p>
          </div>
        </div>

        <HomeReviewsCarousel reviews={[]} />
      </section>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function HomeStyles() {
  return (
    <style>{`
      /* ═══ TOKEN LAYER — matches Hero.html exactly ═══════════════════════════ */
      :root {
        --hp-bg:#07080d; --hp-bg-1:#0a0c14; --hp-bg-2:#14161e;
        --hp-ink:#eef0fa; --hp-ink-dim:#b1b6c6; --hp-ink-mute:#888ea2; --hp-ink-fine:#c1c6d4;
        --hp-line:rgba(255,255,255,0.07);
        --hp-line-2:rgba(255,255,255,0.14);
        --hp-line-strong:rgba(255,255,255,0.25);
        --hp-glass-bg:rgba(20,22,32,0.55);
        --hp-glass-bg-3:rgba(14,15,22,0.6);
        --hp-glass-border:rgba(255,255,255,0.09);
        --hp-cta-bg:#ffffff; --hp-cta-bg-2:#e9e9f3; --hp-cta-fg:#0a0c14;
        --hp-ghost-hover:rgba(255,255,255,0.04);
        --hp-ghost-hover-border:rgba(255,255,255,0.25);
        --hp-plan-bg-1:rgba(20,22,32,0.75); --hp-plan-bg-2:rgba(12,14,22,0.65);
        --hp-plan-feat-bg-1:#13102e; --hp-plan-feat-bg-2:#0d0b1f;
        --hp-head-1:#ffffff; --hp-head-1-end:#b9a8ff;
        --hp-head-2-a:#b8c8ff; --hp-head-2-b:#8a72ff; --hp-head-2-c:#5da8ff;
        --hp-accent-a:#7a5cff; --hp-accent-b:#5da8ff;
        --hp-accent-soft:#b8c8ff;
        --hp-accent-glow:rgba(122,92,255,0.55);
        --hp-grad:linear-gradient(135deg,#7a5cff,#5da8ff);
        --hp-aurora-1:rgba(122,92,255,0.32); --hp-aurora-2:rgba(93,168,255,0.22);
        --hp-aurora-3:rgba(80,60,200,0.18);  --hp-aurora-4:rgba(122,92,255,0.18);
        --hp-grid-line:rgba(255,255,255,0.045);
        --hp-vignette:rgba(0,0,0,0.6);
        --hp-shadow-card:0 18px 40px rgba(0,0,0,0.45);
        --hp-shadow-sim:drop-shadow(0 50px 80px rgba(0,0,0,0.6)) drop-shadow(0 0 60px rgba(122,92,255,0.35));
        --hp-particle-light:80%;
        --hp-particle-alpha:0.7;
        --hp-particle-glow:0.25;
        --hp-particle-line:0.18;
      }
      [data-theme="light"] {
        --hp-bg:#f5f7fc; --hp-bg-1:#ffffff; --hp-bg-2:#ffffff;
        --hp-ink:#0a0c14; --hp-ink-dim:#4b5365; --hp-ink-mute:#6b7488; --hp-ink-fine:#3e455a;
        --hp-line:rgba(10,12,20,0.07);
        --hp-line-2:rgba(10,12,20,0.14);
        --hp-line-strong:rgba(10,12,20,0.28);
        --hp-glass-bg:rgba(255,255,255,0.72);
        --hp-glass-bg-3:rgba(250,251,255,0.85);
        --hp-glass-border:rgba(10,12,20,0.08);
        --hp-cta-bg:#0a0c14; --hp-cta-bg-2:#1c1f2b; --hp-cta-fg:#ffffff;
        --hp-ghost-hover:rgba(10,12,20,0.04);
        --hp-ghost-hover-border:rgba(10,12,20,0.28);
        --hp-plan-bg-1:rgba(255,255,255,0.92); --hp-plan-bg-2:rgba(248,250,255,0.95);
        --hp-plan-feat-bg-1:#f5f2ff; --hp-plan-feat-bg-2:#ede9ff;
        --hp-head-1:#0a0c14; --hp-head-1-end:#4a3fa5;
        --hp-head-2-a:#4a3fa5; --hp-head-2-b:#5a3ee0; --hp-head-2-c:#2c75d1;
        --hp-accent-soft:#6a5ce0;
        --hp-accent-glow:rgba(122,92,255,0.25);
        --hp-aurora-1:rgba(122,92,255,0.18); --hp-aurora-2:rgba(93,168,255,0.16);
        --hp-aurora-3:rgba(160,120,255,0.10); --hp-aurora-4:rgba(93,168,255,0.10);
        --hp-grid-line:rgba(122,92,255,0.07);
        --hp-vignette:rgba(245,247,255,0.5);
        --hp-shadow-card:0 12px 30px rgba(20,30,80,0.08);
        --hp-shadow-sim:drop-shadow(0 30px 60px rgba(40,30,90,0.22)) drop-shadow(0 0 50px rgba(122,92,255,0.30));
        --hp-particle-light:50%;
        --hp-particle-alpha:0.55;
        --hp-particle-glow:0.18;
        --hp-particle-line:0.12;
      }

      /* ═══ GLOBAL ════════════════════════════════════════════════════════════ */
      /* Match body bg to hp tokens so wide-screen sides don't show a different color */
      body { background: var(--hp-bg); }
      .hp-stage, .hp-section { background: var(--hp-bg); }

      /* ═══ HERO STAGE ════════════════════════════════════════════════════════ */
      .hp-stage {
        position:relative; min-height:100vh; padding-top:64px;
        overflow:hidden; isolation:isolate;
      }
      /* aurora — single element, 4 radial gradients, blurred */
      .hp-aurora {
        position:absolute; inset:-10% -10% -10% -10%; z-index:-3;
        background:
          radial-gradient(70% 55% at 78% 38%, var(--hp-aurora-1), transparent 60%),
          radial-gradient(60% 50% at 65% 75%, var(--hp-aurora-2), transparent 65%),
          radial-gradient(50% 40% at 18% 18%, var(--hp-aurora-3), transparent 70%),
          radial-gradient(80% 60% at 50% 110%, var(--hp-aurora-4), transparent 60%);
        filter:blur(20px);
      }
      /* grid floor — perspective transform */
      .hp-grid-floor {
        position:absolute; inset:auto 0 0 0; height:55%; z-index:-2; pointer-events:none;
        background-image:
          linear-gradient(var(--hp-grid-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--hp-grid-line) 1px, transparent 1px);
        background-size:56px 56px;
        transform:perspective(900px) rotateX(62deg);
        transform-origin:50% 0;
        mask-image:linear-gradient(180deg, transparent 0%, #000 35%, #000 65%, transparent 100%);
        -webkit-mask-image:linear-gradient(180deg, transparent 0%, #000 35%, #000 65%, transparent 100%);
        opacity:.55;
      }
      .hp-vignette {
        position:absolute; inset:0; z-index:-1; pointer-events:none;
        background:radial-gradient(120% 80% at 50% 40%, transparent 50%, var(--hp-vignette) 100%);
      }

      /* ═══ HERO LAYOUT ═══════════════════════════════════════════════════════ */
      .hp-hero {
        position:relative; max-width:1440px; margin:0 auto;
        display:grid; grid-template-columns:1.05fr 1fr;
        gap:48px; padding:88px 64px 64px;
        align-items:center; min-height:calc(100vh - 64px);
      }
      .hp-copy { position:relative; max-width:600px; }

      /* ═══ EYEBROW — pill + inner gradient chip ═══════════════════════════════ */
      .hp-eyebrow {
        display:inline-flex; align-items:center; gap:10px;
        padding:6px 12px 6px 6px;
        border:1px solid var(--hp-line-2); border-radius:999px;
        font-family:'JetBrains Mono',monospace; font-size:11.5px; letter-spacing:0.06em;
        color:var(--hp-ink-dim); text-transform:uppercase;
        margin-bottom:28px; background:var(--hp-ghost-hover);
      }
      .hp-eyebrow-tag {
        background:var(--hp-grad); color:#0a0c14; font-weight:700;
        padding:3px 8px; border-radius:999px; font-size:10px;
      }

      /* ═══ H1 ══════════════════════════════════════════════════════════════ */
      .hp-h1 {
        font-family:var(--font-sans),'Geist',system-ui,sans-serif;
        font-size:clamp(44px, 5.4vw, 78px);
        line-height:1.02; letter-spacing:-0.035em; font-weight:600;
        margin-bottom:22px; text-wrap:balance;
      }
      .hp-accent {
        background:linear-gradient(180deg, var(--hp-head-1) 0%, var(--hp-head-1) 55%, var(--hp-head-1-end) 100%);
        -webkit-background-clip:text; background-clip:text; color:transparent;
      }
      .hp-glow {
        background:linear-gradient(120deg, var(--hp-head-2-a) 0%, var(--hp-head-2-b) 50%, var(--hp-head-2-c) 100%);
        -webkit-background-clip:text; background-clip:text; color:transparent;
      }
      .hp-sub {
        font-size:17px; line-height:1.55; color:var(--hp-ink-dim);
        max-width:520px; margin-bottom:36px; text-wrap:pretty;
      }

      /* ═══ CTAs ══════════════════════════════════════════════════════════════ */
      .hp-cta-row { display:flex; gap:12px; align-items:center; margin-bottom:48px; }
      .hp-btn {
        display:inline-flex; align-items:center; justify-content:center; gap:8px;
        height:38px; padding:0 16px; border-radius:8px;
        font-family:var(--font-sans); font-size:13.5px; font-weight:500;
        border:1px solid transparent; cursor:pointer;
        transition:transform .15s, box-shadow .2s, background .2s, border-color .2s;
        text-decoration:none; color:inherit;
      }
      .hp-btn-ghost {
        background:transparent; color:var(--hp-ink); border-color:var(--hp-line-2);
      }
      .hp-btn-ghost:hover { border-color:var(--hp-ghost-hover-border); background:var(--hp-ghost-hover); }
      /* Primary CTA: white in dark mode, dark in light mode — matches Hero.html */
      .hp-btn-primary {
        background:linear-gradient(180deg, var(--hp-cta-bg) 0%, var(--hp-cta-bg-2) 100%);
        color:var(--hp-cta-fg); border-color:var(--hp-cta-bg);
        box-shadow:0 0 0 1px var(--hp-line-2), 0 8px 30px rgba(122,92,255,0.18);
      }
      .hp-btn-primary:hover { transform:translateY(-1px); box-shadow:0 0 0 1px var(--hp-line-strong),0 14px 40px rgba(122,92,255,0.3); }
      .hp-btn-cta { height:48px; padding:0 22px; font-size:14.5px; border-radius:10px; }

      /* ═══ META ROW (stats) ═══════════════════════════════════════════════════ */
      .hp-meta-row {
        display:flex; gap:28px; align-items:center; flex-wrap:wrap;
        padding-top:28px; border-top:1px solid var(--hp-line);
        font-family:'JetBrains Mono',monospace; font-size:11.5px;
        color:var(--hp-ink-mute); text-transform:uppercase; letter-spacing:0.08em;
      }
      .hp-stat { display:flex; flex-direction:column; gap:4px; }
      .hp-stat b { font-family:var(--font-sans); color:var(--hp-ink); font-size:18px; letter-spacing:-0.02em; font-weight:600; text-transform:none; }
      .hp-stat-l { font-size:10.5px; }

      /* ═══ PRODUCT / SIM ══════════════════════════════════════════════════════ */
      .hp-product {
        position:relative; height:100%;
        display:flex; align-items:center; justify-content:center;
        perspective:1600px;
      }
      .hp-plinth {
        position:absolute; bottom:8%; left:50%; transform:translateX(-50%);
        width:60%; height:40px;
        background:radial-gradient(50% 100% at 50% 0%, var(--hp-accent-glow), transparent 70%);
        filter:blur(20px); z-index:-1;
      }
      .hp-sim-wrap {
        position:relative; width:380px; height:516px;
        animation:hp-float 8s ease-in-out infinite;
      }
      .hp-sim-img {
        position:absolute; inset:0; width:100%; height:100%;
        object-fit:contain; filter:var(--hp-shadow-sim);
      }
      @keyframes hp-float {
        0%,100%{ transform:rotateY(-18deg) rotateX(8deg) translateY(0) }
        50%{ transform:rotateY(-14deg) rotateX(6deg) translateY(-14px) }
      }

      /* ═══ FLOAT CARDS ════════════════════════════════════════════════════════ */
      .hp-float-cards {
        position:absolute; left:50%; top:50%;
        width:380px; height:516px;
        transform:translate(-50%,-50%);
        pointer-events:none;
      }
      .hp-float-card {
        position:absolute;
        background:var(--hp-glass-bg);
        border:1px solid var(--hp-glass-border);
        border-radius:14px;
        backdrop-filter:blur(14px) saturate(120%);
        -webkit-backdrop-filter:blur(14px) saturate(120%);
        padding:14px 16px;
        box-shadow:var(--hp-shadow-card), 0 0 0 1px rgba(255,255,255,0.02) inset;
        color:var(--hp-ink); font-size:12.5px;
        display:flex; align-items:center; gap:14px;
        pointer-events:auto;
      }
      .hp-fc1 { top:6%; left:-6%; animation:hp-bob 7s ease-in-out infinite; }
      .hp-fc2 { top:18%; right:-8%; animation:hp-bob 9s ease-in-out -2s infinite; }
      .hp-fc3 { bottom:22%; left:-10%; animation:hp-bob 8s ease-in-out -4s infinite; }
      .hp-fc4 { bottom:4%; right:-2%; animation:hp-bob 10s ease-in-out -1s infinite; }
      @keyframes hp-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      .hp-fc-ico {
        width:30px; height:30px; border-radius:8px;
        display:grid; place-items:center; flex-shrink:0;
        background:linear-gradient(145deg,rgba(122,92,255,0.22),rgba(93,168,255,0.16));
        border:1px solid var(--hp-line-2); color:var(--hp-accent-soft);
      }
      [data-theme="light"] .hp-fc-ico { color:var(--hp-head-2-b); }
      .hp-fc-lbl { display:flex; flex-direction:column; gap:2px; line-height:1.1; }
      .hp-fc-t { font-weight:600; letter-spacing:-0.005em; }
      .hp-fc-s { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--hp-ink-mute); letter-spacing:0.06em; text-transform:uppercase; }
      .hp-live-dot { display:inline-block; vertical-align:middle; margin-right:5px; width:6px; height:6px; border-radius:50%; background:#00c97a; box-shadow:0 0 6px rgba(0,201,122,0.7); }

      /* ═══ SECTION SYSTEM ═════════════════════════════════════════════════════ */
      .hp-section-divider {
        height:1px; max-width:1440px; margin:0 auto;
        background:linear-gradient(90deg, transparent 0%, var(--hp-line-2) 20%, var(--hp-line-2) 80%, transparent 100%);
      }
      .hp-section {
        position:relative; padding:140px 64px;
        max-width:1440px; margin:0 auto;
      }
      .hp-section-head {
        margin-bottom:64px;
        display:flex; align-items:flex-end; justify-content:space-between;
        gap:48px; flex-wrap:wrap;
      }
      .hp-section-meta { max-width:640px; }
      .hp-section-meta-r { text-align:right; }

      /* Section eyebrow-lbl: gradient text */
      .hp-eyebrow-lbl {
        font-family:'JetBrains Mono',monospace; font-size:11.5px; letter-spacing:0.12em;
        color:transparent; text-transform:uppercase;
        background:linear-gradient(90deg, #b8c8ff 0%, #8a72ff 60%, #5da8ff 100%);
        -webkit-background-clip:text; background-clip:text;
        display:inline-block; margin-bottom:18px;
      }
      .hp-section h2 {
        font-family:var(--font-sans),'Geist',system-ui,sans-serif;
        font-size:clamp(36px, 4vw, 56px); line-height:1.05;
        letter-spacing:-0.035em; font-weight:600;
        color:var(--hp-ink); text-wrap:balance; margin-bottom:18px;
      }
      .hp-lede { color:var(--hp-ink-dim); font-size:17px; line-height:1.55; max-width:560px; text-wrap:pretty; }
      .hp-pill {
        font-family:'JetBrains Mono',monospace;
        font-size:11px; letter-spacing:0.06em; text-transform:uppercase;
        color:var(--hp-ink-dim); padding:6px 10px;
        border:1px solid var(--hp-line-2); border-radius:999px;
        display:inline-flex; align-items:center; gap:6px;
      }
      .hp-pill-dot { width:6px; height:6px; border-radius:50%; background:#5cffae; box-shadow:0 0 8px #5cffae; }
      .hp-mono-note { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--hp-ink-mute); text-transform:uppercase; letter-spacing:0.08em; }

      /* ═══ PLANS ══════════════════════════════════════════════════════════════ */
      .hp-plans-grid {
        display:grid; grid-template-columns:repeat(3,1fr);
        gap:20px; align-items:stretch;
      }
      .hp-plan {
        position:relative;
        background:linear-gradient(180deg, var(--hp-plan-bg-1) 0%, var(--hp-plan-bg-2) 100%);
        border:1px solid var(--hp-line-2); border-radius:18px;
        padding:28px 26px 26px;
        display:flex; flex-direction:column;
        backdrop-filter:blur(12px);
        transition:border-color .2s, transform .2s, box-shadow .2s;
      }
      .hp-plan:hover { border-color:var(--hp-accent-soft); transform:translateY(-2px); box-shadow:var(--hp-shadow-card); }
      /* Featured card: gradient border via ::before mask */
      .hp-plan-featured {
        border-color:transparent;
        background:linear-gradient(180deg, var(--hp-plan-feat-bg-1) 0%, var(--hp-plan-feat-bg-2) 100%);
        backdrop-filter:none; -webkit-backdrop-filter:none;
      }
      /* Featured card hover: force high-contrast text — dark mode white, light mode black */
      .hp-plan-featured:hover .hp-tier,
      .hp-plan-featured:hover .hp-rm,
      .hp-plan-featured:hover .hp-per,
      .hp-plan-featured:hover .hp-feats li,
      .hp-plan-featured:hover .hp-fineprint { color:rgba(255,255,255,0.88); }
      .hp-plan-featured:hover .hp-amt { color:#ffffff; }
      .hp-plan-featured:hover .hp-btn-plan { color:#ffffff; border-color:rgba(255,255,255,0.3); }
      [data-theme="light"] .hp-plan-featured:hover .hp-tier,
      [data-theme="light"] .hp-plan-featured:hover .hp-rm,
      [data-theme="light"] .hp-plan-featured:hover .hp-per,
      [data-theme="light"] .hp-plan-featured:hover .hp-feats li,
      [data-theme="light"] .hp-plan-featured:hover .hp-fineprint { color:rgba(10,12,20,0.88); }
      [data-theme="light"] .hp-plan-featured:hover .hp-amt { color:#0a0c14; }
      [data-theme="light"] .hp-plan-featured:hover .hp-btn-plan { color:#0a0c14; border-color:rgba(10,12,20,0.3); }
      .hp-plan-featured::before {
        content:""; position:absolute; inset:-1px; border-radius:19px; padding:1px;
        background:linear-gradient(135deg, var(--hp-accent-a), var(--hp-accent-b));
        -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite:xor; mask-composite:exclude;
        pointer-events:none;
      }
      .hp-plan-featured::after {
        content:""; position:absolute; inset:-30px; z-index:-1; border-radius:30px;
        background:radial-gradient(50% 50% at 50% 50%, rgba(122,92,255,0.22), transparent 70%);
        filter:blur(12px);
      }
      /* Ribbon: left-aligned, not centered */
      .hp-ribbon {
        position:absolute; top:-12px; left:26px;
        background:linear-gradient(135deg, var(--hp-accent-a), var(--hp-accent-b));
        color:#fff; font-family:'JetBrains Mono',monospace; font-weight:700;
        font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase;
        padding:6px 10px; border-radius:6px;
        box-shadow:0 6px 20px rgba(122,92,255,0.45);
      }
      .hp-tier {
        font-family:'JetBrains Mono',monospace; font-size:11.5px; letter-spacing:0.12em;
        color:var(--hp-head-2-b); text-transform:uppercase; margin-bottom:14px;
      }
      .hp-price {
        display:flex; align-items:baseline; gap:6px;
        padding-bottom:22px; border-bottom:1px solid var(--hp-line); margin-bottom:22px;
      }
      .hp-rm { font-family:var(--font-sans); font-size:16px; color:var(--hp-ink-dim); font-weight:500; }
      .hp-amt { font-family:var(--font-sans); font-size:64px; line-height:1; letter-spacing:-0.04em; font-weight:600; color:var(--hp-ink); }
      .hp-per { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--hp-ink-mute); text-transform:uppercase; letter-spacing:0.08em; margin-left:4px; }
      .hp-feats {
        list-style:none; padding:0; margin:0 0 22px; display:flex; flex-direction:column; gap:12px; flex-grow:1;
      }
      .hp-feats li { display:flex; align-items:flex-start; gap:10px; font-size:14.5px; color:var(--hp-ink); line-height:1.45; }
      .hp-fineprint { font-size:12.5px; color:var(--hp-ink-fine); line-height:1.55; margin-bottom:22px; letter-spacing:-0.005em; }
      .hp-fineprint p { margin:4px 0; display:flex; gap:6px; }
      .hp-fineprint p::before { content:"*"; color:var(--hp-ink-mute); flex:none; }
      .hp-btn-plan {
        width:100%; height:48px; border-radius:10px; cursor:pointer;
        font-family:var(--font-sans); font-weight:500; font-size:14px;
        border:1px solid var(--hp-line-2); background:transparent; color:var(--hp-ink);
        display:flex; align-items:center; justify-content:center; gap:8px;
        transition:all .2s; text-decoration:none; margin-top:auto;
      }
      .hp-btn-plan:hover { border-color:var(--hp-ghost-hover-border); background:var(--hp-ghost-hover); }
      .hp-btn-plan-feat {
        background:linear-gradient(180deg, var(--hp-cta-bg) 0%, var(--hp-cta-bg-2) 100%);
        color:var(--hp-cta-fg); border-color:var(--hp-cta-bg);
        box-shadow:0 8px 30px rgba(122,92,255,0.3);
      }
      .hp-btn-plan-feat:hover { transform:translateY(-1px); }
      .hp-view-all { margin-top:36px; display:flex; justify-content:center; }

      /* ═══ CERTS ══════════════════════════════════════════════════════════════ */
      .hp-certs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; align-items:stretch; }
      .hp-cert {
        position:relative; overflow:hidden;
        background:linear-gradient(180deg, var(--hp-glass-bg), var(--hp-glass-bg-3));
        border:1px solid var(--hp-line-2); border-radius:18px;
        padding:36px 32px; backdrop-filter:blur(12px);
        display:flex; flex-direction:column; gap:18px;
      }
      /* uniform subtle accent line — not per-cert colored */
      .hp-cert::before {
        content:""; position:absolute; top:-1px; left:-1px; right:-1px; height:2px;
        background:linear-gradient(90deg, transparent, var(--hp-accent-soft), transparent);
        opacity:.5;
      }
      .hp-cert-ico-lg {
        width:52px; height:52px; border-radius:14px;
        display:grid; place-items:center;
        background:linear-gradient(145deg,rgba(122,92,255,0.18),rgba(93,168,255,0.12));
        border:1px solid var(--hp-line-2); color:var(--hp-head-2-b);
        box-shadow:inset 0 0 20px rgba(122,92,255,0.12);
      }
      .hp-cert-img-wrap {
        width:100%; height:180px; border-radius:10px; overflow:hidden;
        background:rgba(255,255,255,0.04); border:1px solid var(--hp-line-2);
        flex-shrink:0;
      }
      .hp-cert-img {
        width:100%; height:100%; object-fit:contain; object-position:center;
        display:block;
      }
      .hp-cert-h3 { font-family:var(--font-sans),'Geist',system-ui; font-size:22px; letter-spacing:-0.02em; font-weight:600; color:var(--hp-ink); line-height:1.2; margin:0; }
      .hp-cert-p { font-size:14.5px; color:var(--hp-ink-dim); line-height:1.55; margin:0; flex-grow:1; }
      .hp-cert-stamp {
        margin-top:6px;
        font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--hp-ink-fine);
        text-transform:uppercase; letter-spacing:0.1em;
        display:flex; align-items:center; gap:8px;
        padding-top:16px; border-top:1px solid var(--hp-line);
      }
      .hp-stamp-dot { width:6px; height:6px; border-radius:50%; background:#00c97a; box-shadow:0 0 8px rgba(0,201,122,0.6); flex-shrink:0; }

      /* ═══ RESPONSIVE ════════════════════════════════════════════════════════ */
      @media (max-width:1100px){
        .hp-hero{padding:72px 40px 56px; gap:32px}
        .hp-product{height:auto; min-height:520px}
        .hp-sim-wrap{width:320px; height:434px}
        .hp-float-cards{width:320px; height:434px}
        .hp-section{padding:110px 40px}
      }
      @media (max-width:820px){
        .hp-plans-grid,.hp-certs-grid{grid-template-columns:repeat(2,1fr)}
        .hp-plan-featured{grid-column:span 2}
      }
      @media (max-width:900px){
        .hp-hero{grid-template-columns:1fr; padding:56px 32px; gap:24px; min-height:auto}
        .hp-copy{margin:24px 0}
        .hp-product{height:auto; min-height:0; padding:24px 0; flex-direction:column; align-items:center; gap:28px}
        .hp-sim-wrap{width:min(280px,70vw); height:calc(min(280px,70vw)*1.354); animation-name:hp-float-flat}
        @keyframes hp-float-flat{0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)}}
        .hp-float-cards{position:static;transform:none;width:100%;max-width:460px;height:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;pointer-events:auto}
        .hp-float-card{position:static !important; top:auto !important; left:auto !important; right:auto !important; bottom:auto !important; animation:none !important; border-radius:12px}
        .hp-section-head{flex-direction:column; align-items:flex-start; gap:16px}
      }
      @media (max-width:768px){
        .hp-hero{padding:32px 20px 24px}
        .hp-h1{font-size:clamp(32px,8.5vw,46px)}
        .hp-sub{font-size:15.5px}
        .hp-cta-row{flex-direction:column; align-items:stretch; gap:10px; margin-bottom:36px}
        .hp-cta-row .hp-btn{width:100%}
        .hp-meta-row{flex-wrap:wrap; gap:16px}
        .hp-section{padding:72px 20px}
        .hp-section h2{font-size:clamp(28px,7vw,40px)}
        .hp-lede{font-size:15.5px}
        .hp-plans-grid,.hp-certs-grid{grid-template-columns:1fr; gap:16px}
        .hp-plan-featured{grid-column:auto}
        .hp-plan{padding:24px 20px}
        .hp-amt{font-size:52px}
        .hp-cert,.hp-review{padding:28px 22px}
        .hp-section-meta-r{text-align:left}
      }
      @media (max-width:480px){
        .hp-hero{padding:24px 16px 16px}
        .hp-h1{font-size:clamp(30px,8.5vw,40px); letter-spacing:-0.03em}
        .hp-eyebrow{font-size:10.5px; padding:5px 10px 5px 5px; margin-bottom:22px}
        .hp-product{min-height:0; padding:16px 0; gap:22px}
        .hp-sim-wrap{width:min(220px,60vw); height:calc(min(220px,60vw)*1.354)}
        .hp-float-cards{grid-template-columns:1fr 1fr; gap:8px}
        .hp-meta-row{padding-top:22px; gap:14px 22px}
        .hp-stat b{font-size:15px}
        .hp-stat-l{font-size:10px}
        .hp-section{padding:56px 16px}
        .hp-plan{padding:22px 18px}
        .hp-amt{font-size:46px}
        .hp-cert{padding:24px 18px}
      }
    `}</style>
  );
}

import { headers } from "next/headers";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  const translations = await getTranslations(locale as Locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <HomeStyles />
      <PublicPageJsonLd translations={translations} locale={locale} path=""
        title={t(translations, "seoTitleHome")} description={t(translations, "home.hero.desc")} nonce={nonce} />
      <Hero translations={translations} locale={locale} />
      <PlansSection translations={translations} locale={locale} />
      <LicensesSection translations={translations} />
      <ReviewsSection translations={translations} />
    </>
  );
}
