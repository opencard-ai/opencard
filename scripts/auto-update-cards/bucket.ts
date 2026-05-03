/**
 * Builds the processing queue from three buckets:
 *  1. Featured cards (always first)
 *  2. DoC RSS matched cards
 *  3. Stale-first fill
 */

import type { Card } from "./cards-loader";
import type { DocItem } from "./doc-parser";
import { CONFIG } from "./config";

export function buildQueue(
  allCards: Card[],
  docItems: DocItem[],
  budget: number
): Card[] {
  // Bucket 1: Featured cards
  const featured = allCards.filter((c) => c.featured);

  // Bucket 2: DoC matched
  const docMatchedIds = new Set<string>();
  const docMatched: Card[] = [];

  for (const item of docItems) {
    const matchedId = matchCardId(item.title, allCards);
    if (matchedId && !docMatchedIds.has(matchedId)) {
      docMatchedIds.add(matchedId);
      const card = allCards.find((c) => c.card_id === matchedId);
      if (card) docMatched.push(card);
    }
  }

  // Bucket 3: Stale-first fill
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - CONFIG.STALE_THRESHOLD_DAYS);
  const staleCutoffStr = staleCutoff.toISOString().split("T")[0];

  const usedIds = new Set([...featured.map((c) => c.card_id), ...docMatched.map((c) => c.card_id)]);

  const stale = allCards
    .filter((c) => !usedIds.has(c.card_id)) // not already queued
    .filter((c) => c.status !== "discontinued" && c.status !== "needs_manual_review")
    .sort((a, b) => {
      // Oldest last_updated first
      const aDate = a.last_updated || "1970-01-01";
      const bDate = b.last_updated || "1970-01-01";
      return aDate.localeCompare(bDate);
    });

  // Fill up to budget
  const remaining = budget - featured.length - docMatched.length;
  const staleSlice = stale.slice(0, Math.max(0, remaining));

  const queue = [
    ...featured,
    ...docMatched,
    ...staleSlice,
  ];

  return queue;
}

/**
 * Attempts to match a DoC RSS item title to a card_id.
 * Uses simple fuzzy matching against card names and known aliases.
 */
export function matchCardId(title: string, cards: Card[]): string | null {
  const lower = title.toLowerCase();

  // Direct card name matching
  for (const card of cards) {
    const nameLower = card.name.toLowerCase();
    // Strip common suffixes like ®, ® Card, etc.
    const cleanName = nameLower.replace(/[®™]/g, "").trim();

    if (
      cleanName.length > 4 &&
      (lower.includes(cleanName) || cleanName.includes(lower.slice(0, 30)))
    ) {
      return card.card_id;
    }

    // Known aliases / short names
    const aliases: Record<string, string> = {
      "amex platinum": "amex-centurion",
      "chase sapphire reserve": "chase-sapphire-reserve",
      "chase sapphire preferred": "chase-sapphire-preferred",
      "amex gold": "amex-gold",
      "amex blue cash everyday": "amex-bce",
      "amex blue cash preferred": "amex-bcp",
      "capital one venture x": "capital-one-venture-x",
      "capital one venture": "capital-one-venture",
      "amex delta gold": "amex-delta-gold",
      "amex delta platinum": "amex-delta-platinum",
      "amex delta reserve": "amex-delta-reserve",
      "chase freedom flex": "chase-freedom-flex",
      "chase freedom unlimited": "chase-freedom-unlimited",
      "amex every day": "amex-everyday",
      "amex everyday preferred": "amex-everyday-preferred",
      "amex marriott brilliant": "amex-marriott-brilliant",
      "chase marriott boundless": "chase-marriott-boundless",
      "amex gold card": "amex-gold",
      "discover it": "discover-it",
    };

    for (const [alias, id] of Object.entries(aliases)) {
      if (lower.includes(alias) && card.card_id === id) {
        return id;
      }
    }
  }

  return null;
}
