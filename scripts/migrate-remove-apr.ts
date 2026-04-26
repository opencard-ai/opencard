/**
 * Schema migration: remove APR fields from data/cards/*.json.
 *
 * Decision (2026-04-27, OpenCard product scope review):
 * APR / penalty_apr is irrelevant to OpenCard's target user (rewards/credits
 * maximizer who pays in full). Maintaining accurate per-card APR data
 * requires Plan B issuer-disclosure scraping (CFPB family PDFs don't carry
 * per-card values), and the 2026-04-25 incident demonstrated that
 * incorrect APR data is worse than no APR data.
 *
 * Removing these fields from the schema:
 *   - penalty_apr
 *   - apr_purchases
 *   - apr_purchases_min
 *   - apr_purchases_max
 *   - apr_cash_advances
 *
 * Companion changes (separate commits):
 *   - lib/fact-store.ts: drop penalty_apr sanity rule
 *   - scripts/pipelines/cfpb/lib/schumer-llm.ts: stop extracting APR
 *   - validate-all.ts (if it references these): drop validation
 *
 * Usage:
 *   npx tsx scripts/migrate-remove-apr.ts                 # dry-run
 *   npx tsx scripts/migrate-remove-apr.ts --apply         # write changes
 *   npx tsx scripts/migrate-remove-apr.ts --apply --quiet # no per-card output
 */
import * as fs from "fs";
import * as path from "path";

const FIELDS_TO_REMOVE = [
  "penalty_apr",
  "apr_purchases",
  "apr_purchases_min",
  "apr_purchases_max",
  "apr_cash_advances",
] as const;

interface CardChange {
  file: string;
  card_id: string;
  removed_fields: { field: string; old_value: unknown }[];
}

function migrate(card: Record<string, unknown>): {
  changed: Record<string, unknown>;
  removed: { field: string; old_value: unknown }[];
} {
  const removed: { field: string; old_value: unknown }[] = [];
  const out: Record<string, unknown> = { ...card };

  // 1. Drop the actual fields.
  for (const f of FIELDS_TO_REMOVE) {
    if (Object.prototype.hasOwnProperty.call(out, f)) {
      removed.push({ field: f, old_value: out[f] });
      delete out[f];
    }
  }

  // 2. Clean stale references in _unverified_fields meta array.
  if (Array.isArray(out._unverified_fields)) {
    const before = out._unverified_fields as string[];
    const after = before.filter(
      (s) => !FIELDS_TO_REMOVE.includes(s as (typeof FIELDS_TO_REMOVE)[number]),
    );
    if (after.length !== before.length) {
      const dropped = before.filter((x) => !after.includes(x));
      removed.push({
        field: "_unverified_fields[stale]",
        old_value: dropped,
      });
      // If the array is now empty, drop the key too.
      if (after.length === 0) {
        delete out._unverified_fields;
      } else {
        out._unverified_fields = after;
      }
    }
  }

  return { changed: out, removed };
}

function main() {
  const apply = process.argv.includes("--apply");
  const quiet = process.argv.includes("--quiet");
  const cardsDir = path.join(process.cwd(), "data", "cards");
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

  const changes: CardChange[] = [];
  let unchanged = 0;
  let parseErrors = 0;

  for (const f of files) {
    const filepath = path.join(cardsDir, f);
    let original: string;
    let card: Record<string, unknown>;
    try {
      original = fs.readFileSync(filepath, "utf8");
      card = JSON.parse(original);
    } catch (err) {
      console.error(`⚠️  ${f}: parse error: ${(err as Error).message}`);
      parseErrors++;
      continue;
    }

    const { changed, removed } = migrate(card);
    if (removed.length === 0) {
      unchanged++;
      continue;
    }

    changes.push({
      file: f,
      card_id: (card.card_id as string) ?? f,
      removed_fields: removed,
    });

    if (apply) {
      // Preserve trailing newline if original had one.
      const trailingNewline = original.endsWith("\n") ? "\n" : "";
      const next = JSON.stringify(changed, null, 2) + trailingNewline;
      fs.writeFileSync(filepath, next);
    }
  }

  // Summary
  console.log();
  console.log(
    `${apply ? "✅ APPLIED" : "💤 DRY RUN"} — APR field removal across ${files.length} card files`,
  );
  console.log();
  console.log(`Fields targeted: ${FIELDS_TO_REMOVE.join(", ")}`);
  console.log();
  console.log(`📊 Summary:`);
  console.log(`   ${changes.length} cards modified`);
  console.log(`   ${unchanged} cards unchanged (no APR fields present)`);
  if (parseErrors > 0) console.log(`   ${parseErrors} parse errors`);

  // Per-field counts
  const perField: Record<string, number> = {};
  for (const c of changes) {
    for (const r of c.removed_fields) {
      perField[r.field] = (perField[r.field] ?? 0) + 1;
    }
  }
  console.log();
  console.log(`📋 Removals by field:`);
  for (const f of FIELDS_TO_REMOVE) {
    console.log(`   ${f.padEnd(22)} ${perField[f] ?? 0}`);
  }

  if (!quiet) {
    console.log();
    console.log(`📝 Per-card changes:`);
    for (const c of changes.sort((a, b) => a.card_id.localeCompare(b.card_id))) {
      const fields = c.removed_fields
        .map((r) => `${r.field}=${JSON.stringify(r.old_value)}`)
        .join(", ");
      console.log(`   ${c.card_id.padEnd(38)} − ${fields}`);
    }
  }

  if (!apply) {
    console.log();
    console.log(`(Dry run — no files written. Pass --apply to commit changes.)`);
  } else {
    console.log();
    console.log(`✅ ${changes.length} files written.`);
    console.log(
      `   Run \`git diff --stat data/cards/\` to verify, then commit.`,
    );
  }
}

main();
