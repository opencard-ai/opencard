


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
  name: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual" | "per_stay" | "cardmember_year" | string;
  category: string;
  description: string;
  reset_type?: "calendar_year" | "cardmember_year";
}

export interface HotelStatus {
  program: string;
  tier: string;
  complimentary: boolean;
}

export interface TravelBenefits {
  lounge_access?: { name: string; type: string }[];
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
