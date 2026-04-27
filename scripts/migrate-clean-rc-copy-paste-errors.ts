/**
 * Clean copy-paste errors in recurring_credits across 11+ cards.
 *
 * Errors detected by audit (2026-04-27):
 *   - "Wrong card" — credits like Uber Cash / Walmart+ / Saks / CLEAR
 *     listed on cards that don't actually offer them (often hand-curated
 *     cards copy-pasted from amex-platinum's RC).
 *   - "Points as USD" — Marriott/Hilton Free Night certificates with
 *     amount=35000 / 50000 (point values written into a USD field).
 *   - "Anniversary points" — Southwest/United anniversary point bonuses
 *     stored as recurring_credits with amount=3000-7500 (points, not
 *     USD; not a recurring USD credit per OpenCard schema).
 *   - "Discontinued benefits" — Saks Fifth Avenue $0 (discontinued 2026
 *     even on cards that did have it).
 *
 * Strategy: REMOVE the bad entries. Cards that need full re-research
 * (e.g. amex-biz-platinum) get refreshed in separate staging-driven
 * commits; this migration is just hygiene cleanup.
 *
 * Free Night Awards: REMOVE for now (points-as-USD), add back in a
 * future commit when Q2 free-night-fair-value schema decision lands.
 *
 * Usage:
 *   npx tsx scripts/migrate-clean-rc-copy-paste-errors.ts          # dry-run
 *   npx tsx scripts/migrate-clean-rc-copy-paste-errors.ts --apply
 */
import * as fs from "fs";
import * as path from "path";

interface Credit {
  name: string;
  amount?: number;
  frequency?: string;
  category?: string;
  description?: string;
  source?: string;
  reset_type?: string;
}

// Removal rules: predicate per (card_id, credit) pair
type RemovalRule = (cardId: string, credit: Credit) => string | null;
//                                                       ^reason if remove, null if keep

const RULES: RemovalRule[] = [
  // Walmart+ only on amex-platinum
  (id, c) => /walmart/i.test(c.name) && id !== "amex-platinum"
    ? `Walmart+ Credit only on amex-platinum, not ${id}`
    : null,
  // Saks discontinued 2026 — remove from ALL cards (was Platinum-only anyway)
  (_id, c) => /\bsaks\b/i.test(c.name)
    ? `Saks Fifth Avenue discontinued in 2026`
    : null,
  // Uber Cash only on amex-platinum (consumer) and amex-biz-gold (biz)
  (id, c) => /uber cash|^uber$/i.test(c.name) && !["amex-platinum", "amex-biz-gold", "amex-gold"].includes(id)
    ? `Uber Cash only on amex-platinum/amex-biz-gold/amex-gold, not ${id}`
    : null,
  // Free Night Award with points amount (35k/50k/85k) → remove pending Q2 fair-value schema
  (_id, c) =>
    /free night|companion award/i.test(c.name) &&
    typeof c.amount === "number" &&
    [25000, 35000, 50000, 85000, 100000].includes(c.amount)
      ? `Free Night/Companion Award stored as points (${c.amount}) in USD field — remove pending Q2 fair-value decision`
      : null,
  // Anniversary points (Southwest, United, Alaska) — not USD credits
  (_id, c) =>
    /anniversary points|companion award|status points|better together bonus/i.test(c.name) &&
    typeof c.amount === "number" &&
    c.amount >= 1000
      ? `Anniversary points/status bonus is points, not USD — out of scope for recurring_credits`
      : null,
  // CLEAR Plus only on cards documented to have it (amex-platinum, amex-biz-platinum, hilton-aspire, amex-green; amex-gold added it Q4 2024)
  (id, c) =>
    /\bclear\b/i.test(c.name) &&
    !["amex-platinum", "amex-biz-platinum", "amex-hilton-honors-aspire", "amex-green", "amex-gold"].includes(id)
      ? `CLEAR Plus credit not documented on ${id} — copy-paste suspected`
      : null,
  // Fine Hotels + Resorts is a Platinum-tier benefit
  (id, c) => /fine hotels|fhr/i.test(c.name) &&
    !id.includes("platinum") && id !== "centurion-card-amex"
      ? `FHR benefit is Platinum-tier only, not ${id}`
      : null,
];

interface CleanPlan {
  card_id: string;
  file: string;
  before: Credit[];
  after: Credit[];
  removals: { credit: Credit; reasons: string[] }[];
}

function planClean(file: string): CleanPlan | null {
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  const before: Credit[] = Array.isArray(card.recurring_credits) ? card.recurring_credits : [];
  if (before.length === 0) return null;

  const after: Credit[] = [];
  const removals: CleanPlan["removals"] = [];

  for (const credit of before) {
    const reasons = RULES.map((r) => r(card.card_id, credit)).filter((x): x is string => !!x);
    if (reasons.length > 0) {
      removals.push({ credit, reasons });
    } else {
      after.push(credit);
    }
  }

  if (removals.length === 0) return null;
  return { card_id: card.card_id, file, before, after, removals };
}

function main() {
  const apply = process.argv.includes("--apply");
  const cardsDir = path.join(process.cwd(), "data", "cards");
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

  const plans: CleanPlan[] = [];
  for (const f of files) {
    const p = planClean(path.join(cardsDir, f));
    if (p) plans.push(p);
  }

  console.log(`${apply ? "✅ APPLY" : "💤 DRY RUN"} — Clean RC copy-paste errors`);
  console.log();
  console.log(`📋 Cards with removals (${plans.length}):`);
  let totalRemoved = 0;
  for (const p of plans) {
    console.log(`  ${p.card_id}  (${p.before.length} → ${p.after.length})`);
    for (const r of p.removals) {
      totalRemoved++;
      console.log(`    − ${r.credit.name.padEnd(36)} amount=${r.credit.amount ?? "?"}`);
      for (const reason of r.reasons) console.log(`        ${reason}`);
    }
  }
  console.log();
  console.log(`Total credits removed: ${totalRemoved}`);

  if (!apply) {
    console.log();
    console.log(`(Dry run — pass --apply to write.)`);
    return;
  }

  const now = new Date().toISOString();
  for (const p of plans) {
    const card = JSON.parse(fs.readFileSync(p.file, "utf8"));
    card.recurring_credits = p.after;
    card.last_updated = now;
    const trailing = fs.readFileSync(p.file, "utf8").endsWith("\n") ? "\n" : "";
    fs.writeFileSync(p.file, JSON.stringify(card, null, 2) + trailing);
  }
  console.log();
  console.log(`✅ ${plans.length} files updated.`);
}

main();
