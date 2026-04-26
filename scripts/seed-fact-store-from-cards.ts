/**
 * One-shot migration: read every data/cards/*.json and emit one FactEvent per
 * top-level field (annual_fee, welcome_offer, recurring_credits, ...).
 *
 * Sources are tagged "seed_migration" with confidence 0.5 so any future fact
 * from a real source (cfpb_ccad, admin_manual, etc.) wins on reconcile.
 *
 * After running this, the fact store has a baseline and the promote-facts
 * script becomes idempotent.
 *
 * Usage:
 *   npx tsx scripts/seed-fact-store-from-cards.ts --dry-run
 *   npx tsx scripts/seed-fact-store-from-cards.ts
 */
import * as fs from "fs";
import * as path from "path";
import { ingestFact, type FieldPath } from "../lib/fact-store";

const CARDS_DIR = path.join(process.cwd(), "data", "cards");

const SEED_FIELD_PATHS: FieldPath[] = [
  "annual_fee",
  "foreign_transaction_fee",
  "credit_required",
  "welcome_offer",
  "earning_rates",
  "recurring_credits",
  "travel_benefits",
  "insurance",
  "tags",
  "name",
  "issuer",
  "network",
  "status",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`🌱 Seeding fact store from data/cards/  (${dryRun ? "DRY RUN" : "APPLY"})`);

  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  let total = 0;
  let written = 0;
  let queued = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), "utf8"));
      const card_id = card.card_id;
      if (!card_id) {
        console.warn(`SKIP: ${file} has no card_id`);
        continue;
      }

      for (const fp of SEED_FIELD_PATHS) {
        if (!(fp in card)) continue;
        total++;
        if (dryRun) {
          written++;
          continue;
        }
        const result = await ingestFact(
          {
            card_id,
            field_path: fp,
            value: card[fp],
            source: {
              type: "seed_migration",
              fetched_at: new Date().toISOString(),
              url: `data/cards/${file}`,
            },
            confidence: 0.5,
            extracted_by: "manual_admin",
          },
          { card_name: card.name },
        );
        if (result.accepted) written++;
        else if (result.reviewQueued) {
          queued++;
          console.warn(`  REVIEW (sanity failed) ${card_id}.${fp}: ${result.reason}`);
        } else {
          failed++;
          console.warn(`  FAILED ${card_id}.${fp}: ${result.reason}`);
        }
      }
    } catch (e) {
      console.error(`ERROR processing ${file}:`, (e as Error).message);
      failed++;
    }
  }

  console.log();
  console.log(`📊 Seed summary:`);
  console.log(`   Total field events considered: ${total}`);
  console.log(`   Written:                       ${written}`);
  console.log(`   Queued for review (sanity):    ${queued}`);
  console.log(`   Failed:                        ${failed}`);
  if (dryRun) {
    console.log();
    console.log(`(dry-run; nothing written)`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
