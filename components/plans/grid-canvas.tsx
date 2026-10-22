'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  axis: 'h' | 'v';
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'pipe' | 'vortex';
  life: number;
  orbitA: number;
  orbitR: number;
  orbitW: number;
  kind: 'dot' | 'bin' | 'hex' | 'glyph';
  char: string;
  size: number;
}

const CHARS_BIN   = ['0', '1'];
const CHARS_HEX   = '0123456789ABCDEF'.split('');
const CHARS_GLYPH = ['◆', '◇', '·', '▪', '|', '/'];
const PARTICLE_CAP = 360;
const CELL_SIZE    = 56;

function readGridVars() {
  const s = getComputedStyle(document.documentElement);
  return {
    gridLine:    s.getPropertyValue('--grid-line').trim()    || 'rgba(144,143,160,0.10)',
    gridLineHot: s.getPropertyValue('--grid-line-hot').trim()|| 'rgba(190,194,255,0.85)',
    gridGlow:    s.getPropertyValue('--grid-glow').trim()    || '190,194,255',
  };
}

export function GridCanvas({ 
  showParticles = true,
  crosshair = true,
  particleMode = 'normal'
}: { 
  showParticles?: boolean;
  crosshair?: boolean;
  particleMode?: 'normal' | 'vortex-only';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showParticlesRef = useRef(showParticles);
  const crosshairRef = useRef(crosshair);
  const particleModeRef = useRef(particleMode);

  useEffect(() => {
    showParticlesRef.current = showParticles;
    crosshairRef.current = crosshair;
    particleModeRef.current = particleMode;
  }, [showParticles, crosshair, particleMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const section = canvas.parentElement as HTMLElement;
    const ctx     = canvas.getContext('2d')!;
    const dpr     = window.devicePixelRatio || 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cw = 0, ch = 0;
    let rafId = 0;
    let last  = performance.now();

    const mouse = { x: -9999, y: -9999, in: false, speed: 0 };
    const particles: Particle[] = [];

    /* ---------- resize ---------- */
    function resize() {
      if (!canvas) return;
      cw = section.clientWidth;
      ch = section.clientHeight;
      canvas.width  = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width  = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);
    window.addEventListener('resize', resize);

    /* ---------- spawn ---------- */
    function spawn(cx: number, cy: number) {
      if (particles.length >= PARTICLE_CAP || reduced) return;
      const useH = Math.random() < 0.5;
      const off  = (Math.random() + Math.random() + Math.random() - 1.5) * 5;
      const dist = 220 + Math.random() * 380;
      const side = Math.random() < 0.5 ? -1 : 1;
      const sp   = 220 + Math.random() * 380;

      const p: Particle = {
        axis: useH ? 'h' : 'v',
        x: 0, y: 0, vx: 0, vy: 0,
        state: 'pipe', life: 1,
        orbitA: 0, orbitR: 0, orbitW: 0,
        kind: 'dot', char: '', size: 0,
      };

      if (particleModeRef.current === 'vortex-only') {
        p.state = 'vortex';
        p.orbitA = Math.random() * Math.PI * 2;
        p.orbitR = 28 + Math.random() * 50;
        p.orbitW = (Math.random() < 0.5 ? 1 : -1) * (2 + Math.random() * 3);
        p.x = mouse.x + Math.cos(p.orbitA) * p.orbitR;
        p.y = mouse.y + Math.sin(p.orbitA) * p.orbitR;
      } else {
        if (useH) {
          p.y  = Math.round(cy / CELL_SIZE + off) * CELL_SIZE;
          p.x  = cx + side * dist;
          p.vx = -side * sp;
        } else {
          p.x  = Math.round(cx / CELL_SIZE + off) * CELL_SIZE;
          p.y  = cy + side * dist;
          p.vy = -side * sp;
        }
      }

      const t = Math.random();
      if      (t < 0.50) { p.kind = 'dot';   p.size = 1.2 + Math.random() * 1.6; }
      else if (t < 0.78) { p.kind = 'bin';   p.char = CHARS_BIN[Math.random() < 0.5 ? 0 : 1]; p.size = 9 + Math.random() * 2; }
      else if (t < 0.94) { p.kind = 'hex';   p.char = CHARS_HEX[Math.floor(Math.random() * 16)]; p.size = 9 + Math.random() * 2; }
      else               { p.kind = 'glyph'; p.char = CHARS_GLYPH[Math.floor(Math.random() * CHARS_GLYPH.length)]; p.size = 10; }

      particles.push(p);
    }

    /* ---------- draw ---------- */
    function draw(dt: number) {
      ctx.clearRect(0, 0, cw, ch);
      const { gridLine, gridGlow } = readGridVars();

      // Base grid
      ctx.lineWidth   = 1;
      ctx.strokeStyle = gridLine;
      ctx.beginPath();
      for (let x = 0; x <= cw; x += CELL_SIZE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ch); }
      for (let y = 0; y <= ch; y += CELL_SIZE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(cw, y + 0.5); }
      ctx.stroke();

      if (mouse.in) {
        const nV  = Math.round(mouse.x / CELL_SIZE) * CELL_SIZE;
        const nH  = Math.round(mouse.y / CELL_SIZE) * CELL_SIZE;
        const FR  = 220;
        const aV  = Math.max(0, 1 - Math.abs(mouse.x - nV) / 40);
        const aH  = Math.max(0, 1 - Math.abs(mouse.y - nH) / 40);

        if (crosshairRef.current) {
          if (aV > 0.02) {
            const g = ctx.createLinearGradient(0, mouse.y - FR, 0, mouse.y + FR);
            g.addColorStop(0,   `rgba(${gridGlow},0)`);
            g.addColorStop(0.5, `rgba(${gridGlow},${0.55 * aV})`);
            g.addColorStop(1,   `rgba(${gridGlow},0)`);
            ctx.strokeStyle = g; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(nV + 0.5, 0); ctx.lineTo(nV + 0.5, ch); ctx.stroke();
          }
          if (aH > 0.02) {
            const g = ctx.createLinearGradient(mouse.x - FR, 0, mouse.x + FR, 0);
            g.addColorStop(0,   `rgba(${gridGlow},0)`);
            g.addColorStop(0.5, `rgba(${gridGlow},${0.55 * aH})`);
            g.addColorStop(1,   `rgba(${gridGlow},0)`);
            ctx.strokeStyle = g; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(0, nH + 0.5); ctx.lineTo(cw, nH + 0.5); ctx.stroke();
          }
        }

        // Vortex aura
        const aura = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 140);
        aura.addColorStop(0,   `rgba(${gridGlow},0.22)`);
        aura.addColorStop(0.4, `rgba(${gridGlow},0.08)`);
        aura.addColorStop(1,   `rgba(${gridGlow},0)`);
        ctx.fillStyle = aura;
        ctx.fillRect(mouse.x - 150, mouse.y - 150, 300, 300);
      }

      // Tick & draw particles
      if (showParticlesRef.current) {
        const pullAccel  = 1500;
        const maxSpeed   = 1100;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];

          if (p.state === 'pipe') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const dx = mouse.x - p.x, dy = mouse.y - p.y;
            const d  = Math.hypot(dx, dy);
            if (p.axis === 'h') {
              p.vx += Math.sign(dx) * pullAccel * dt;
              if (Math.abs(p.vx) > maxSpeed) p.vx = maxSpeed * Math.sign(p.vx);
            } else {
              p.vy += Math.sign(dy) * pullAccel * dt;
              if (Math.abs(p.vy) > maxSpeed) p.vy = maxSpeed * Math.sign(p.vy);
            }
            if (d < 70) {
              p.state  = 'vortex';
              p.orbitA = Math.atan2(p.y - mouse.y, p.x - mouse.x);
              p.orbitR = Math.max(28, d);
              const cross = (p.x - mouse.x) * p.vy - (p.y - mouse.y) * p.vx;
              p.orbitW = (cross >= 0 ? 1 : -1) * (3.5 + Math.random() * 3.2);
            }
            if (!mouse.in) p.life -= dt * 2;

            // Trail
            const tx = p.x - p.vx * 0.025, ty = p.y - p.vy * 0.025;
            const tg = ctx.createLinearGradient(p.x, p.y, tx, ty);
            tg.addColorStop(0, `rgba(${gridGlow},${0.55 * p.life})`);
            tg.addColorStop(1, `rgba(${gridGlow},0)`);
            ctx.strokeStyle = tg; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();

          } else {
            p.orbitA += p.orbitW * dt;
            p.orbitR *= Math.pow(0.45, dt);
            p.x = mouse.x + Math.cos(p.orbitA) * p.orbitR;
            p.y = mouse.y + Math.sin(p.orbitA) * p.orbitR;
            p.life -= dt * 1.6;
          }

          if (p.life <= 0 || (p.state === 'vortex' && p.orbitR < 2)
              || p.x < -60 || p.x > cw + 60 || p.y < -60 || p.y > ch + 60) {
            particles.splice(i, 1); continue;
          }

          const a = Math.max(0, Math.min(1, p.life));
          if (p.kind === 'dot') {
            ctx.shadowColor = `rgba(${gridGlow},${a})`; ctx.shadowBlur = 10;
            ctx.fillStyle   = `rgba(${gridGlow},${a})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.shadowColor = `rgba(${gridGlow},${a * 0.9})`; ctx.shadowBlur = 6;
            ctx.fillStyle   = `rgba(${gridGlow},${a})`;
            ctx.font        = `600 ${p.size.toFixed(1)}px "JetBrains Mono",monospace`;
            ctx.fillText(p.char, p.x, p.y);
          }
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      } else {
        particles.length = 0;
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    /* ---------- RAF loop ---------- */
    function loop(now: number) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (showParticlesRef.current && mouse.in && !reduced) {
        const burst = 4 + Math.min(10, Math.floor(mouse.speed * 0.35));
        for (let k = 0; k < burst; k++) spawn(mouse.x, mouse.y);
      }
      draw(dt);
      mouse.speed *= Math.pow(0.001, dt);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame((t) => { last = t; loop(t); });

    /* ---------- pointer events ---------- */
    function onMove(e: PointerEvent) {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (mouse.in) mouse.speed = mouse.speed * 0.7 + Math.hypot(nx - mouse.x, ny - mouse.y) * 0.3;
      mouse.x = nx; mouse.y = ny; mouse.in = true;
    }
    function onLeave() { mouse.in = false; mouse.x = -9999; mouse.y = -9999; mouse.speed = 0; }

    section.addEventListener('pointermove', onMove);
    section.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  );
}
