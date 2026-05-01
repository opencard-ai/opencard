/**
 * Dry-run: generate stable credit_key for every RC entry in data/cards/.
 *
 * Why: U5 (per-user credit check-off) needs a stable id to anchor user state
 * to a specific recurring_credit entry. The current entries are addressable
 * only by array index, which is fragile (reorder/insert breaks user state).
 *
 * Slug rule:
 *   key = slug(name)
 *   slug = lowercase, non-alphanum → "-", collapse, trim
 *
 * Within-card collisions: append "-2", "-3", ... in source order.
 * Across-card collisions: allowed and expected (same merchant on multi cards).
 *
 * Output:
 *   - prints per-card preview of (name → key) including any -N suffixes
 *   - prints global summary: total RC entries, unique keys, top 20 most-shared keys
 *   - DOES NOT WRITE — preview only.
 */
import * as fs from "fs";
import * as path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");

interface RC {
  name: string;
  amount: number;
  frequency: string;
  category?: string;
  description?: string;
  is_free_night?: boolean;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateKeysForCard(rcs: RC[]): { key: string; name: string }[] {
  const usedCounts = new Map<string, number>();
  return rcs.map((rc) => {
    const base = slug(rc.name);
    const n = usedCounts.get(base) ?? 0;
    usedCounts.set(base, n + 1);
    const key = n === 0 ? base : `${base}-${n + 1}`;
    return { key, name: rc.name };
  });
}

function main() {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  let totalRC = 0;
  let cardsWithRC = 0;
  let cardsWithCollision = 0;
  const globalKeyCount = new Map<string, number>(); // key → cards using
  const collisionExamples: { card_id: string; rcs: { name: string; key: string }[] }[] = [];
  const sampleCards: { card_id: string; rcs: { name: string; key: string }[] }[] = [];

  for (const file of files) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), "utf-8"));
    const rcs: RC[] = card.recurring_credits ?? [];
    if (rcs.length === 0) continue;
    cardsWithRC++;
    totalRC += rcs.length;

    const keyed = generateKeysForCard(rcs);
    const keys = keyed.map((k) => k.key);
    const unique = new Set(keys);
    if (keys.length !== unique.size) {
      cardsWithCollision++;
      collisionExamples.push({ card_id: card.card_id, rcs: keyed });
    }
    for (const k of unique) {
      globalKeyCount.set(k, (globalKeyCount.get(k) ?? 0) + 1);
    }
    if (sampleCards.length < 3 || card.card_id === "amex-platinum") {
      sampleCards.push({ card_id: card.card_id, rcs: keyed });
    }
  }

  console.log("=== credit_key dry-run ===\n");
  console.log(`cards scanned:        ${files.length}`);
  console.log(`cards with RC:        ${cardsWithRC}`);
  console.log(`total RC entries:     ${totalRC}`);
  console.log(`cards with within-card key collision (auto -N suffix): ${cardsWithCollision}`);
  console.log();

  if (collisionExamples.length > 0) {
    console.log("--- within-card collisions (got -N suffix) ---");
    for (const ex of collisionExamples) {
      console.log(`\n[${ex.card_id}]`);
      for (const r of ex.rcs) {
        console.log(`  ${r.key.padEnd(40)}  ← "${r.name}"`);
      }
    }
    console.log();
  }

  console.log("--- top 20 cross-card shared keys (same merchant on N cards) ---");
  const sorted = [...globalKeyCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted.slice(0, 20)) {
    console.log(`  ${String(n).padStart(3)} cards  ${k}`);
  }
  console.log();

  console.log("--- sample preview (3 cards) ---");
  for (const s of sampleCards.slice(0, 3)) {
    console.log(`\n[${s.card_id}]`);
    for (const r of s.rcs) {
      console.log(`  ${r.key.padEnd(40)}  ← "${r.name}"`);
    }
  }
}

main();
