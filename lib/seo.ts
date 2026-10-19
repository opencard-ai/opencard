import { locales } from "@/lib/i18n";

/** hreflang codes for each route locale (zh = Traditional, zh-cn = Simplified). */
export const HREFLANG: Record<string, string> = {
  en: "en",
  zh: "zh-Hant",
  "zh-cn": "zh-Hans",
  es: "es",
};

/**
 * Self-referencing canonical plus hreflang alternates for a localized path.
 * `path` is the route after the locale, e.g. "" for home or "/about".
 * Only pass locales that actually render indexable content for this path.
 */
export function localizedAlternates(
  lang: string,
  path: string,
  available: readonly string[] = locales,
) {
  const languages: Record<string, string> = {};
  for (const l of available) languages[HREFLANG[l] ?? l] = `/${l}${path}`;
  if (available.includes("en")) languages["x-default"] = `/en${path}`;
  return { canonical: `/${lang}${path}`, languages };
}
