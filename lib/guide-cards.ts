/**
 * Related-card links for guide pages. Cards named in the guide come first;
 * the rest are selected by a topic rule over structured card data, so every
 * link is backed by a field in the card record (no hand-entered claims).
 */
import fs from "fs";
import path from "path";
import type { CreditCard } from "@/lib/cards";
import { getAllCards } from "@/lib/cards";
import { isIndexableCard, CURATED_CARD_IDS } from "@/lib/indexable-cards";
import { applicableRules, knownNoForeignFee, shortCardName } from "@/lib/card-analysis";

export type GuideCardLink = { cardId: string; name: string; reason: string };

type Rule = { pick: (c: CreditCard) => boolean; reason: (c: CreditCard) => string; score?: (c: CreditCard) => number };

const fee = (c: CreditCard) => (c.annual_fee === 0 ? "no annual fee" : `$${c.annual_fee.toLocaleString("en-US")} annual fee`);
const lounges = (c: CreditCard) => (c.travel_benefits?.lounge_access || []).map((l) => l.name).slice(0, 2).join(" and ");
const creditsFace = (c: CreditCard) =>
  (c.recurring_credits || []).reduce((s, r) => {
    const a = Number(r.amount) || 0;
    const m: Record<string, number> = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1, cardmember_year: 1 };
    return s + a * (m[r.frequency] || 0);
  }, 0);

const premium: Rule = {
  pick: (c) => c.annual_fee >= 395 && (c.travel_benefits?.lounge_access?.length || 0) > 0,
  reason: (c) => `${fee(c)}; lounge access: ${lounges(c)}`,
  score: (c) => -c.annual_fee,
};
const creditHeavy: Rule = {
  pick: (c) => c.annual_fee > 0 && creditsFace(c) > 0,
  reason: (c) => `${fee(c)}; listed credits total about $${Math.round(creditsFace(c)).toLocaleString("en-US")} a year at face value`,
  score: (c) => creditsFace(c) / Math.max(c.annual_fee, 1),
};
const periodicCredits = (c: CreditCard) => (c.recurring_credits || []).filter((r) => r.frequency === "monthly" || r.frequency === "quarterly").length;
const trackHeavy: Rule = {
  pick: (c) => periodicCredits(c) >= 2,
  reason: (c) => `${fee(c)}; ${periodicCredits(c)} credits that reset monthly or quarterly`,
  score: (c) => periodicCredits(c),
};
const transferable: Rule = {
  pick: (c) => (c.tags || []).includes("transferable") && /membership rewards|ultimate rewards|thankyou|capital one|bilt/i.test(c.welcome_offer?.point_program || ""),
  reason: (c) => `${fee(c)}; earns ${c.welcome_offer?.point_program}`,
};
const welcome: Rule = {
  pick: (c) => !!c.welcome_offer?.is_elevated,
  reason: (c) => `${fee(c)}; currently flagged as an elevated welcome offer in our data`,
};
const starter: Rule = {
  pick: (c) => ["student", "secured"].some((t) => (c.tags || []).includes(t)),
  reason: (c) => `${fee(c)}; ${(c.tags || []).includes("secured") ? "secured card" : "student card"} for building credit`,
};
const issuerRules: Rule = {
  pick: (c) => applicableRules(c).length > 0,
  reason: (c) => `${fee(c)}; ${applicableRules(c).map((r) => r.rule).join(", ")}`,
};

