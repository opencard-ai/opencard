/**
 * Merge clean staging files from data/recurring-credits-research/staging/
 * into data/cards/*.json.
 *
 * Only merges cards where:
 *   - staging file has recurring_credits length > 0
 *   - staging file does NOT have _needs_review=true
 *   - target data/cards/<id>.json exists
 *   - target's existing recurring_credits is empty/missing (no overwrite)
 *
 * Schema convention C (decided 2026-04-26):
 *   - amount = USD value PER period (the unit of frequency)
 *   - frequency = monthly | quarterly | semi_annual | annual | etc.
 *   - Annual total computed downstream
 *
 * Output fields written to data/cards/<id>.recurring_credits[]:
 *   name, amount, frequency, category, description, reset_type, source
 * (Strips staging-only fields: source_url renamed to source, source_excerpt dropped)
 *
 * Usage:
 *   npx tsx scripts/merge-recurring-credits-staging.ts                  # dry-run
 *   npx tsx scripts/merge-recurring-credits-staging.ts --apply          # write
 */
import * as fs from "fs";
import * as path from "path";

interface StagingCredit {
  name: string;
  amount: number;
  frequency: string;
  category?: string;
  description?: string;
  reset_type?: string;
  source_url?: string;
  source_excerpt?: string;
}

interface StagingCard {
  card_id: string;
  recurring_credits?: StagingCredit[];
  recurring_credits_provisional?: StagingCredit[];
  _no_credits_found?: boolean;
  _needs_review?: boolean;
  _review_reason?: string | null;
  _overwrite_existing?: boolean;
  _overwrite_reason?: string;
}

const VALID_FREQUENCIES = new Set([
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "per_stay",
  "cardmember_year",
  "every_4_years",
]);

function transformCredit(c: StagingCredit) {
  const out: Record<string, unknown> = {
    name: c.name,
    amount: c.amount,
    frequency: c.frequency,
  };
  if (c.category) out.category = c.category;
  if (c.description) out.description = c.description;
  if (c.reset_type) out.reset_type = c.reset_type;
  if (c.source_url) out.source = c.source_url;
  return out;
}

function validateCredit(c: StagingCredit, cardId: string): string[] {
  const errs: string[] = [];
  if (!c.name || typeof c.name !== "string") errs.push(`${cardId}: missing name`);
  if (typeof c.amount !== "number" || !Number.isFinite(c.amount)) errs.push(`${cardId}: amount not numeric`);
  if (c.amount < 0) errs.push(`${cardId}: amount negative`);
  if (!VALID_FREQUENCIES.has(c.frequency)) errs.push(`${cardId}: invalid frequency '${c.frequency}'`);
  return errs;
}

function main() {
  const apply = process.argv.includes("--apply");

  const stagingDir = path.join(process.cwd(), "data", "recurring-credits-research", "staging");
  const cardsDir = path.join(process.cwd(), "data", "cards");

  const stagingFiles = fs.readdirSync(stagingDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

  type Plan = {
    card_id: string;
    staging_file: string;
    target_file: string;
    new_credits: ReturnType<typeof transformCredit>[];
    old_credits: unknown[];
    skip_reason?: string;
  };

  const plans: Plan[] = [];
  const allErrors: string[] = [];

  for (const f of stagingFiles) {
    const sPath = path.join(stagingDir, f);
    const staging: StagingCard = JSON.parse(fs.readFileSync(sPath, "utf8"));

    const credits = staging.recurring_credits ?? [];
    if (!Array.isArray(credits) || credits.length === 0) {
      // Confirmed _no_credits_found cards — skip silently
      continue;
    }
    if (staging._needs_review) {
      plans.push({
        card_id: staging.card_id,
        staging_file: f,
        target_file: "",
        new_credits: [],
        old_credits: [],
        skip_reason: "needs_review flagged in staging",
      });
      continue;
    }

    const targetPath = path.join(cardsDir, `${staging.card_id}.json`);
    if (!fs.existsSync(targetPath)) {
      plans.push({
        card_id: staging.card_id,
        staging_file: f,
        target_file: targetPath,
        new_credits: [],
        old_credits: [],
        skip_reason: "target data/cards/<id>.json does not exist",
      });
      continue;
    }
    const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    const existingRC = target.recurring_credits;
    const allowOverwrite = process.argv.includes("--allow-overwrite");
    if (Array.isArray(existingRC) && existingRC.length > 0) {
      if (!staging._overwrite_existing) {
        plans.push({
          card_id: staging.card_id,
          staging_file: f,
          target_file: targetPath,
          new_credits: [],
          old_credits: existingRC,
          skip_reason: `target already has ${existingRC.length} recurring_credits — staging not flagged _overwrite_existing`,
        });
        continue;
      }
      if (!allowOverwrite) {
        plans.push({
          card_id: staging.card_id,
          staging_file: f,
          target_file: targetPath,
          new_credits: [],
          old_credits: existingRC,
          skip_reason: `staging flagged _overwrite_existing but --allow-overwrite not passed (gate)`,
        });
        continue;
      }
    }

    // Validate
    const errs = credits.flatMap((c) => validateCredit(c, staging.card_id));
    if (errs.length > 0) {
      allErrors.push(...errs);
      plans.push({
        card_id: staging.card_id,
        staging_file: f,
        target_file: targetPath,
        new_credits: [],
        old_credits: existingRC ?? [],
        skip_reason: `validation errors: ${errs.join("; ")}`,
      });
      continue;
    }

    plans.push({
      card_id: staging.card_id,
      staging_file: f,
      target_file: targetPath,
      new_credits: credits.map(transformCredit),
      old_credits: existingRC ?? [],
    });
  }

  // Print plan
  const merging = plans.filter((p) => !p.skip_reason);
  const skipping = plans.filter((p) => p.skip_reason);

  console.log(`${apply ? "✅ APPLY" : "💤 DRY RUN"} — Merge ${merging.length} cards from staging`);
  console.log();

  console.log(`📋 Cards to merge:`);
  for (const p of merging) {
    console.log(`   ${p.card_id}`);
    for (const c of p.new_credits as Array<{ name: string; amount: number; frequency: string }>) {
      console.log(`     + ${c.name.padEnd(38)} $${c.amount}/${c.frequency}`);
    }
  }
  console.log();

  console.log(`⏭  Skipped (${skipping.length}):`);
  for (const p of skipping) {
    console.log(`   ${p.card_id} — ${p.skip_reason}`);
  }

  if (allErrors.length > 0) {
    console.log();
    console.log(`❌ Validation errors:`);
    for (const e of allErrors) console.log(`   ${e}`);
  }

  if (!apply) {
    console.log();
    console.log(`(Dry run — no files written. Pass --apply to commit.)`);
    return;
  }

  // Apply
  const now = new Date().toISOString();
  for (const p of merging) {
    const target = JSON.parse(fs.readFileSync(p.target_file, "utf8"));
    target.recurring_credits = p.new_credits;
    target.last_updated = now;
    const trailingNewline = fs.readFileSync(p.target_file, "utf8").endsWith("\n") ? "\n" : "";
    fs.writeFileSync(p.target_file, JSON.stringify(target, null, 2) + trailingNewline);
  }
  console.log();
  console.log(`✅ ${merging.length} card files updated.`);
  console.log(`   Run \`git diff data/cards/\` to verify, then commit.`);
}

main();
