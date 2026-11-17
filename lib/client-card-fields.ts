// Slim card shapes for Client Components on /[lang]/find and
// /[lang]/elevated-offers. Passing full CreditCard records serialized every
// field (sources, credits, insurance, rules, notes...) into the RSC payload
// (~620 KB per locale) and the ISR cache. Only the fields the client code
// reads are kept here. Keys that are absent stay absent (never set to
// undefined), so truthiness / `?.length` checks behave exactly as before.
// Type-only imports: this file has no fs dependency.
import type { CreditCard, EarningRate, WelcomeOffer } from "./cards";

const WELCOME_OFFER_KEYS = [
  "bonus_points",
  "bonus_type",
  "discount_percent",
  "estimated_value",
  "bonus_value",
  "bonus_points_max",
  "offer_status",
  "point_program",
  "spending_requirement",
  "time_period_months",
  "is_elevated",
  "normal_bonus_points",
] as const;

export type ClientWelcomeOffer = Pick<WelcomeOffer, (typeof WELCOME_OFFER_KEYS)[number]>;

/** Fields used by ElevatedOffersList. */
export type OfferListCard = Pick<CreditCard, "card_id" | "name" | "issuer" | "annual_fee"> & {
  welcome_offer?: ClientWelcomeOffer;
};

/** Fields used by FindWizard, CardRow and CompareBar. */
export type FindCard = OfferListCard &
  Pick<CreditCard, "credit_required" | "featured" | "tags"> & {
    earning_rates: Pick<EarningRate, "category" | "rate">[];
    travel_benefits?: { lounge_access?: { name: string; type: string }[] };
  };

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function slimWelcomeOffer(w: WelcomeOffer | undefined): ClientWelcomeOffer | undefined {
  return w ? pick(w, WELCOME_OFFER_KEYS) : undefined;
}

export function toOfferListCard(card: CreditCard): OfferListCard {
  const out: OfferListCard = pick(card, ["card_id", "name", "issuer", "annual_fee"] as const);
  const w = slimWelcomeOffer(card.welcome_offer);
  if (w) out.welcome_offer = w;
  return out;
}

export function toFindCard(card: CreditCard): FindCard {
  const out = {
    ...toOfferListCard(card),
    ...pick(card, ["credit_required", "featured", "tags"] as const),
    earning_rates: card.earning_rates.map((r) => pick(r, ["category", "rate"] as const)),
  } as FindCard;
  if (card.travel_benefits) {
    const la = card.travel_benefits.lounge_access;
    out.travel_benefits = la ? { lounge_access: la.map((l) => pick(l, ["name", "type"] as const)) } : {};
  }
  return out;
}
