/**
 * Sync lib/constants.ts CARD_OPTIONS with the canonical catalog at
 * data/cards/<card_id>.json.
 *
 * CARD_OPTIONS is the curated subset of cards (currently ~56) shown
 * in the RecommendWidget's "cards I already have" picker. Used only
 * by app/components/RecommendWidget.tsx to do a `card_id → name`
 * lookup. The list is hand-picked, not auto-generated, so we don't
 * blow it away — we just keep names / issuers / annual_fees in sync
 * with the catalog and fix dead card_ids.
 *
 * Rename / drop map below covers card_ids that drifted from the
 * catalog (e.g. `amex-business-gold` was renamed to `amex-biz-gold`
 * during the 2026-04 takeover). After this script runs, every
 * card_id in CARD_OPTIONS is guaranteed to resolve in data/cards/.
 *
 *   npx tsx scripts/sync-card-options.ts --dry    # preview
 *   npx tsx scripts/sync-card-options.ts --apply  # rewrite constants.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const CONSTANTS_PATH = path.join(process.cwd(), "lib", "constants.ts");
const CARDS_DIR = path.join(process.cwd(), "data", "cards");

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
if (!DRY && !APPLY) {
  console.error("Pass --dry or --apply.");
  process.exit(1);
}

// Old card_id → new card_id (or null to drop entirely).
// Verified each new id exists in data/cards/ before adding here.
const RENAME: Record<string, string | null> = {
  "amex-blue-business-cash": "amex-blue-biz-cash",
  "amex-business-gold": "amex-biz-gold",
  "amex-hilton-aspire": "amex-hilton-honors-aspire",
  "amex-hilton-honors-business": "amex-hilton-honors-biz",
  "amex-marriott-bonvoy-amex": "amex-marriott-bevy", // renamed to Bevy 2022
  "chase-ink-business-cash": "chase-ink-biz-cash",
  "chase-ink-business-preferred": "chase-ink-biz-preferred",
  "chase-ink-business-unlimited": "chase-ink-biz-unlimited",
  "citi-premier": "citi-strata-premier", // rebranded
  "coinbase-one": null, // Coinbase Card was discontinued in 2021; no catalog entry
  "fidelity-rewards": "fidelity-rewards-visa-signature",
  "usbank-altitude-connect": "us-bank-altitude-connect",
  "usbank-altitude-reserve": "us-bank-altitude-reserve",
};

interface CardJson {
  name?: string;
  issuer?: string;
  annual_fee?: number;
}

const src = readFileSync(CONSTANTS_PATH, "utf8");

// Pull the existing card_ids in declaration order so we preserve the
// curated ordering. We don't trust the existing names/AFs — they're
// what we're fixing.
const cardIdRe = /\{ card_id: "([^"]+)",/g;
const originalIds: string[] = [];
for (const m of src.matchAll(cardIdRe)) originalIds.push(m[1]);

const seen = new Set<string>();
const finalIds: string[] = [];
const dropped: string[] = [];
const renamed: Array<[string, string]> = [];

for (const id of originalIds) {
  let resolved: string | null = id;
  if (id in RENAME) {
    resolved = RENAME[id];
    if (resolved === null) {
      dropped.push(id);
      continue;
    }
    if (resolved !== id) renamed.push([id, resolved]);
  }
  if (seen.has(resolved)) {
    dropped.push(`${id} (dup of ${resolved})`);
    continue;
  }
  if (!existsSync(path.join(CARDS_DIR, `${resolved}.json`))) {
    console.error(`✗ no catalog entry for ${resolved} (was ${id}); aborting`);
    process.exit(2);
  }
  seen.add(resolved);
  finalIds.push(resolved);
}

const block = finalIds.map((id) => {
  const c: CardJson = JSON.parse(readFileSync(path.join(CARDS_DIR, `${id}.json`), "utf8"));
  // JSON.stringify each field to handle the rare quote/backslash inside a name.
  return `  { card_id: ${JSON.stringify(id)}, name: ${JSON.stringify(c.name ?? "")}, issuer: ${JSON.stringify(c.issuer ?? "")}, annual_fee: ${c.annual_fee ?? 0} },`;
}).join("\n");

const newSrc = src.replace(
  /(export const CARD_OPTIONS: CardOption\[\] = \[\n)[\s\S]*?(\n\];)/,
  (_match, head, tail) => `${head}${block}${tail}`,
);

if (newSrc === src) {
  console.error("✗ regex didn't match — CARD_OPTIONS array shape changed?");
  process.exit(3);
}

console.log(`\n${DRY ? "[DRY]" : "[APPLY]"} Summary:`);
console.log(`  CARD_OPTIONS: ${originalIds.length} → ${finalIds.length}`);
console.log(`  renamed:      ${renamed.length}`);
for (const [a, b] of renamed) console.log(`    ${a} → ${b}`);
console.log(`  dropped:      ${dropped.length}`);
for (const d of dropped) console.log(`    ${d}`);

if (APPLY) {
  writeFileSync(CONSTANTS_PATH, newSrc, "utf8");
  console.log(`  wrote:        ${CONSTANTS_PATH}`);
}
