import { MetadataRoute } from "next";
import { getAllCards } from "@/lib/cards";

export default function sitemap(): MetadataRoute.Sitemap {
  const cards = getAllCards();
  const baseUrl = "https://opencardai.com";

  // Note: baseUrl (opencardai.com/) is excluded - it redirects via middleware, not indexable
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/en`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/zh`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/es`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/en/cards`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/zh/cards`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/es/cards`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/en/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/zh/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/es/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/en/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/zh/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/es/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/en/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/zh/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/es/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];

  const cardPages: MetadataRoute.Sitemap = [];

  for (const card of cards) {
    const lastMod = card.last_updated ? new Date(card.last_updated) : new Date();
    const priority = card.status === "active" ? 0.7 : card.status === "discontinued" ? 0.3 : 0.6;

    for (const lang of ["en", "zh", "es"]) {
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
