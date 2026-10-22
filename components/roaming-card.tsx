'use client';

import { type CSSProperties, useEffect, useRef } from 'react';
import type { RoamingPlan } from '@/lib/roaming-data';
import { t } from '@/lib/i18n';

function makeSpring(stiffness = 140, damping = 18, mass = 1, init = 0) {
  let value = init;
  let target = init;
  let velocity = 0;

  return {
    setTarget(next: number) {
      target = next;
    },
    getValue() {
      return value;
    },
    step(dt: number) {
      const force = -stiffness * (value - target) - damping * velocity;
      velocity += (force / mass) * dt;
      value += velocity * dt;
    },
  };
}

function dataToBars(data: string): number {
  const amount = Number.parseInt(data, 10);
  if (!Number.isFinite(amount)) return 5;
  return Math.min(14, Math.max(4, Math.ceil(amount / 2)));
}

interface RoamingCardProps {
  plan: RoamingPlan;
  translations: Record<string, string>;
  index: number;
}

export function RoamingCard({ plan, translations, index }: RoamingCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);
  const filledBars = dataToBars(plan.data);
  const springs = useRef({
    rx: makeSpring(140, 18),
    ry: makeSpring(140, 18),
    rz: makeSpring(200, 24),
    mx: makeSpring(260, 30, 1, 50),
    my: makeSpring(260, 30, 1, 50),
  });

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const element = card;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spring = springs.current;

    function loop(now: number) {
      const dt = Math.min((now - lastRef.current) / 1000, 1 / 30);
      lastRef.current = now;
      spring.rx.step(dt);
      spring.ry.step(dt);
      spring.rz.step(dt);
      spring.mx.step(dt);
      spring.my.step(dt);

      if (!reduced) {
        const z = spring.rz.getValue() * 8;
        element.style.transform =
          `perspective(1400px) rotateX(${spring.rx.getValue().toFixed(3)}deg) ` +
          `rotateY(${spring.ry.getValue().toFixed(3)}deg) translateZ(${z.toFixed(2)}px)`;
      }
      element.style.setProperty('--mx', `${spring.mx.getValue().toFixed(2)}%`);
      element.style.setProperty('--my', `${spring.my.getValue().toFixed(2)}%`);

      const lift = spring.rz.getValue();
      if (lift > 0.4) {
        const glow = getComputedStyle(document.documentElement)
          .getPropertyValue('--grid-glow')
          .trim() || '190,194,255';
        element.style.boxShadow =
          `0 ${20 * lift}px ${50 * lift}px -20px rgba(${glow},${0.18 * lift}), ` +
          `0 ${4 * lift}px ${12 * lift}px -6px rgba(0,0,0,${0.3 * lift})`;
      } else if (lift < 0.05) {
        element.style.boxShadow = '';
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    const onEnter = () => {
      spring.rz.setTarget(1);
    };
    const onLeave = () => {
      spring.rx.setTarget(0);
      spring.ry.setTarget(0);
      spring.rz.setTarget(0);
      spring.mx.setTarget(50);
      spring.my.setTarget(50);
    };
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      spring.rx.setTarget((py - 0.5) * -8);
      spring.ry.setTarget((px - 0.5) * 8);
      spring.mx.setTarget(px * 100);
      spring.my.setTarget(py * 100);
    };

    rafRef.current = requestAnimationFrame((time) => {
      lastRef.current = time;
      loop(time);
    });
    element.addEventListener('pointerenter', onEnter);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(rafRef.current);
      element.removeEventListener('pointerenter', onEnter);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('pointermove', onMove);
    };
  }, []);

  useEffect(() => {
    const bars = barsRef.current;
    if (!bars) return;

    while (bars.firstChild) bars.removeChild(bars.firstChild);
    for (let i = 0; i < 28; i += 1) {
      const bar = document.createElement('span');
      bar.style.height = `${4 + Math.round(Math.random() * 14)}px`;
      if (i < filledBars) bar.classList.add('on');
      bars.appendChild(bar);
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      animationRef.current = setInterval(() => {
        bars.querySelectorAll<HTMLElement>('span').forEach((bar, i) => {
          if (i < filledBars) {
            bar.style.height = `${4 + Math.round(Math.random() * 14)}px`;
          }
        });
      }, 220);
    }

    return () => {
      if (animationRef.current) clearInterval(animationRef.current);
      animationRef.current = null;
      while (bars.firstChild) bars.removeChild(bars.firstChild);
    };
  }, [filledBars]);

  return (
    <article
      ref={cardRef}
      className="plan-card roaming-plan-card"
      style={{
        minHeight: '384px',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        '--card-index': index,
      } as CSSProperties}
    >
      <div className="ambient" aria-hidden />
      <div className="edge-light" aria-hidden />
      <span className="reg-tick tl" aria-hidden />
      <span className="reg-tick tr" aria-hidden />
      <span className="reg-tick bl" aria-hidden />
      <span className="reg-tick br" aria-hidden />

      <div className="roaming-card-content">
        <div className="flex items-center justify-between mb-6 roaming-card-head">
          <span className="plan-idx">{t(translations, 'roaming.pass', 'Roaming Pass')}</span>
          <span className="plan-idx roaming-card-name">{plan.name}</span>
        </div>

        <div className="flex items-baseline gap-1 mb-6">
          <span className="font-mono text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>RM</span>
          <span className="plan-price-amount">{plan.priceNumeric}</span>
        </div>

        <div className="mb-6">
          <div className="flex justify-between plans-mono-label mb-2" style={{ fontSize: '11px' }}>
            <span>{t(translations, 'roaming.data', 'High-speed data')}</span>
            <span>{plan.data}</span>
          </div>
          <div ref={barsRef} className="bw roaming-bw" aria-hidden />
        </div>

        <div className="roaming-at-a-glance" aria-label={t(translations, 'roaming.atAGlance', 'At a glance')}>
          <div className="roaming-glance-item">
            <span>{t(translations, 'roaming.validity', 'Validity')}</span>
            <strong>{plan.validity}</strong>
          </div>
          <div className="roaming-glance-item">
            <span>{t(translations, 'roaming.countries', 'Countries')}</span>
            <strong>
              {plan.countries.length}{' '}
              <small>{t(translations, 'roaming.destinations', 'destinations')}</small>
            </strong>
          </div>
        </div>

        <div className="roaming-card-foot">
          <details className="roaming-details">
            <summary>{t(translations, 'roaming.viewCoverage', 'View coverage')}</summary>
            <div className="roaming-details-body">
              <div className="roaming-detail-row">
                <span>{t(translations, 'roaming.countries', 'Countries')}</span>
                <strong>{plan.countries.join(' · ')}</strong>
              </div>
              <div className="roaming-detail-row">
                <span>{t(translations, 'roaming.hotspot', 'Hotspot')}</span>
                <strong>{plan.hotspot}</strong>
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}
