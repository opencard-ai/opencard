import type { CreditCard } from "@/lib/cards";

/** Explicit allow-list of card fields served by /api/v1 (no affiliate_url, no internal flags). */
const FIELDS = [
  "card_id", "name", "issuer", "network", "annual_fee", "annual_fee_description",
  "foreign_transaction_fee", "credit_required", "welcome_offer", "earning_rates",
  "recurring_credits", "travel_benefits", "insurance", "hotel_program",
  "application_rules", "last_updated", "sources", "status", "discontinued",
] as const;

export function v1CardView(card: CreditCard): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const v = (card as unknown as Record<string, unknown>)[f];
    if (v !== undefined) out[f] = v;
  }
  if (out.status === undefined) out.status = "active";
  return out;
}
