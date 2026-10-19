import type { CreditCard } from "@/lib/cards";

/**
 * Card pages open for search indexing: every card that is still open to new
 * applicants (status "active", or legacy records with no status). Discontinued,
 * transferred, and invitation-only cards stay usable in the product but are
 * noindex and omitted from the sitemap. Card data is English-only, so only the
 * /en card pages are indexable; translated card pages remain noindex.
 */
export function isIndexableCard(card: Pick<CreditCard, "status" | "discontinued">): boolean {
  return (card.status === undefined || card.status === "active") && card.discontinued !== true;
}

/** Hand-curated cards with original editorial analysis (used by audits as the "popular" set). */
export const CURATED_CARD_IDS = new Set([
  "amazon-prime-visa",
  "amex-biz-platinum",
  "amex-blue-biz-cash",
  "amex-blue-cash-preferred",
  "amex-delta-gold-biz",
  "amex-delta-reserve",
  "amex-delta-skymiles-reserve-biz",
  "amex-gold",
  "amex-hilton-honors-aspire",
  "amex-marriott-bonvoy-biz",
  "amex-platinum",
  "barclays-banana-republic-rewards-mastercard",
  "bilt-obsidian",
  "boa-customized-cash-rewards",
  "capital-one-savorone",
  "capital-one-venture-x",
  "chase-freedom-unlimited",
  "chase-hyatt",
  "chase-ink-biz-preferred",
  "chase-ink-biz-unlimited",
  "chase-sapphire-preferred",
  "chase-sapphire-reserve",
  "chase-southwest-premier-biz",
  "chase-united-explorer",
  "citi-strata",
  "pnc-cash-rewards-visa",
  "us-bank-cash-plus",
  "us-bank-harley-davidson",
  "wells-fargo-one-key",
]);
