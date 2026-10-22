'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Plan } from '@/lib/plans-data';
import { t } from '@/lib/i18n';

/* ---------- Spring physics ---------- */
function makeSpring(stiffness = 140, damping = 18, mass = 1, init = 0) {
  let v = init, target = init, vel = 0;
  return {
    setTarget(x: number) { target = x; },
    getValue()            { return v; },
    jump(x: number)       { v = target = x; vel = 0; },
    step(dt: number) {
      const f = -stiffness * (v - target) - damping * vel;
      vel += (f / mass) * dt;
      v   += vel * dt;
    },
  };
}

/* ---------- Tier metadata per plan id ---------- */
const TIER_INFO: Record<string, { label: string; tier: string; taglineKey: string; taglineFallback: string }> = {
  ez15:   { label: '01', tier: 'BASIC',      taglineKey: 'home.plans.tagline.ez15',   taglineFallback: 'Entry-level signal.' },
  ez35:   { label: '02', tier: 'STANDARD',   taglineKey: 'home.plans.tagline.ez35',   taglineFallback: 'Daily use, no fuss.' },
  ez50:   { label: '03', tier: 'PRO',        taglineKey: 'home.plans.tagline.ez50',   taglineFallback: 'Most-picked, ready for anything.' },
  ez68:   { label: '04', tier: 'ELITE',      taglineKey: 'home.plans.tagline.ez68',   taglineFallback: 'Power-user bandwidth.' },
  ez98:   { label: '05', tier: 'ULTRA',      taglineKey: 'home.plans.tagline.ez98',   taglineFallback: 'No ceiling. No throttle.' },
  ezday:  { label: '01', tier: 'DAILY',      taglineKey: 'home.plans.tagline.ezday',  taglineFallback: 'One day. Full speed.' },
  ezweek: { label: '02', tier: 'WEEKLY',     taglineKey: 'home.plans.tagline.ezweek', taglineFallback: 'A week of signal.' },
  ezyear: { label: '03', tier: 'ANNUAL',     taglineKey: 'home.plans.tagline.ezyear', taglineFallback: 'Year-round, always on.' },
  ez365d: { label: '04', tier: 'ANNUAL MAX', taglineKey: 'home.plans.tagline.ez365d', taglineFallback: 'Heavy data, annual rate.' },
};

function dataToBars(data: string): number {
  const s = data.toLowerCase();
  if (s.includes('999') || s.includes('unlimited')) return 27;
  const n = parseInt(data, 10);
  if (n >= 700) return 22;
  if (n >= 500) return 17;
  if (n >= 240) return 14;
  if (n >= 200) return 12;
  if (n >= 30)  return 6;
  if (n >= 10)  return 4;
  return 3;
}

function priceSuffixKey(validity: string): { key: string; fallback: string } {
  if (validity === '1 Day')        return { key: 'home.plans.perDay', fallback: '/day' };
  if (validity === '7 Days')       return { key: 'home.plans.perWk',  fallback: '/wk'  };
  if (validity === '15 Days')      return { key: 'home.plans.per15Days', fallback: '/15 days' };
  if (validity === '365 Days' || validity.includes('x 12'))   return { key: 'home.plans.perYr',  fallback: '/yr'  };
  return                                  { key: 'home.plans.perMo',  fallback: '/mo'  };
}

/* ---------- Component ---------- */
interface PlanCardProps {
  plan: Plan;
  locale: string;
  translations: Record<string, string>;
}

