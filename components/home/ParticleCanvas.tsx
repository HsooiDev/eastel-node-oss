"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
}

function getTokens(): { light: number; alpha: number; glow: number; line: number } {
  const cs = getComputedStyle(document.documentElement);
  return {
    light: parseFloat(cs.getPropertyValue("--hp-particle-light")) || 80,
    alpha: parseFloat(cs.getPropertyValue("--hp-particle-alpha")) || 0.7,
    glow:  parseFloat(cs.getPropertyValue("--hp-particle-glow"))  || 0.25,
    line:  parseFloat(cs.getPropertyValue("--hp-particle-line"))  || 0.18,
  };
}

const COUNT = 70;

/** Particle network canvas — faithful port of Hero.html #network */
export function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const rawCvs = ref.current;
    if (!rawCvs) return;
    const cvs: HTMLCanvasElement = rawCvs;
    const rawCtx = cvs.getContext("2d");
    if (!rawCtx) return;
    const ctx: CanvasRenderingContext2D = rawCtx;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const NODES: Node[] = [];

    let tokens = getTokens();

    const mo = new MutationObserver(() => { tokens = getTokens(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function resize() {
      const r = cvs.getBoundingClientRect();
      W = r.width; H = r.height;
      cvs.width  = W * dpr;
      cvs.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      NODES.length = 0;
      for (let i = 0; i < COUNT; i++) {
        NODES.push({
          x:   Math.random() * W,
          y:   Math.random() * H,
          vx:  (Math.random() - 0.5) * 0.18,
          vy:  (Math.random() - 0.5) * 0.18,
          r:   Math.random() * 1.4 + 0.4,
          hue: Math.random() < 0.5 ? 260 : 220,
        });
      }
    }

    let raf: number | undefined;

    function tick() {
      raf = undefined;
      ctx.clearRect(0, 0, W, H);

      // Move nodes
      for (const n of NODES) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }

      // Draw connecting lines
      for (let i = 0; i < NODES.length; i++) {
        const a = NODES[i];
        for (let j = i + 1; j < NODES.length; j++) {
          const b = NODES[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 140 * 140) {
            const al = 1 - Math.sqrt(d2) / 140;
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 70%, ${tokens.light}%, ${al * tokens.line})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes + glow
      for (const n of NODES) {
        // Core dot
        ctx.beginPath();
        ctx.fillStyle = `hsla(${n.hue}, 80%, ${tokens.light}%, ${tokens.alpha})`;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        // Radial glow
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 8);
        g.addColorStop(0, `hsla(${n.hue}, 90%, ${tokens.light}%, ${tokens.glow})`);
        g.addColorStop(1, `hsla(${n.hue}, 90%, ${tokens.light}%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!motionPreference.matches && visible && !document.hidden) {
        raf = requestAnimationFrame(tick);
      }
    }

    function updateAnimation() {
      if (raf !== undefined) cancelAnimationFrame(raf);
      raf = undefined;
      // Draw one still frame for reduced motion, and resume the existing scene
      // when the hero returns to view instead of animating off screen.
      if (visible && !document.hidden) tick();
    }

    resize();
    init();
    updateAnimation();

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateAnimation();
    });
    observer.observe(cvs);
    document.addEventListener("visibilitychange", updateAnimation);
    motionPreference.addEventListener("change", updateAnimation);

    const onResize = () => { resize(); init(); updateAnimation(); };
    window.addEventListener("resize", onResize);

    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", updateAnimation);
      motionPreference.removeEventListener("change", updateAnimation);
      observer.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
        opacity: 0.85,
      }}
    />
  );
}
