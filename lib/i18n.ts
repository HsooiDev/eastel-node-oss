import type { Locale } from "@/lib/i18n-types";

export type { Locale };

export const defaultLocale: Locale = "ms";
export const locales: Locale[] = ["ms", "en", "zh"];

/**
 * Get a specific translation key from a translations map.
 */
export function t(
  translations: Record<string, string>,
  key: string,
  fallback?: string
): string {
  return translations[key] ?? fallback ?? key;
}

/**
 * Validate that a string is a supported locale.
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
