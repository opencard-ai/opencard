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
