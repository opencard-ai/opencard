


import fs from "fs";
import path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");

export interface EarningRate {
  category: string;
  rate: number;
  program?: string;
  notes?: string;
}

export interface RecurringCredit {
  /** Stable id for per-user check-off state. Set once via scripts/add-credit-keys.ts; never overwrite. */
  credit_key?: string;
  name: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual" | "per_stay" | "cardmember_year" | "every_4_years" | string;
  category: string;
  description: string;
  reset_type?: "calendar_year" | "cardmember_year" | "every_4_years" | "anniversary" | "monthly" | "calendar_quarter" | "calendar_half" | string;
  source?: string;
  /** True for Free Night Awards (FNA) — amount=0 by convention; downstream UI should show "Free Night Award" instead of "$0". */
  is_free_night?: boolean;
}

export interface HotelStatus {
  program: string;
  tier: string;
  complimentary: boolean;
}

export interface LoungeAccess {
  name: string;
  type: string;
  /** Limited entry passes per quarter (e.g. Alaska Lounge: 2/quarter on Summit). */
  passes_per_quarter?: number;
  /** Limited entry passes per cardmember year. */
  passes_per_year?: number;
  /** Free-text discount/perk note (e.g. "$100 off annual membership"). */
  discount?: string;
}

export interface TravelBenefits {
  lounge_access?: LoungeAccess[];
  hotel_status?: HotelStatus[];
  other_benefits?: { name: string; description: string }[];
}

export interface Insurance {
  trip_cancellation?: boolean;
  trip_delay?: boolean;
  rental_insurance?: string;
  purchase_protection?: boolean;
  return_protection?: boolean;
  extended_warranty?: boolean;
}

export interface HotelProgram {
  program: string;
  tier: string;
  elite_night_credits?: number;
  fhr_eligible?: boolean;
  thc_eligible?: boolean;
}

export interface WelcomeOffer {
  spending_requirement?: number;
  time_period_months?: number;
  bonus_points?: number;
  estimated_value?: number;
  point_program?: string;
  description?: string;
  bonus_value?: string;
  /** Hand-curated: this offer is above the card's normal/standard bonus right now. */
  is_elevated?: boolean;
  /** The card's standard/non-elevated bonus, for comparison badges. */
  normal_bonus_points?: number;
  /** ISO date the elevated offer is expected to expire (informational only). */
  elevated_until?: string;
}

export interface Source {
  url: string;
}

export interface CreditCard {
  card_id: string;
  name: string;
  issuer: string;
  network: string;
  annual_fee: number;
  foreign_transaction_fee: number;
  credit_required: string;
  welcome_offer?: WelcomeOffer;
  earning_rates: EarningRate[];
  travel_benefits: TravelBenefits;
  insurance: Insurance;
  hotel_program?: HotelProgram;
  application_rules?: {
    rules: Array<{ rule: string; description: string }>;
    notes?: string;
  };
  last_updated: string;
  sources: Source[];
  tags: string[];
  status?: string;
  recurring_credits?: RecurringCredit[];
  /** Hand-picked "popular" flag — pinned to the top of its tier in the
   *  cards-section default browse view. Optional; when absent, popularity
   *  falls back to welcome_offer.estimated_value then alphabetical. */
  featured?: boolean;
}

export function getAllCards(): CreditCard[] {
  try {
    const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  return files
    .map((file) => {
      const content = fs.readFileSync(path.join(CARDS_DIR, file), "utf-8");
      return JSON.parse(content) as CreditCard;
    })
    .filter((card) => 
      card.card_id && 
      card.name && 
      card.annual_fee !== undefined && 
      Array.isArray(card.earning_rates)
    ) // Filter out non-card entries (articles, guides, etc.)
    .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.error("getAllCards error:", e);
    return [];
  }
}

export function getCardById(cardId: string): CreditCard | null {
  // Look up by card_id field (not filename) to handle mismatches gracefully
  const cards = getAllCards();
  return cards.find((c) => c.card_id === cardId) || null;
}

export function getAllIssuers(): string[] {
  const cards = getAllCards();
  return [...new Set(cards.map((c) => c.issuer))].sort();
}

export function getAllTags(): string[] {
  const cards = getAllCards();
  const tags = cards.flatMap((c) => c.tags || []);
  return [...new Set(tags)].sort();
}
