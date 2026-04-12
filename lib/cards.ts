import fs from "fs";
import path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");

export interface EarningRate {
  category: string;
  rate: number;
  program?: string;
  notes?: string;
}

export interface AnnualCredit {
  name: string;
  amount: number;
  description: string;
  frequency: string;
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
  points_per_dollar?: number | null;
  free_night_award?: boolean;
  elite_night_credits?: number;
  elite_status?: string;
}

export interface WelcomeOffer {
  spending_requirement?: number;
  time_period_months?: number;
  bonus_points?: number;
  estimated_value?: number;
  point_program?: string;
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
  annual_credits: AnnualCredit[];
  travel_benefits: TravelBenefits;
  fhr_thc: {
    fhr_eligible: boolean;
    thc_eligible: boolean;
    notes?: string;
  };
  insurance: Insurance;
  hotel_program?: HotelProgram;
  application_rules?: {
    rules: string[];
    notes?: string;
  };
  last_updated: string;
  sources: Source[];
  tags: string[];
}

export function getAllCards(): CreditCard[] {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((file) => {
      const content = fs.readFileSync(path.join(CARDS_DIR, file), "utf-8");
      return JSON.parse(content) as CreditCard;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCardById(cardId: string): CreditCard | null {
  const filePath = path.join(CARDS_DIR, `${cardId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as CreditCard;
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
