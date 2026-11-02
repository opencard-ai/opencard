/**
 * Whitelist of public card fields. Card JSON files also carry pipeline/audit
 * metadata (_revert_history, notes, confidence, source_conflicts, next_review,
 * cfpb_*, deprecated_*, ...) that must never leave the server. Every public
 * output (/api/cards, /api/public/*, MCP) goes through toPublicCardRecord().
 */
import type { CreditCard, WelcomeOffer } from "./cards";

/** Documented top-level CreditCard fields (lib/cards.ts), minus affiliate_url and featured. */
export const PUBLIC_CARD_FIELDS = [
  "card_id", "name", "issuer", "network", "annual_fee", "annual_fee_description",
  "foreign_transaction_fee", "credit_required", "welcome_offer", "earning_rates",
  "travel_benefits", "insurance", "hotel_program", "application_rules", "last_updated",
  "sources", "tags", "status", "discontinued", "discontinued_notes", "discontinued_date",
  "recurring_credits", "selectable_rewards", "relationship_bonus", "rotating_categories",
] as const satisfies readonly (keyof CreditCard)[];

/** Documented WelcomeOffer fields (lib/cards.ts). */
export const PUBLIC_WELCOME_OFFER_FIELDS = [
  "offer_status", "last_verified", "expires_at", "statement_credit", "spending_requirement",
  "time_period_months", "bonus_points", "bonus_type", "discount_percent", "estimated_value",
  "point_program", "description", "bonus_value", "is_elevated", "normal_bonus_points",
  "elevated_until", "free_nights", "free_night_value_cap",
] as const satisfies readonly (keyof WelcomeOffer)[];

/** Never public, even if one is later added to a documented type by mistake. */
export const FORBIDDEN_FIELD_RE = /^(_.*|notes|metadata_notes|confidence|source_conflicts|next_review|last_scraped|cfpb_.*|deprecated(_.*)?|affiliate_url|featured)$/;

function pick<T extends object>(src: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (FORBIDDEN_FIELD_RE.test(k)) continue;
    const v = (src as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function toPublicWelcomeOffer(w: WelcomeOffer | null | undefined): WelcomeOffer | undefined {
  if (!w || typeof w !== "object") return undefined;
  return pick(w, PUBLIC_WELCOME_OFFER_FIELDS) as WelcomeOffer;
}

export function toPublicCardRecord(card: CreditCard): CreditCard {
  const out = pick(card, PUBLIC_CARD_FIELDS) as CreditCard;
  const w = toPublicWelcomeOffer(card.welcome_offer);
  if (w) out.welcome_offer = w;
  else delete out.welcome_offer;
  return out;
}