export function PlanCard({ plan, locale, translations }: PlanCardProps) {
  const cardRef   = useRef<HTMLElement>(null);
  const bwRef     = useRef<HTMLDivElement>(null);
  const bwFilled  = dataToBars(plan.data);
  const bwTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef    = useRef<number>(0);
  // Initialized to 0 (pure); the RAF scheduler seeds the real timestamp
  // before the first loop tick, so this value is never actually used.
  const lastRef   = useRef<number>(0);

  // Spring state lives in a ref (not state) to avoid re-renders
  const sp = useRef({
    rx:  makeSpring(140, 18, 1, 0),
    ry:  makeSpring(140, 18, 1, 0),
    rz:  makeSpring(200, 24, 1, 0),
    mx:  makeSpring(260, 30, 1, 50),
    my:  makeSpring(260, 30, 1, 50),
  });

  const isFeatured  = plan.badge === 'popular';
  const meta        = TIER_INFO[plan.id] ?? { label: '01', tier: 'PLAN', taglineKey: '', taglineFallback: '' };
  const priceNum    = plan.price.replace('RM', '');
  const suffixInfo  = priceSuffixKey(plan.validity);
  const suffix      = t(translations, suffixInfo.key, suffixInfo.fallback);

  const translatePlanValue = (val: string | null) => {
    if (!val) return '';
    const cleanVal = val.trim();
    const mapping: Record<string, string> = {
      'Unlimited': 'plans.valUnlimited',
      'Full Hotspot': 'plans.valFullHotspot',
      '1 Day': 'plans.val1Day',
      '7 Days': 'plans.val7Days',
      '15 Days': 'plans.val15Days',
      '30 Days': 'plans.val30Days',
      '365 Days': 'plans.val365Days',
      '30 Days x 12': 'plans.val30DaysX12',
      '30 Mins': 'plans.val30Mins',
      '30 Mins/Month': 'plans.val30MinsPerMonth',
      '1GB/Month': 'plans.val1GbPerMonth',
      '20GB/Month': 'plans.val20GbPerMonth',
      '100GB Hotspot': 'plans.val100GbHotspot'
    };
    const key = mapping[cleanVal];
    return key ? t(translations, key, val) : val;
  };

  /* ── Bandwidth animation controls (declared before the effects that call them) ── */
  function startBw() {
    stopBw();
    const bw = bwRef.current;
    if (!bw) return;
    bwTimer.current = setInterval(() => {
      bw.querySelectorAll<HTMLElement>('span').forEach((b, i) => {
        if (i < bwFilled) b.style.height = (4 + Math.round(Math.random() * 14)) + 'px';
      });
    }, 220);
  }
  function stopBw() {
    if (bwTimer.current) { clearInterval(bwTimer.current); bwTimer.current = null; }
  }

  /* ── Tilt RAF loop ── */
  useEffect(() => {
    const card    = cardRef.current;
    if (!card) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s       = sp.current;
    if (reduced) { s.rx.jump(0); s.ry.jump(0); s.rz.jump(0); }

    function loop(now: number) {
      if (!card) return;
      const dt = Math.min((now - lastRef.current) / 1000, 1 / 30);
      lastRef.current = now;
      s.rx.step(dt); s.ry.step(dt); s.rz.step(dt); s.mx.step(dt); s.my.step(dt);
      const z = s.rz.getValue() * 8;
      if (!reduced) {
        card.style.transform =
          `perspective(1400px) rotateX(${s.rx.getValue().toFixed(3)}deg) rotateY(${s.ry.getValue().toFixed(3)}deg) translateZ(${z.toFixed(2)}px)`;
      }
      card.style.setProperty('--mx', s.mx.getValue().toFixed(2) + '%');
      card.style.setProperty('--my', s.my.getValue().toFixed(2) + '%');

      const sz = s.rz.getValue();
      if (sz > 0.4) {
        const glow = getComputedStyle(document.documentElement).getPropertyValue('--grid-glow').trim() || '190,194,255';
        card.style.boxShadow =
          `0 ${20 * sz}px ${50 * sz}px -20px rgba(${glow},${0.18 * sz}), 0 ${4 * sz}px ${12 * sz}px -6px rgba(0,0,0,${0.30 * sz})`;
      } else if (sz < 0.05) {
        card.style.boxShadow = '';
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame((t) => { lastRef.current = t; loop(t); });

    function onEnter() {
      s.rz.setTarget(1);
      startBw();
    }
    function onLeave() {
      s.rx.setTarget(0); s.ry.setTarget(0); s.rz.setTarget(0);
      s.mx.setTarget(50); s.my.setTarget(50);
      stopBw();
    }
    function onMove(e: PointerEvent) {
      if (!card) return;
      const r  = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top)  / r.height;
      s.rx.setTarget((py - 0.5) * -8);
      s.ry.setTarget((px - 0.5) *  8);
      s.mx.setTarget(px * 100);
      s.my.setTarget(py * 100);
    }

    card.addEventListener('pointerenter', onEnter);
    card.addEventListener('pointerleave', onLeave);
    card.addEventListener('pointermove',  onMove);

    return () => {
      cancelAnimationFrame(rafRef.current);
      card.removeEventListener('pointerenter', onEnter);
      card.removeEventListener('pointerleave', onLeave);
      card.removeEventListener('pointermove',  onMove);
      stopBw();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Bandwidth bars (created imperatively) ── */
  useEffect(() => {
    const bw = bwRef.current;
    if (!bw) return;
    for (let i = 0; i < 28; i++) {
      const span = document.createElement('span');
      span.style.height = (4 + Math.round(Math.random() * 14)) + 'px';
      if (i < bwFilled) span.classList.add('on');
      bw.appendChild(span);
    }
    return () => { while (bw.firstChild) bw.removeChild(bw.firstChild); };
  }, [bwFilled]);

  return (
    <article
      ref={cardRef}
      className={['plan-card', isFeatured ? 'featured' : ''].join(' ').trim()}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {/* Interactive overlays */}
      <div className="ambient" aria-hidden />
      <div className="edge-light" aria-hidden />

      {/* Corner registration ticks */}
      <span className="reg-tick tl" aria-hidden />
      <span className="reg-tick tr" aria-hidden />
      <span className="reg-tick bl" aria-hidden />
      <span className="reg-tick br" aria-hidden />

      {/* Popular ribbon */}
      {isFeatured && (
        <span className="plan-ribbon">
          {t(translations, 'home.plans.mostPopular', 'Most Popular')}
        </span>
      )}

      {/* Card body floats above overlays via translateZ */}
      <div style={{ position: 'relative', zIndex: 2, transform: 'translateZ(40px)', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* Index row */}
        <div className="flex items-center justify-between mb-6">
          <span className="plan-idx">{meta.label} · {meta.tier}</span>
          <span className="plan-idx">{plan.name}</span>
        </div>

        {/* Price / availability */}
        {plan.comingSoon ? (
          <div
            className="plan-coming-soon mb-2 font-mono text-sm"
            role="status"
            style={{ color: 'var(--color-primary)' }}
          >
            {t(translations, 'plans.comingSoon', 'Coming Soon')}
          </div>
        ) : (
          <div className="flex items-baseline gap-1 mb-2">
            <span className="font-mono text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>RM</span>
            <span className="plan-price-amount">{priceNum}</span>
            <span className="font-mono text-xs ml-2" style={{ color: 'var(--color-on-surface-variant)' }}>
              {suffix}
            </span>
          </div>
        )}

        <p className="plans-mono-label mb-6" style={{ fontSize: '12px' }}>{t(translations, meta.taglineKey, meta.taglineFallback)}</p>

        {/* Bandwidth bar */}
        <div className="mb-6">
          <div className="flex justify-between plans-mono-label mb-2" style={{ fontSize: '11px' }}>
            <span>
              {plan.bwTotal
                ? t(translations, 'home.plans.dataAndHotspot', 'Data + Hotspot')
                : t(translations, 'home.plans.data', 'Data')}
            </span>
            <span>{translatePlanValue(plan.bwTotal ?? plan.dataPerMonth ?? plan.data)}</span>
          </div>
          <div ref={bwRef} className="bw" />
        </div>

        {/* Spec rows */}
        <div className="mb-4">
          <div className="spec-row">
            <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.data', 'Data')}</span>
            <span className="sv">{translatePlanValue(plan.data)}</span>
          </div>
          <div className="spec-row">
            <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.calls', 'Calls')}</span>
            <span className="sv">{translatePlanValue(plan.calls)}</span>
          </div>
          {plan.id === 'ez365d' && (
            <div className="spec-row">
              <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.validity', 'Validity')}</span>
              <span className="sv">{translatePlanValue(plan.validity)}</span>
            </div>
          )}
          {plan.hotspot && (
          <div className="spec-row">
            <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.hotspot', 'Hotspot')}</span>
            <span className="sv">{translatePlanValue(plan.hotspot)}</span>
          </div>
          )}
          <div className="spec-row">
            <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.5gAccess', '5G Access')}</span>
            <span className="sv">{t(translations, 'home.plans.yes', 'Yes')}</span>
          </div>
          {plan.roaming && (
            <div className="spec-row">
              <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.roaming', 'Roaming')}</span>
              <span className="sv">{translatePlanValue(plan.roaming)} · ID · SG · TH</span>
            </div>
          )}
          {plan.sms && (
            <div className="spec-row">
              <span className="marker" aria-hidden /><span>{t(translations, 'home.plans.sms', 'SMS')}</span>
              <span className="sv">{translatePlanValue(plan.sms)}</span>
            </div>
          )}
        </div>

        {/* Fine-print notes */}
        {plan.noteKeys.length > 0 && (
          <div className="plan-notes">
            {plan.noteKeys.map((noteKey, i) => (
              <p key={i}>{t(translations, noteKey, noteKey)}</p>
            ))}
          </div>
        )}

        {/* CTA — unavailable plans have no purchase entry */}
        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
          {plan.comingSoon ? (
            <div
              className="plan-coming-soon font-mono text-xs"
              role="status"
              style={{ color: 'var(--color-primary)' }}
            >
              {t(translations, 'plans.comingSoon', 'Coming Soon')}
            </div>
          ) : (
            <Link
              href={`/${locale}/order?plan=${plan.id}`}
              className={['plan-btn', isFeatured ? 'primary' : ''].join(' ').trim()}
            >
              {t(translations, 'home.plans.buy', 'Buy Now')} →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
