import type { Metadata } from "next";
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

/** Complete social fields: Next.js replaces nested metadata rather than merging it. */
export function pageMetadata(lang: string, path: string, metadata: Metadata): Metadata {
  const title = typeof metadata.title === "string" ? metadata.title
    : metadata.title && "absolute" in metadata.title ? metadata.title.absolute : undefined;
  const description = metadata.description ?? undefined;
  const image = "https://opencardai.com/og-image.png";
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      title,
      description,
      url: `/${lang}${path}`,
      siteName: "OpenCard.AI",
      locale: ({ en: "en_US", zh: "zh_TW", "zh-cn": "zh_CN", es: "es_ES" } as Record<string, string>)[lang] ?? "en_US",
      type: metadata.openGraph && "type" in metadata.openGraph && metadata.openGraph.type === "article" ? "article" : "website",
      images: [{ url: image, width: 1200, height: 630, alt: "OpenCard.AI — AI-powered credit card selection" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
