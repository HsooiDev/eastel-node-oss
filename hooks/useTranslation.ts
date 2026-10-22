"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { defaultLocale, locales } from "@/lib/i18n";

const translationCache = new Map<Locale, Promise<Record<string, string>>>();

function getLocaleFromPathname(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  if (locales.includes(segment as Locale)) return segment as Locale;
  return defaultLocale;
}

async function fetchTranslations(locale: Locale): Promise<Record<string, string>> {
  const cached = translationCache.get(locale);
  if (cached) return cached;

  const promise = fetch(`/api/translations/${locale}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load translations for ${locale}`);
      return res.json();
    })
    .then((json) => json.data as Record<string, string>);

  translationCache.set(locale, promise);
  return promise;
}

export function useTranslation(locale?: Locale) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedLocale = locale ?? getLocaleFromPathname(pathname);

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchTranslations(resolvedLocale).then((data) => {
      if (!cancelled && mountedRef.current) {
        setTranslations(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedLocale]);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return translations[key] ?? fallback ?? key;
    },
    [translations]
  );

  const setLocale = useCallback(
    (newLocale: Locale) => {
      const segments = pathname.split("/");
      if (locales.includes(segments[1] as Locale)) {
        segments[1] = newLocale;
      } else {
        segments.splice(1, 0, newLocale);
      }
      // Keep an in-progress order selection (and any other page state in the
      // query string) when switching the locale from a shared page shell.
      const suffix = typeof window === "undefined"
        ? ""
        : `${window.location.search}${window.location.hash}`;
      router.push(`${segments.join("/")}${suffix}`);
    },
    [pathname, router]
  );

  return { t, locale: resolvedLocale, setLocale, loading };
}
