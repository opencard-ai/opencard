import { MetadataRoute } from "next";
import { getAllCards } from "@/lib/cards";
import { getGuidesForLocale, hasLocalizedGuide } from "@/lib/guides";
import { locales } from "@/lib/i18n";
import { isIndexableCard } from "@/lib/indexable-cards";
import { HREFLANG } from "@/lib/seo";
import { BEST_CATEGORIES } from "@/lib/best-categories";

const baseUrl = "https://opencardai.com";

/** Omit unknown/invalid dates rather than claiming a fresh content update. */
function lastModified(value?: string): { lastModified?: Date } {
  if (!value) return {};
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { lastModified: date } : {};
}

/** Absolute hreflang map for a path, limited to locales that render it. */
function languageAlternates(path: string, available: readonly string[]) {
  const languages: Record<string, string> = {};
  for (const l of available) languages[HREFLANG[l] ?? l] = `${baseUrl}/${l}${path}`;
  if (available.includes("en")) languages["x-default"] = `${baseUrl}/en${path}`;
  return { languages };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const cards = getAllCards();

  // Note: baseUrl (opencardai.com/) is excluded - it redirects via middleware, not indexable
  const tier = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) =>
    locales.map((lang) => ({
      url: `${baseUrl}/${lang}${path}`,
      changeFrequency,
      priority,
      alternates: languageAlternates(path, locales),
    }));

  const staticPages: MetadataRoute.Sitemap = [
    ...tier("", 1, "daily"),
    ...tier("/elevated-offers", 0.8, "weekly"),
    ...tier("/find", 0.7, "weekly"),
    ...tier("/guides", 0.75, "weekly"),
    {
      url: `${baseUrl}/en/benefit-expiration-tracker`,
      changeFrequency: "monthly",
      priority: 0.75,
      alternates: languageAlternates("/benefit-expiration-tracker", ["en"]),
    },
    ...tier("/about", 0.5, "monthly"),
    ...tier("/methodology", 0.5, "monthly"),
    {
      url: `${baseUrl}/en/developers`,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: languageAlternates("/developers", ["en"]),
    },
    ...tier("/contact", 0.4, "monthly"),
    ...tier("/privacy", 0.3, "monthly"),
    ...tier("/terms", 0.3, "monthly"),
  ];

  // Every locale that has a translated article body is listed, with hreflang
  // alternates across the translations that exist for that guide.
  const guidePages: MetadataRoute.Sitemap = [];
  for (const lang of locales) {
    for (const guide of getGuidesForLocale(lang)) {
      const available = locales.filter((l) => hasLocalizedGuide(guide, l));
      guidePages.push({
        url: `${baseUrl}/${lang}/guides/${guide.slug}`,
        ...lastModified(guide.updated),
        changeFrequency: "monthly",
        priority: lang === "en" ? 0.7 : 0.6,
        alternates: languageAlternates(`/guides/${guide.slug}`, available),
      });
    }
  }

  // Card data is English-only, so only /en card pages are indexable. Cards
  // closed to new applicants (discontinued), transferred, or invitation-only
  // are noindex on the page and therefore omitted here to stay consistent.
  const cardPages: MetadataRoute.Sitemap = cards
    .filter((card) => isIndexableCard(card))
    .map((card) => ({
      url: `${baseUrl}/en/cards/${card.card_id}`,
      ...lastModified(card.last_updated),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      // Mirror the page's own hreflang (en + x-default) so sitemap and HTML agree.
      alternates: languageAlternates(`/cards/${card.card_id}`, ["en"]),
    }));

  const bestPages: MetadataRoute.Sitemap = [
    { path: "/best", verified: BEST_CATEGORIES.map((c) => c.verified).sort().at(-1) },
    ...BEST_CATEGORIES.map(({ slug, verified }) => ({ path: `/best/${slug}`, verified })),
  ].flatMap(({ path, verified }) => ["en", "zh"].map((lang) => ({
    url: `${baseUrl}/${lang}${path}`,
    ...lastModified(verified),
    changeFrequency: "monthly" as const,
    priority: 0.7,
    alternates: languageAlternates(path, ["en", "zh"]),
  })));

  return [...staticPages, ...guidePages, ...cardPages, ...bestPages];
}
