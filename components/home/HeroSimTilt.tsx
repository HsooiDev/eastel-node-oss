'use client';

import { useEffect } from 'react';

/**
 * Zero-render client component — attaches mouse-tilt effect to the SIM card.
 * Faithfully ports the pointer-tilt block from Hero.html:
 *   ry = -18 + (px - 0.5) * 14
 *   rx =   8 + (0.5 - py) * 10
 * Only activates on hover-capable devices (pointer: mouse).
 */
export function HeroSimTilt() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const stage = document.querySelector<HTMLElement>('.hp-stage');
    const wrap = document.querySelector<HTMLElement>('.hp-sim-wrap');
    if (!stage || !wrap) return;

    let rect: DOMRect = stage.getBoundingClientRect();
    const setRect = () => { rect = stage.getBoundingClientRect(); };
    window.addEventListener('resize', setRect, { passive: true });

    const onMove = (e: MouseEvent) => {
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const ry = -18 + (px - 0.5) * 14;
      const rx = 8 + (0.5 - py) * 10;
      wrap.style.animation = 'none';
      wrap.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
    };

    const onLeave = () => {
      wrap.style.animation = '';
      wrap.style.transform = '';
    };

    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mouseleave', onLeave);

    return () => {
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', setRect);
    };
  }, []);

  return null;
}
