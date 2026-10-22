"use client";

import { useEffect, useRef } from "react";

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  theme?: "light" | "dark" | "auto";
  action?: string;
  resetKey?: number;
}

export function TurnstileWidget({ onToken, theme = "auto", action, resetKey = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousResetKey = useRef(resetKey);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      onToken(process.env.NODE_ENV === "production" ? "" : "dev-placeholder");
      return;
    }

    // Avoid re-injecting the script if it's already loaded
    const existing = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    let disposed = false;
    function renderWidget() {
      if (disposed || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey!,
        callback: (token: string) => onToken(token),
        "error-callback": () => onToken(""),
        "expired-callback": () => onToken(""),
        theme,
        ...(action ? { action } : {}),
      });
    }

    let pendingScript: HTMLScriptElement | null = null;
    if (existing) {
      if (window.turnstile) {
        renderWidget();
      } else {
        existing.addEventListener("load", renderWidget, { once: true });
        pendingScript = existing as HTMLScriptElement;
      }
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      pendingScript = script;
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      pendingScript?.removeEventListener("load", renderWidget);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onToken, theme, action]);

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      onToken(process.env.NODE_ENV === "production" ? "" : "dev-placeholder");
      return;
    }
    onToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey, onToken]);

  return (
    <div
      ref={containerRef}
      id="turnstile-container"
      className="flex justify-center"
      aria-label="Security verification"
    />
  );
}
