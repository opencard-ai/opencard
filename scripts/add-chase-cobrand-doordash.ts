/**
 * One-shot helper: for every Chase co-brand credit card in data/cards/, append
 * the $10/quarterly DoorDash non-restaurant credit (DashPass enrollment required)
 * to recurring_credits, preserving existing entries.
 *
 * Per Chase official cobrand-doordash terms (verified 2026-04-28):
 *   "all Chase Co-Brand credit cards are eligible except the Amazon card,
 *    Instacart card, and DoorDash card."
 *   - https://www.chase.com/digital/resources/terms-of-use/cobrand-doordash
 *   - https://www.chase.com/digital/resources/terms-of-use/freedom-doordash (Freedom family)
 *
 * Writes to data/recurring-credits-research/staging/<id>.json with
 * _overwrite_existing:true so the merge script can be run with --allow-overwrite.
 *
 * Hard-codes excluded card_ids (NOT cobrand or excluded by terms).
 */
import * as fs from "fs";
import * as path from "path";

const COBRAND_AND_FREEDOM_IDS = [
  // Chase Freedom family (separate program but same $10/q non-restaurant DoorDash credit)
  "chase-freedom-flex",
  "chase-freedom-rise",
  "chase-freedom-unlimited",

  // Chase co-brand consumer
  "chase-aer-lingus-visa-signature",
  "chase-aeroplan",
  "chase-british-airways-visa-signature",
  "chase-disney-inspire",
  "chase-disney-premier",
  "chase-disney-visa",
  "chase-emirates-skywards-mastercard",
  "chase-hyatt",
  "chase-iberia-visa-signature",
  "chase-ihg-premier",
  "chase-marriott-boundless",
  "chase-ritz-carlton",
  "chase-southwest-priority",
  "chase-united-club",
  "chase-united-club-infinite",
  "chase-united-explorer",
  "chase-united-infinite",
  "chase-united-quest",
  "marriott-bonvoy-bold",
  "marriott-bonvoy-bountiful",
  "southwest-rapid-rewards-plus",

  // Chase co-brand business
  "chase-hyatt-biz",
  "chase-ihg-premier-biz",
  "chase-southwest-performance-biz",
  "chase-southwest-premier-biz",
  "chase-united-biz",
  "chase-united-club-biz",

  // IHG One Rewards Traveler (no chase- prefix in catalog id)
  "ihg-one-rewards-traveler",
];

const DOORDASH_CREDIT = {
  name: "DoorDash Non-Restaurant Credit",
  amount: 10,
  frequency: "quarterly" as const,
  category: "dining",
  description:
    "Up to $10 off one qualifying non-restaurant DoorDash order each calendar quarter (DashMart, 7-Eleven, CVS, Safeway, etc.). Requires active DashPass enrollment. Per Chase cobrand-doordash terms.",
  reset_type: "calendar_quarter",
  source_url: "https://www.chase.com/digital/resources/terms-of-use/cobrand-doordash",
  source_excerpt:
    "all Chase Co-Brand credit cards are eligible except the Amazon card, Instacart card, and DoorDash card",
};

const cardsDir = path.join(process.cwd(), "data", "cards");
const stagingDir = path.join(process.cwd(), "data", "recurring-credits-research", "staging");

interface Credit {
  name: string;
  amount: number;
  frequency: string;
  category?: string;
  description?: string;
  reset_type?: string;
  source?: string;
  source_url?: string;
  source_excerpt?: string;
}

function alreadyHasDoorDashCredit(rcs: Credit[]): boolean {
  return rcs.some((c) => /doordash/i.test(c.name) && c.amount === 10 && c.frequency === "quarterly");
}

function alreadyHasStaleDoorDash(rcs: Credit[]): { idx: number; rc: Credit } | null {
  const idx = rcs.findIndex((c) => /doordash/i.test(c.name) && !(c.amount === 10 && c.frequency === "quarterly"));
  return idx >= 0 ? { idx, rc: rcs[idx] } : null;
}

const summary: { id: string; action: string; from?: string; to?: string }[] = [];

for (const id of COBRAND_AND_FREEDOM_IDS) {
  const cardPath = path.join(cardsDir, `${id}.json`);
  if (!fs.existsSync(cardPath)) {
    summary.push({ id, action: "MISSING-CATALOG" });
    continue;
  }
  const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
  const existing: Credit[] = (card.recurring_credits || []).slice();

  let action = "";
  let newRcs: Credit[];

  if (alreadyHasDoorDashCredit(existing)) {
    summary.push({ id, action: "SKIP-already-correct" });
    continue;
  }

  const stale = alreadyHasStaleDoorDash(existing);
  if (stale) {
    // Replace stale DoorDash entry
    newRcs = existing.slice();
    newRcs[stale.idx] = { ...DOORDASH_CREDIT };
    action = "OVERWRITE-stale";
    summary.push({ id, action, from: `${stale.rc.name} $${stale.rc.amount}/${stale.rc.frequency}`, to: "DoorDash Non-Restaurant Credit $10/quarterly" });
  } else {
    // Append new DoorDash credit
    newRcs = [...existing, { ...DOORDASH_CREDIT }];
    action = "APPEND-new";
    summary.push({ id, action, from: `(existing ${existing.length} RC)`, to: `+ DoorDash $10/quarterly` });
  }

  // Build staging file
  const stagingPath = path.join(stagingDir, `${id}.json`);
  const existingStaging = fs.existsSync(stagingPath) ? JSON.parse(fs.readFileSync(stagingPath, "utf8")) : {};
  const staging = {
    card_id: id,
    researched_at: "2026-04-28",
    card_name_verified: card.name || existingStaging.card_name_verified || id,
    recurring_credits: newRcs,
    _no_credits_found: false,
    _needs_review: false,
    _overwrite_existing: true,
    _overwrite_reason:
      "Bulk add of $10/quarterly DoorDash non-restaurant credit per Chase official cobrand-doordash terms (verified 2026-04-28). All Chase co-brand and Freedom-family cards qualify (Amazon, Instacart, DoorDash cards excluded by terms).",
    _review_reason: action === "OVERWRITE-stale"
      ? `Replacing stale/incorrect DoorDash entry with current $10/quarterly per official Chase terms.`
      : `Appending DoorDash $10/quarterly credit per official Chase cobrand terms.`,
    sources_consulted: [
      "https://www.chase.com/digital/resources/terms-of-use/cobrand-doordash",
      "https://www.chase.com/digital/resources/terms-of-use/freedom-doordash",
      "https://help.doordash.com/consumers/s/article/Chase-Partnership",
      "https://upgradedpoints.com/credit-cards/chase-cards-doordash-perks/",
    ],
  };
  fs.writeFileSync(stagingPath, JSON.stringify(staging, null, 2) + "\n");
}

console.log(`Wrote staging for ${summary.filter((s) => s.action !== "SKIP-already-correct" && s.action !== "MISSING-CATALOG").length} cards.\n`);
console.log("Summary:");
for (const s of summary) {
  console.log(`  [${s.action.padEnd(22)}] ${s.id.padEnd(40)}${s.from ? "  " + s.from : ""}${s.to ? " → " + s.to : ""}`);
}
