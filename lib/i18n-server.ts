import { readFile } from "fs/promises";
import { join } from "path";
import type { Locale } from "@/lib/i18n-types";

const translationCache = new Map<Locale, Record<string, string>>();

/**
 * Load translations for a locale (server-side only).
 * Reads from /locales/{locale}.json with in-memory caching.
 */
export async function getTranslations(
  locale: Locale
): Promise<Record<string, string>> {
  const cached = translationCache.get(locale);
  if (cached) return cached;

  const filePath = join(process.cwd(), "locales", `${locale}.json`);
  const raw = await readFile(filePath, "utf-8");
  const data: Record<string, string> = JSON.parse(raw);
  translationCache.set(locale, data);
  return data;
}
