import { getAllCards, type CreditCard } from "@/lib/cards";

export interface UserPreferences {
  rewardTypes: string[];       // ["travel", "cashback", "points"]
  topCategories: string[];       // ["dining", "groceries", "travel", "gas", "online"]
  annualFeeTolerance: number;    // 0 = no fee, 300 = up to $300
  travelFrequency: number;       // 1-5, how often they travel
  creditScore: string;           // "excellent" | "good" | "fair" | "building"
  currentCards?: string[];       // card IDs they already have
  preferredIssuer?: string;     // "chase" | "amex" | "citi" | "capital one" | any
  internationalUse?: boolean;   // travel abroad frequently
}

export interface CardScore {
  card: CreditCard;
  score: number;
  reasons: string[];
  matchTags: string[];
}

export function scoreCards(prefs: UserPreferences): CardScore[] {
  const cards = getAllCards();
  const results: CardScore[] = [];

  for (const card of cards) {
    const { score, reasons, matchTags } = evaluateCard(card, prefs);
    results.push({ card, score, reasons, matchTags });
  }

  // Sort by score descending, deduplicate
  const sorted = results
    .filter(r => r.score > 10)  // minimum threshold
    .sort((a, b) => b.score - a.score);

  // Return top 3 + top runner-up in different issuer
  const top3 = sorted.slice(0, 3);
  return top3;
}

function evaluateCard(card: CreditCard, prefs: UserPreferences): { score: number; reasons: string[]; matchTags: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const matchTags: string[] = [];

  // === 1. REWARD TYPE MATCH (weight: 30%) ===
  if (prefs.rewardTypes.length > 0) {
    const rewardScore = getRewardTypeScore(card, prefs.rewardTypes);
    score += rewardScore * 0.30;

    if (rewardScore > 60) {
      matchTags.push(card.earning_rates[0]?.category || "general");
    }
  }

  // === 2. CATEGORY EARNING RATES (weight: 35%) ===
  const categoryScore = getCategoryScore(card, prefs.topCategories);
  score += categoryScore * 0.35;

  if (categoryScore > 20) {
    const topCats = prefs.topCategories.slice(0, 2);
    const matched = topCats
      .map(cat => card.earning_rates.find(r => r.category === cat))
      .filter(Boolean);
    if (matched.length > 0) {
      matched.forEach(r => {
        if (r) reasons.push(`${r.rate}× on ${r.category}`);
      });
    }
  }

  // === 3. ANNUAL FEE (weight: 15%) ===
  const feeScore = getAnnualFeeScore(card, prefs.annualFeeTolerance);
  score += feeScore * 0.15;

  // === 4. WELCOME BONUS (weight: 15%) ===
  const welcomeScore = getWelcomeBonusScore(card);
  score += welcomeScore * 0.15;

  if (welcomeScore > 40) {
    const wo = card.welcome_offer;
    if (wo?.bonus_points && wo.estimated_value) {
      reasons.push(`Welcome bonus: ~$${wo.estimated_value} value${wo.spending_requirement ? ` (spend $${wo.spending_requirement.toLocaleString()})` : ''}`);
    }
  }

  // === 5. TRAVEL BENEFITS (weight: 10%) ===
  if (prefs.travelFrequency >= 3) {
    const travelScore = getTravelScore(card);
    score += travelScore * 0.10;
    if (travelScore > 50) {
      reasons.push(`Travel benefits: ${card.travel_benefits?.lounge_access?.length || 0} lounges, hotel status available`);
      matchTags.push("travel");
    }
  }

  // === 6. FOREIGN TRANSACTION FEE ===
  if (prefs.internationalUse && card.foreign_transaction_fee === 0) {
    score += 8;
    reasons.push("No foreign transaction fee");
  }

  // === 7. PREFERRED ISSUER ===
  if (prefs.preferredIssuer && card.issuer.toLowerCase().includes(prefs.preferredIssuer.toLowerCase())) {
    score += 10;
  }

  // === 8. PENALIZE ALREADY-OWNED CARDS ===
  if (prefs.currentCards && prefs.currentCards.includes(card.card_id)) {
    score = score * 0.1; // severe penalty — mark as "already have"
  }

  return { score: Math.round(score * 10) / 10, reasons, matchTags };
}

