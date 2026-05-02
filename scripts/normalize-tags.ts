/**
 * Normalize a small set of tag aliases that drifted into the catalog
 * over time. Run with `--apply` to write; default is dry-run.
 *
 *   no-af                  → no-annual-fee
 *   no-ftf                 → no-foreign-transaction-fee
 *   grocery                → groceries
 *
 * Idempotent: cards that already use the canonical form are unchanged.
 */

import fs from "fs";
import path from "path";

const ALIASES: Record<string, string> = {
  "no-af": "no-annual-fee",
  "no-ftf": "no-foreign-transaction-fee",
  "grocery": "groceries",
};

const APPLY = process.argv.includes("--apply");
const dir = path.join(process.cwd(), "data/cards");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const changes: Array<{ id: string; before: string[]; after: string[] }> = [];

for (const file of files) {
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, "utf8");
  const card = JSON.parse(raw);
  const tags: string[] | undefined = card.tags;
  if (!Array.isArray(tags) || tags.length === 0) continue;

  const before = [...tags];
  const mapped = tags.map((t) => ALIASES[t] || t);
  const next = Array.from(new Set(mapped));

  // Diff check: order or content changed?
  if (next.length !== before.length || next.some((t, i) => t !== before[i])) {
    changes.push({ id: card.card_id || file, before, after: next });
    if (APPLY) {
      card.tags = next;
      fs.writeFileSync(full, JSON.stringify(card, null, 2) + "\n");
    }
  }
}

console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`Cards considered: ${files.length}`);
console.log(`Cards changed:    ${changes.length}\n`);

if (changes.length === 0) {
  console.log("✓ No tag aliases found.");
  process.exit(0);
}

for (const c of changes) {
  const removed = c.before.filter((t) => !c.after.includes(t));
  const added = c.after.filter((t) => !c.before.includes(t));
  console.log(`  ${c.id}`);
  if (removed.length) console.log(`    − ${removed.join(", ")}`);
  if (added.length) console.log(`    + ${added.join(", ")}`);
}
