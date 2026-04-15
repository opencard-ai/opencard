const FORCE_CARDS_LIST = ['amazon-store-card', 'amex-amazon-business-prime', 'amex-bce', 'amex-bcp', 'amex-blue-business-cash', 'amex-blue-business-plus', 'amex-business-gold', 'amex-cash-magnet', 'amex-centurion', 'amex-delta-blue', 'amex-delta-gold', 'amex-delta-gold-biz', 'amex-delta-platinum', 'amex-delta-reserve', 'amex-everyday-preferred', 'amex-gold', 'amex-graphite-business', 'amex-green', 'amex-hilton-aspire', 'amex-hilton-biz-platinum', 'amex-hilton-honors', 'amex-hilton-honors-business', 'amex-hilton-surpass', 'amex-marriott-bonvoy-amex', 'amex-marriott-brilliant', 'amex-morgan-stanley-blue', 'amex-morgan-stanley-platinum', 'amex-platinum', 'apple-card', 'barclays-aadvantage-red', 'barclays-aadvantage-silver', 'barclays-jetblue-biz', 'barclays-jetblue-plus', 'barclays-uber-card', 'barclays-wyndham-earner', 'barclays-wyndham-earner-biz', 'barclays-wyndham-earner-plus', 'barclays-wyndham-earner-plus-biz', 'bilt-blue', 'bilt-obsidian', 'bilt-palladium', 'boa-alaska-ascent', 'boa-alaska-summit', 'boa-customized-cash-rewards', 'boa-travel-rewards', 'capital-one-quicksilver', 'capital-one-savor', 'capital-one-savorone', 'capital-one-spark-miles', 'capital-one-venture', 'capital-one-venture-x', 'card-entry-1', 'card-entry-10', 'card-entry-100', 'card-entry-101', 'card-entry-102', 'card-entry-103', 'card-entry-104', 'card-entry-105', 'card-entry-106', 'card-entry-107', 'card-entry-108', 'card-entry-109', 'card-entry-11', 'card-entry-110', 'card-entry-111', 'card-entry-112', 'card-entry-113', 'card-entry-114', 'card-entry-115', 'card-entry-116', 'card-entry-117', 'card-entry-118', 'card-entry-119', 'card-entry-12', 'card-entry-120', 'card-entry-121', 'card-entry-122', 'card-entry-123', 'card-entry-124', 'card-entry-125', 'card-entry-126', 'card-entry-127', 'card-entry-128', 'card-entry-129', 'card-entry-13', 'card-entry-130', 'card-entry-131', 'card-entry-132', 'card-entry-133', 'card-entry-134', 'card-entry-135', 'card-entry-136', 'card-entry-137', 'card-entry-138', 'card-entry-139', 'card-entry-14', 'card-entry-140', 'card-entry-141', 'card-entry-142', 'card-entry-143', 'card-entry-144', 'card-entry-145', 'card-entry-146', 'card-entry-147', 'card-entry-148', 'card-entry-149', 'card-entry-15', 'card-entry-150', 'card-entry-151', 'card-entry-152', 'card-entry-153', 'card-entry-154', 'card-entry-155', 'card-entry-156', 'card-entry-16', 'card-entry-17', 'card-entry-18', 'card-entry-19', 'card-entry-2', 'card-entry-20', 'card-entry-21', 'card-entry-22', 'card-entry-23', 'card-entry-24', 'card-entry-25', 'card-entry-26', 'card-entry-27', 'card-entry-28', 'card-entry-29', 'card-entry-3', 'card-entry-30', 'card-entry-31', 'card-entry-32', 'card-entry-33', 'card-entry-34', 'card-entry-35', 'card-entry-36', 'card-entry-37', 'card-entry-38', 'card-entry-39', 'card-entry-4', 'card-entry-40', 'card-entry-41', 'card-entry-42', 'card-entry-43', 'card-entry-44', 'card-entry-45', 'card-entry-46', 'card-entry-47', 'card-entry-48', 'card-entry-49', 'card-entry-5', 'card-entry-50', 'card-entry-51', 'card-entry-52'];






import fs from "fs";
import path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");
// Force scan

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
  const files = FORCE_CARDS_LIST.map(id => `${id}.json`);
  console.log("FORCE_COUNT:", files.length);
  console.log("ACTUAL_FILE_LIST_COUNT:", files.length);
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
