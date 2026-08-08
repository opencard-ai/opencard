/**
 * Curated card pages that are strong enough to represent OpenCard in search.
 *
 * Keep this list intentionally small while the remaining card pages receive
 * original editorial analysis. Non-listed pages stay usable in the product,
 * but are marked noindex and omitted from the sitemap.
 */
export const INDEXABLE_CARD_IDS = new Set([
  "amex-biz-gold",
  "amex-biz-platinum",
  "amex-blue-biz-cash",
  "amex-blue-biz-plus",
  "amex-gold",
  "amex-green",
  "amex-hilton-honors",
  "amex-hilton-honors-aspire",
  "amex-hilton-surpass",
  "amex-marriott-bevy",
  "amex-marriott-brilliant",
  "amex-platinum",
  "amazon-prime-visa",
  "bilt-blue",
  "bilt-obsidian",
  "boa-premium-rewards",
  "boa-premium-rewards-elite",
  "boa-travel-rewards",
  "capital-one-quicksilver",
  "capital-one-savorone",
  "capital-one-venture",
  "capital-one-venture-one",
  "capital-one-venture-x",
  "chase-freedom-flex",
  "chase-freedom-rise",
  "chase-freedom-unlimited",
  "chase-hyatt",
  "chase-ihg-premier",
  "chase-ink-biz-cash",
  "chase-ink-biz-preferred",
  "chase-ink-biz-unlimited",
  "chase-marriott-boundless",
  "chase-sapphire-preferred",
  "chase-sapphire-reserve",
  "chase-sapphire-reserve-biz",
  "chase-southwest-priority",
  "chase-united-explorer",
  "chase-united-quest",
  "citi-aadvantage-executive",
  "citi-costco-anywhere",
  "citi-custom-cash",
  "citi-double-cash",
  "citi-strata",
  "citi-strata-elite",
  "discover-it",
  "discover-it-secured",
  "us-bank-altitude-connect",
  "us-bank-cash-plus",
  "wells-fargo-active-cash",
  "wells-fargo-autograph",
]);

export function isIndexableCard(cardId: string): boolean {
  return INDEXABLE_CARD_IDS.has(cardId);
}
