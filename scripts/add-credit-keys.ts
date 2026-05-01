/**
 * Migration: add stable `credit_key` to every recurring_credits entry.
 *
 * Rules:
 *   1. If entry already has credit_key → leave untouched (immutable once set).
 *   2. Else: credit_key = slug(name); within-card duplicates get -2, -3 suffix
 *      in source order.
 *   3. Touch nothing else — same JSON, same key order except credit_key
 *      inserted at the top of each RC entry.
 *
 * Slug rule: lowercase, non-alphanum → "-", collapse, trim.
 *
 * Idempotent: safe to re-run. Future new RC entries (e.g. from staging merge)
 * picked up on next run.
 */
import * as fs from "fs";
import * as path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withCreditKeyFirst(rc: Record<string, unknown>, key: string): Record<string, unknown> {
  const { credit_key: _ignored, ...rest } = rc;
  return { credit_key: key, ...rest };
}

function main() {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  let cardsTouched = 0;
  let entriesTouched = 0;
  let entriesAlreadyKeyed = 0;

  for (const file of files) {
    const filePath = path.join(CARDS_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const card = JSON.parse(raw);
    const rcs: Record<string, unknown>[] = card.recurring_credits ?? [];
    if (rcs.length === 0) continue;

    const usedCounts = new Map<string, number>();
    let mutated = false;
    const newRcs = rcs.map((rc) => {
      if (typeof rc.credit_key === "string" && rc.credit_key.length > 0) {
        entriesAlreadyKeyed++;
        // Track this key so a fresh entry below it doesn't collide.
        usedCounts.set(rc.credit_key, (usedCounts.get(rc.credit_key) ?? 0) + 1);
        return rc;
      }
      const name = typeof rc.name === "string" ? rc.name : "";
      const base = slug(name);
      const n = usedCounts.get(base) ?? 0;
      usedCounts.set(base, n + 1);
      const key = n === 0 ? base : `${base}-${n + 1}`;
      mutated = true;
      entriesTouched++;
      return withCreditKeyFirst(rc, key);
    });

    if (mutated) {
      cardsTouched++;
      card.recurring_credits = newRcs;
      // Preserve trailing newline if original had one.
      const trailingNl = raw.endsWith("\n") ? "\n" : "";
      fs.writeFileSync(filePath, JSON.stringify(card, null, 2) + trailingNl);
    }
  }

  console.log("=== add-credit-keys ===");
  console.log(`cards touched:           ${cardsTouched}`);
  console.log(`new credit_keys added:   ${entriesTouched}`);
  console.log(`pre-existing keys kept:  ${entriesAlreadyKeyed}`);
}

main();
