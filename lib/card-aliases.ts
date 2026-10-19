/**
 * Retired card_id -> canonical card_id. Used when a card file is merged into
 * another so that saved My Cards entries (localStorage + cloud profiles),
 * API lookups and reminder emails keep resolving. Client-safe (no fs).
 * Keep in sync with the legacy slug redirects in next.config.ts.
 */
export const CARD_ID_ALIASES: Readonly<Record<string, string>> = {
  // Stale duplicate merged 2026-10-02.
  "us-bank-altitude-connect-biz": "us-bank-biz-altitude-connect",
  // Retired product removed 2026-10-19; Wells Fargo business cards page now lands on Signify Business Cash
  "wells-fargo-active-cash-biz": "wells-fargo-signify-biz-cash",
  // Retired product removed 2026-10-19; closest current U.S. Bank flat-rate business card
  "us-bank-altitude-go-biz": "us-bank-biz-essentials",
};

export function resolveCardId(cardId: string): string {
  return CARD_ID_ALIASES[cardId] ?? cardId;
}

/** Resolve aliases in a list of ids, dropping duplicates created by the mapping. */
export function resolveCardIds(cardIds: readonly string[]): string[] {
  return [...new Set(cardIds.map(resolveCardId))];
}