function getRewardTypeScore(card: CreditCard, rewardTypes: string[]): number {
  // Cash back cards
  const cashbackCards = ["discover-it", "chase-freedom-flex", "citi-double-cash", "boa-customized-cash-rewards"];
  // Travel cards
  const travelCards = ["chase-sapphire-preferred", "chase-sapphire-reserve", "amex-platinum", "amex-gold", "capital-one-venture-x"];
  // Points cards
  const pointsCards = ["amex-green", "chase-sapphire-preferred", "amex-platinum", "chase-sapphire-reserve"];

  for (const rt of rewardTypes) {
    if (rt === "cashback" && cashbackCards.includes(card.card_id)) return 85;
    if (rt === "travel" && travelCards.includes(card.card_id)) return 85;
    if (rt === "points" && pointsCards.includes(card.card_id)) return 80;
  }

  // Generic scoring based on earning rates
  const hasBonus = card.earning_rates.some(r => r.rate >= 3);
  return hasBonus ? 60 : 40;
}

function getCategoryScore(card: CreditCard, categories: string[]): number {
  if (!categories.length) return 50;

  let total = 0;
  let count = 0;
  for (const cat of categories) {
    const rate = card.earning_rates.find(r => r.category === cat);
    if (rate) {
      total += rate.rate * 10;
      count++;
    }
  }
  return count > 0 ? total / count : 20;
}

function getAnnualFeeScore(card: CreditCard, tolerance: number): number {
  if (card.annual_fee === 0) return 100;
  if (card.annual_fee > tolerance) return 0;
  if (tolerance === 0) return card.annual_fee === 0 ? 100 : 20;

  // How much value does the card give relative to its fee?
  const valueFromCredits = card.recurring_credits?.reduce((sum, c) => {
    if (c.frequency === "annual" || c.frequency === "cardmember_year") return sum + c.amount;
    if (c.frequency === "monthly") return sum + c.amount * 12;
    if (c.frequency === "quarterly") return sum + c.amount * 4;
    if (c.frequency === "semi_annual") return sum + c.amount * 2;
    return sum;
  }, 0) || 0;

  // Net cost after credits
  const netCost = Math.max(0, card.annual_fee - valueFromCredits);
  if (netCost === 0) return 95;

  const penalty = (netCost / tolerance) * 100;
  return Math.max(0, 100 - penalty);
}

function getWelcomeBonusScore(card: CreditCard): number {
  if (!card.welcome_offer) return 0;
  const wo = card.welcome_offer;
  const ev = wo.estimated_value || (wo.bonus_points ? wo.bonus_points / 100 : 0);

  if (ev >= 1000) return 100;
  if (ev >= 600) return 85;
  if (ev >= 300) return 70;
  if (ev >= 100) return 50;
  return 30;
}

function getTravelScore(card: CreditCard): number {
  let score = 0;
  const tb = card.travel_benefits;

  if (tb?.lounge_access?.length) score += Math.min(tb.lounge_access.length * 15, 45);
  if (tb?.hotel_status?.length) score += Math.min(tb.hotel_status.length * 15, 30);
  if (tb?.other_benefits?.length) score += Math.min(tb.other_benefits.length * 5, 15);
  if (card.insurance?.trip_delay) score += 10;
  if (card.insurance?.trip_cancellation) score += 10;

  return Math.min(score, 100);
}

export function generateRecommendationExplanation(scores: CardScore[], prefs: UserPreferences): string {
  if (scores.length === 0) return "Sorry, I couldn't find cards matching your preferences. Try adjusting your criteria.";

  const top = scores[0];

  // Build context string
  const context = {
    topCard: top.card.name,
    topScore: top.score,
    topReasons: top.reasons,
    totalCards: scores.length,
    secondCard: scores[1]?.card.name || null,
  };

  return `Based on your preferences, here are my top recommendations:\n\n` +
    scores.map((s, i) =>
      `${i + 1}. **${s.card.name}** (${s.card.issuer}) — Score: ${s.score}/100\n` +
      s.reasons.map(r => `   • ${r}`).join("\n")
    ).join("\n\n");
}