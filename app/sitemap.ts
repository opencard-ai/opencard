import { MetadataRoute } from "next";
import { getAllCards } from "@/lib/cards";
import { getGuidesForLocale, hasLocalizedGuide } from "@/lib/guides";
import { locales } from "@/lib/i18n";
import { isIndexableCard } from "@/lib/indexable-cards";
import { HREFLANG } from "@/lib/seo";

const baseUrl = "https://opencardai.com";

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
  const now = new Date();

  const tier = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) =>
    locales.map((lang) => ({
      url: `${baseUrl}/${lang}${path}`,
      lastModified: now,
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
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    ...tier("/about", 0.5, "monthly"),
    ...tier("/methodology", 0.5, "monthly"),
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
        lastModified: new Date(guide.updated),
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
      lastModified: card.last_updated ? new Date(card.last_updated) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [...staticPages, ...guidePages, ...cardPages];
}
