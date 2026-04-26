/**
 * Promote facts from the fact store into data/cards/*.json.
 *
 * Run periodically (cron) or manually after approving items in the review queue.
 *
 * Strategy:
 *   1. For each card_id that has any facts, read all facts.
 *   2. Per field_path, run the reconciler to pick the winning fact.
 *   3. Build a card object from the winning facts (merged with the existing
 *      data/cards/{id}.json baseline for any field that has no fact yet).
 *   4. Run sanity check on the merged card. If it fails, abort that card and log.
 *   5. Write the merged card back to data/cards/{id}.json.
 *
 * This script intentionally does NOT delete fields; if the fact store has no
 * fact for `recurring_credits`, the existing value in data/cards/ is preserved.
 *
 * Usage:
 *   npx tsx scripts/promote-facts.ts                   # promote all cards
 *   npx tsx scripts/promote-facts.ts --dry-run         # show what would change
 *   npx tsx scripts/promote-facts.ts --card amex-platinum   # one card
 */
import * as fs from "fs";
import * as path from "path";
import {
  getCardFieldPaths,
  getFacts,
  reconcileFacts,
  checkSanity,
  type FactEvent,
} from "../lib/fact-store";
import { Redis } from "@upstash/redis";

const CARDS_DIR = path.join(process.cwd(), "data", "cards");

interface PromoteResult {
  card_id: string;
  filename: string;
  changed: boolean;
  changes: { field: string; from: unknown; to: unknown; source: string }[];
  errors: string[];
}

function indexCardsByCardId(): Map<string, string> {
  // card_id ↔ filename mapping (centurion-card-amex lives in amex-centurion.json etc.)
  const idx = new Map<string, string>();
  for (const f of fs.readdirSync(CARDS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8"));
      if (c.card_id) idx.set(c.card_id, f);
    } catch {
      // skip bad JSON
    }
  }
  return idx;
}

async function listAllCardIdsWithFacts(): Promise<string[]> {
  // Scan the index set
  const r = new Redis({
    url: process.env.UPSTASH_KV_REST_API_URL!,
    token: process.env.UPSTASH_KV_REST_API_TOKEN!,
  });
  const all = (await r.smembers("card_facts_index:v1")) as string[];
  const cardIds = new Set<string>();
  for (const k of all) {
    const idx = k.indexOf(":");
    if (idx > 0) cardIds.add(k.slice(0, idx));
  }
  return [...cardIds].sort();
}

async function promoteCard(card_id: string, filenameMap: Map<string, string>, dryRun: boolean): Promise<PromoteResult> {
  const result: PromoteResult = {
    card_id,
    filename: filenameMap.get(card_id) ?? `${card_id}.json`,
    changed: false,
    changes: [],
    errors: [],
  };

  const filename = result.filename;
  const filepath = path.join(CARDS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    result.errors.push(`Card file ${filename} not found for card_id=${card_id}`);
    return result;
  }

  const baseline = JSON.parse(fs.readFileSync(filepath, "utf8")) as Record<string, unknown>;
  const fieldPaths = await getCardFieldPaths(card_id);
  if (fieldPaths.length === 0) {
    return result;  // no facts to promote
  }

  const updated: Record<string, unknown> = { ...baseline };
  const promotedSources: Record<string, string> = {};

  for (const fp of fieldPaths) {
    const facts: FactEvent[] = await getFacts(card_id, fp);
    const winner = reconcileFacts(facts);
    if (!winner) continue;

    // Sanity gate at promotion time too (defense in depth)
    const sanity = checkSanity(fp, winner.value, {
      card_name: typeof baseline.name === "string" ? baseline.name : undefined,
      card_id,
    });
    if (!sanity.ok) {
      result.errors.push(`[${fp}] sanity FAIL: ${sanity.reason} (winning fact ${winner.id} from ${winner.source.type})`);
      continue;
    }

    const before = updated[fp];
    if (JSON.stringify(before) !== JSON.stringify(winner.value)) {
      result.changes.push({
        field: fp,
        from: before,
        to: winner.value,
        source: `${winner.source.type}@${winner.source.fetched_at.slice(0, 10)} (${winner.extracted_by})`,
      });
      updated[fp] = winner.value;
      promotedSources[fp] = winner.source.type;
    }
  }

  if (result.changes.length === 0) {
    return result;
  }

  // Provenance trail at the card level
  const provenance = (updated._fact_promote_history as unknown[]) ?? [];
  provenance.push({
    promoted_at: new Date().toISOString(),
    fields: result.changes.map((c) => ({ field: c.field, source: c.source })),
  });
  updated._fact_promote_history = provenance;
  updated.last_updated = new Date().toISOString();

  if (!dryRun) {
    fs.writeFileSync(filepath, JSON.stringify(updated, null, 2) + "\n");
  }
  result.changed = true;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const cardArgIdx = args.indexOf("--card");
  const onlyCard = cardArgIdx >= 0 ? args[cardArgIdx + 1] : null;

  console.log(`🔁 Promoting facts from store → data/cards/  (${dryRun ? "DRY RUN" : "APPLY"})`);

  const filenameMap = indexCardsByCardId();

  let cardIds: string[];
  if (onlyCard) {
    cardIds = [onlyCard];
  } else {
    cardIds = await listAllCardIdsWithFacts();
  }

  if (cardIds.length === 0) {
    console.log("No cards have facts. Nothing to promote.");
    process.exit(0);
  }

  const allResults: PromoteResult[] = [];
  for (const cid of cardIds) {
    const r = await promoteCard(cid, filenameMap, dryRun);
    allResults.push(r);
  }

  const changed = allResults.filter((r) => r.changed);
  const errored = allResults.filter((r) => r.errors.length > 0);

  console.log();
  console.log(`📊 Summary: ${changed.length} cards changed, ${errored.length} cards with errors, ${cardIds.length} total`);

  if (changed.length > 0) {
    console.log();
    console.log("Changes:");
    for (const r of changed) {
      console.log(`  ${r.card_id}  (${r.filename})`);
      for (const c of r.changes) {
        const fromStr = JSON.stringify(c.from)?.slice(0, 60) ?? "(unset)";
        const toStr = JSON.stringify(c.to)?.slice(0, 60) ?? "(unset)";
        console.log(`    [${c.field}]  ${fromStr}  →  ${toStr}    ← ${c.source}`);
      }
    }
  }

  if (errored.length > 0) {
    console.log();
    console.log("Errors (cards skipped):");
    for (const r of errored) {
      for (const e of r.errors) console.log(`  ${r.card_id}: ${e}`);
    }
  }

  process.exit(errored.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
