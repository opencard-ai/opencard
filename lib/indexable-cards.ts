/**
 * Curated card pages that are strong enough to represent OpenCard in search.
 *
 * Keep this list intentionally small while the remaining card pages receive
 * original editorial analysis. Non-listed pages stay usable in the product,
 * but are marked noindex and omitted from the sitemap.
 */
export const INDEXABLE_CARD_IDS = new Set([
  "amex-biz-platinum",
  "amex-gold",
  "amex-hilton-honors-aspire",
  "amex-platinum",
  "amazon-prime-visa",
  "bilt-obsidian",
  "capital-one-savorone",
  "capital-one-venture-x",
  "chase-freedom-unlimited",
  "chase-hyatt",
  "chase-ink-biz-preferred",
  "chase-sapphire-preferred",
  "chase-sapphire-reserve",
  "citi-strata",
]);

export function isIndexableCard(cardId: string): boolean {
  return INDEXABLE_CARD_IDS.has(cardId);
}
