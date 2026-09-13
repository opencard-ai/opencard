import type { CreditCard } from './cards';

/** A deliberately small, schema-backed factual input. Never duplicate card facts in prompts. */
export function recommendationFacts(card: CreditCard, today = new Date().toISOString().slice(0, 10)) {
  const offer = card.welcome_offer;
  const expiry = offer?.expires_at || offer?.elevated_until;
  const expired = Boolean(expiry && expiry.slice(0, 10) < today);
  // Exclude historical review notes/conflict artifacts from the live prompt.
  const currentOffer = offer ? Object.fromEntries(Object.entries(offer).filter(([key]) => [
    'bonus_points', 'statement_credit', 'travel_credit', 'spending_requirement',
    'time_period_months', 'point_program', 'description', 'free_nights',
    'free_night_value_cap', 'expires_at', 'elevated_until', 'offer_status', 'last_verified',
  ].includes(key))) : undefined;
  return {
    card_id: card.card_id,
    name: card.name,
    issuer: card.issuer,
    ongoing_annual_fee: card.annual_fee,
    annual_fee_terms: card.annual_fee_description || 'No introductory fee terms recorded; do not assume a waiver.',
    earning_rates: card.earning_rates,
    tags: card.tags,
    welcome_offer: expired ? { status: 'expired_do_not_recommend', expires_at: expiry } : currentOffer,
    offer_audience: offer?.offer_status || 'unspecified; do not assume public eligibility',
    last_updated: card.last_updated,
    offer_last_verified: offer?.last_verified || 'unknown',
    sources: card.sources.map(source => source.url),
  };
}

export const CARD_FACT_RULES = `The CARD DATABASE is the only authority for card-specific numbers and terms. Do not replace it with model memory or claims in conversation history.
Ongoing annual fees and introductory first-year terms are different. Mention a waiver only when annual_fee_terms explicitly records it.
Public, targeted, prequalified and unspecified offers are not interchangeable. Do not promise eligibility or approval.
Expired offers must not be recommended. A source URL or last-updated date is not proof of a fresh verification. If terms or benefits are absent, say they are not verified and direct users to official issuer terms; never invent them.
Use earnings notes and caps when comparing rewards. Do not equate point multipliers with cash-back percentages.`;
