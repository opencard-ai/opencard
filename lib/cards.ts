const FORCE_CARDS_LIST = ['amazon-store-card', 'amex-amazon-business-prime', 'amex-bce', 'amex-bcp', 'amex-blue-business-cash', 'amex-blue-business-plus', 'amex-business-gold', 'amex-cash-magnet', 'amex-centurion', 'amex-delta-blue', 'amex-delta-gold', 'amex-delta-gold-biz', 'amex-delta-platinum', 'amex-delta-reserve', 'amex-everyday-preferred', 'amex-gold', 'amex-graphite-business', 'amex-green', 'amex-hilton-aspire', 'amex-hilton-biz-platinum', 'amex-hilton-honors', 'amex-hilton-honors-business', 'amex-hilton-surpass', 'amex-marriott-bonvoy-amex', 'amex-marriott-brilliant', 'amex-morgan-stanley-blue', 'amex-morgan-stanley-platinum', 'amex-platinum', 'apple-card', 'barclays-aadvantage-red', 'barclays-aadvantage-silver', 'barclays-jetblue-biz', 'barclays-jetblue-plus', 'barclays-uber-card', 'barclays-wyndham-earner', 'barclays-wyndham-earner-biz', 'barclays-wyndham-earner-plus', 'barclays-wyndham-earner-plus-biz', 'bilt-blue', 'bilt-obsidian', 'bilt-palladium', 'boa-alaska-ascent', 'boa-alaska-summit', 'boa-customized-cash-rewards', 'boa-travel-rewards', 'capital-one-quicksilver', 'capital-one-savor', 'capital-one-savorone', 'capital-one-spark-miles', 'capital-one-venture', 'capital-one-venture-x', 'cathay-pacific-card', 'chase-aeroplan', 'chase-disney-inspire', 'chase-disney-premier', 'chase-disney-visa', 'chase-freedom-flex', 'chase-freedom-rise', 'chase-freedom-unlimited', 'chase-hyatt', 'chase-ihg-premier', 'chase-ink-business-cash', 'chase-ink-business-preferred', 'chase-ink-business-unlimited', 'chase-ink-preferred-plus', 'chase-marriott-boundless', 'chase-marriott-bountiful', 'chase-ritz-carlton', 'chase-sapphire-preferred', 'chase-sapphire-reserve', 'chase-southwest-performance-biz', 'chase-southwest-performance-plus', 'chase-southwest-priority', 'chase-united-biz', 'chase-united-explorer', 'chase-united-gateway', 'chase-united-infinite', 'chase-united-quest', 'chase-united-quest-biz', 'citi-aa-exec', 'citi-aa-mileup', 'citi-aa-mileup-biz', 'citi-aa-platinum-select', 'citi-costco-anywhere', 'citi-costco-biz', 'citi-custom-cash', 'citi-dividend', 'citi-double-cash', 'citi-premier', 'citi-prestige', 'citi-strata-elite', 'citi-strata-elite-premier', 'citi-strata-premier', 'coinbase-one', 'discover-it', 'discover-it-cash-back', 'discover-it-miles', 'fidelity-rewards', 'fidelity-rewards-visa', 'hsbc-elite', 'hsbc-premier', 'nordstrom-card', 'nordstrom-retail', 'paypal-cashback', 'pnc-cash-rewards', 'robinhood-gold', 'robinhood-gold-card', 'robinhood-platinum', 'state-farm-cash-medallion', 'synchrony-cathay-biz', 'usbank-altitude-connect', 'usbank-altitude-connect-biz', 'usbank-altitude-go', 'usbank-altitude-go-biz', 'usbank-altitude-reserve', 'usbank-business-triple-cash', 'usbank-cash-plus', 'usbank-smartly', 'venmo-card', 'verizon-visa', 'walgreens-mastercard', 'wellsfargo-active-cash', 'wellsfargo-active-cash-biz', 'wellsfargo-autograph-journey', 'wellsfargo-choice-privileges', 'wellsfargo-one-key', 'wellsfargo-one-key-plus', 'wellsfargo-reflect'];






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
