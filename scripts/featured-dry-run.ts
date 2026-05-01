/**
 * Preview what the cards-section default view will look like with the new
 * popularity sort, and surface a hand-picked recommendation list of cards
 * worth flagging `featured: true`.
 *
 * Outputs:
 *   1. Current top 6 per tier (popularityScore desc, name asc) — what users
 *      see today right after this commit lands.
 *   2. Recommended featured candidates per tier — iconic cards that arguably
 *      should be pinned even if their welcome bonus isn't the absolute
 *      highest in their tier. Editor can review and stamp `featured: true`
 *      onto the JSON files.
 *
 * Pure preview — does not write anything.
 */
import * as fs from "fs";
import * as path from "path";

interface Card {
  card_id: string;
  name: string;
  issuer: string;
  annual_fee: number;
  tags?: string[];
  welcome_offer?: { estimated_value?: number; bonus_points?: number; bonus_value?: string };
  featured?: boolean;
}

type Tier =
  | "premium"
  | "mid-premium"
  | "low-fee"
  | "no-fee"
  | "business"
  | "secured-student";

const TIER_ORDER: Tier[] = [
  "premium",
  "mid-premium",
  "low-fee",
  "no-fee",
  "business",
  "secured-student",
];
const TIER_LABEL: Record<Tier, string> = {
  premium: "💎 Premium ($101+)",
  "mid-premium": "🌟 Mid-Premium ($90-100)",
  "low-fee": "🎯 Low-fee ($1-$89)",
  "no-fee": "✓ No Annual Fee",
  business: "🏢 Business",
  "secured-student": "🎓 Student & Secured",
};

function getTier(card: Card): Tier {
  const tags = card.tags || [];
  if (tags.includes("secured") || tags.includes("student")) return "secured-student";
  if (tags.includes("business")) return "business";
  if (card.annual_fee > 100) return "premium";
  if (card.annual_fee >= 90) return "mid-premium";
  if (card.annual_fee > 0) return "low-fee";
  return "no-fee";
}

function popularityScore(card: Card): number {
  if (card.featured === true) return Number.MAX_SAFE_INTEGER;
  const ev = Number(card.welcome_offer?.estimated_value);
  if (Number.isFinite(ev) && ev > 0) return ev;
  const bv = card.welcome_offer?.bonus_value;
  if (bv != null) {
    const parsed = parseFloat(String(bv).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

// Hand-picked iconic / well-known cards per tier — the kind a knowledgeable
// editor would want pinned. Subset that may or may not have the highest
// welcome bonus in their tier today.
const RECOMMENDED_FEATURED: Record<Tier, string[]> = {
  premium: [
    "amex-platinum",
    "amex-gold",
    "amex-biz-platinum",
    "amex-biz-gold",
    "chase-sapphire-reserve",
    "chase-sapphire-reserve-biz",
    "capital-one-venture-x",
    "amex-hilton-honors-aspire",
    "amex-marriott-brilliant",
    "citi-strata-elite",
  ],
  "mid-premium": [
    "chase-sapphire-preferred",
    "capital-one-venture",
    "chase-hyatt",
    "chase-marriott-boundless",
    "bilt-obsidian",
  ],
  "low-fee": [],
  "no-fee": [
    "chase-freedom-unlimited",
    "chase-freedom-flex",
    "capital-one-savorone",
    "wells-fargo-active-cash",
    "discover-it",
  ],
  business: [
    "chase-ink-biz-preferred",
    "chase-ink-biz-cash",
    "chase-ink-biz-unlimited",
    "amex-blue-biz-plus",
    "amex-blue-biz-cash",
  ],
  "secured-student": [
    "discover-it-student",
    "capital-one-quicksilver-secured",
    "capital-one-platinum-secured",
  ],
};

function main() {
  const dir = path.join(process.cwd(), "data/cards");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const cards: Card[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));

  console.log("=".repeat(70));
  console.log("CURRENT TOP 6 PER TIER (no featured flags set yet)");
  console.log("=".repeat(70));

  for (const tier of TIER_ORDER) {
    const inTier = cards
      .filter((c) => getTier(c) === tier)
      .sort((a, b) => popularityScore(b) - popularityScore(a) || a.name.localeCompare(b.name));
    console.log(`\n${TIER_LABEL[tier]} — ${inTier.length} cards`);
    inTier.slice(0, 6).forEach((c, i) => {
      const ev = popularityScore(c);
      const evStr = ev > 0 && ev !== Number.MAX_SAFE_INTEGER ? `$${ev.toLocaleString()}` : "—";
      console.log(`  ${(i + 1).toString().padStart(2)}. ${c.card_id.padEnd(45)} ${evStr}`);
    });
  }

  console.log("\n" + "=".repeat(70));
  console.log("RECOMMENDED FEATURED CANDIDATES");
  console.log("(Iconic cards that may or may not be in top 6 today.)");
  console.log("=".repeat(70));

  for (const tier of TIER_ORDER) {
    const inTier = cards
      .filter((c) => getTier(c) === tier)
      .sort((a, b) => popularityScore(b) - popularityScore(a) || a.name.localeCompare(b.name));
    const top6Ids = new Set(inTier.slice(0, 6).map((c) => c.card_id));

    const recommended = RECOMMENDED_FEATURED[tier];
    console.log(`\n${TIER_LABEL[tier]}`);
    for (const id of recommended) {
      const card = cards.find((c) => c.card_id === id);
      if (!card) {
        console.log(`  ${"⚠ MISSING".padEnd(13)} ${id} — not found in catalog`);
        continue;
      }
      const inTop = top6Ids.has(id);
      const ev = popularityScore(card);
      const evStr = ev > 0 && ev !== Number.MAX_SAFE_INTEGER ? `$${ev.toLocaleString()}` : "—";
      console.log(`  ${(inTop ? "✓ in top 6" : "↑ promote").padEnd(13)} ${id.padEnd(45)} ${evStr}`);
    }
  }

  console.log();
}

main();