const RULES: Record<string, Rule> = {
  "airport-lounge-access-guide": {
    pick: (c) => (c.travel_benefits?.lounge_access?.length || 0) > 0,
    reason: (c) => `${fee(c)}; ${lounges(c)}`,
  },
  "foreign-transaction-fees-and-dcc": {
    pick: knownNoForeignFee,
    reason: (c) => `${fee(c)}; listed with no foreign transaction fee`,
  },
  "credit-card-rental-car-insurance-guide": {
    pick: (c) => /primary/i.test(c.insurance?.rental_insurance || ""),
    reason: (c) => `${fee(c)}; listed with primary rental car coverage`,
  },
  "credit-card-purchase-protection-guide": {
    pick: (c) => c.insurance?.purchase_protection === true && c.insurance?.extended_warranty === true,
    reason: (c) => `${fee(c)}; listed with purchase protection and extended warranty`,
  },
  "credit-card-travel-protections-guide": {
    pick: (c) => c.insurance?.trip_delay === true && c.insurance?.trip_cancellation === true,
    reason: (c) => `${fee(c)}; listed with trip delay and trip cancellation coverage`,
  },
  "transfer-credit-card-points-guide": transferable,
  "transferable-points-101": transferable,
  "credit-card-points-valuation-guide": transferable,
  "cash-back-vs-travel-points": {
    pick: (c) => (c.tags || []).includes("cash-back") || (c.tags || []).includes("transferable"),
    reason: (c) => `${fee(c)}; ${(c.tags || []).includes("cash-back") ? "cash back" : "transferable points"}`,
  },
  "first-credit-card-guide": starter,
  "credit-utilization-guide": starter,
  "premium-travel-card-comparison-framework": premium,
  "premium-card-overlap-hidden-costs": premium,
  "welcome-offer-strategy": welcome,
  "welcome-bonus-minimum-spend-planning": welcome,
  "new-credit-card-onboarding-checklist": welcome,
  "credit-card-annual-fee-worth-it": creditHeavy,
  "credit-card-retention-offer-guide": creditHeavy,
  "downgrade-vs-cancel-credit-card": creditHeavy,
  "credit-card-benefit-expiration-guide": trackHeavy,
  "credit-card-benefit-tracking-system": trackHeavy,
  "credit-card-portfolio-guide": trackHeavy,
  "credit-card-application-sequencing": issuerRules,
  "chase-5-24-rule": {
    pick: (c) => applicableRules(c).some((r) => r.rule.includes("5/24")),
    reason: (c) => `${fee(c)}; our record lists the 5/24 rule`,
  },
};

function rank(a: CreditCard, b: CreditCard) {
  const score = (c: CreditCard) => (c.featured ? 4 : 0) + (CURATED_CARD_IDS.has(c.card_id) ? 2 : 0);
  return score(b) - score(a) || (b.welcome_offer?.estimated_value || 0) - (a.welcome_offer?.estimated_value || 0) || a.card_id.localeCompare(b.card_id);
}

function mentioned(slug: string, cards: CreditCard[]): CreditCard[] {
  let body = "";
  try {
    body = fs.readFileSync(path.join(process.cwd(), "content/guides", `${slug}.mdx`), "utf8").replace(/[®™℠]/g, "");
  } catch {
    return [];
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cards.filter((c) => {
    const s = shortCardName(c.name);
    const bare = s.replace(/^(American Express|Chase|Citi|Capital One|Bank of America|Wells Fargo|U\.S\. Bank|Discover|Barclays)\s+/i, "");
    return [s, bare].some((a) => a.split(/\s+/).length >= 2 && new RegExp(`\\b${esc(a)}\\b`, "i").test(body));
  });
}

export function getGuideCardLinks(slug: string, limit = 6): GuideCardLink[] {
  const cards = getAllCards().filter(isIndexableCard);
  const rule = RULES[slug];
  const out: CreditCard[] = [];
  for (const c of mentioned(slug, cards).sort(rank)) if (!out.includes(c)) out.push(c);
  if (rule) {
    const sorted = cards
      .filter(rule.pick)
      .sort((a, b) => (rule.score ? rule.score(b) - rule.score(a) : 0) || rank(a, b));
    const perIssuer = new Map<string, number>();
    for (const c of out) perIssuer.set(c.issuer, (perIssuer.get(c.issuer) || 0) + 1);
    for (const c of sorted) {
      if (out.length >= limit) break;
      if (out.includes(c) || (perIssuer.get(c.issuer) || 0) >= 2) continue;
      out.push(c);
      perIssuer.set(c.issuer, (perIssuer.get(c.issuer) || 0) + 1);
    }
  }
  return out.slice(0, limit).map((c) => ({
    cardId: c.card_id,
    name: shortCardName(c.name),
    reason: rule && rule.pick(c) ? rule.reason(c) : `${fee(c)}; mentioned in this guide`,
  }));
}
