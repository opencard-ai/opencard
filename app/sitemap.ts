import { MetadataRoute } from "next";
import { getAllCards } from "@/lib/cards";

export default function sitemap(): MetadataRoute.Sitemap {
  const cards = getAllCards();
  const baseUrl = "https://opencardai.com";

  // Note: baseUrl (opencardai.com/) is excluded - it redirects via middleware, not indexable
  const langs = ["en", "zh", "zh-cn", "es"] as const;
  const now = new Date();

  const tier = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) =>
    langs.map((lang) => ({
      url: `${baseUrl}/${lang}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    }));

  const staticPages: MetadataRoute.Sitemap = [
    ...tier("", 1, "daily"),
    ...tier("/cards", 0.8, "weekly"),
    ...tier("/elevated-offers", 0.8, "weekly"),
    ...tier("/find", 0.7, "weekly"),
    ...tier("/about", 0.5, "monthly"),
    ...tier("/privacy", 0.3, "monthly"),
    ...tier("/terms", 0.3, "monthly"),
  ];

  const cardPages: MetadataRoute.Sitemap = [];

  for (const card of cards) {
    const lastMod = card.last_updated ? new Date(card.last_updated) : new Date();
    const priority = card.status === "active" ? 0.7 : card.status === "discontinued" ? 0.3 : 0.6;

    for (const lang of ["en", "zh", "zh-cn", "es"]) {
      cardPages.push({
        url: `${baseUrl}/${lang}/cards/${card.card_id}`,
        lastModified: lastMod,
        changeFrequency: "weekly",
        priority,
      });
    }
  }

  return [...staticPages, ...cardPages];
}
