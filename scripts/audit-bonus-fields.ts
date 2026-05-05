/**
 * Catalog audit: cards using the legacy `welcome_offer.bonus_value`
 * field instead of (or in addition to) the modern `bonus_points` +
 * `estimated_value` shape.
 *
 * Three categories worth surfacing separately:
 *   "empty"   — both bonus_value and bonus_points report 0/null/empty
 *               → card has no real welcome offer; both fields are dead
 *   "legacy"  — bonus_value is a non-zero number/string but bonus_points
 *               is missing → looks like an unmigrated cash-back offer
 *   "string"  — bonus_value is a free-form string ("Varies", "TBD" etc.)
 *
 * Read-only. Run with `npx tsx scripts/audit-bonus-fields.ts`.
 */

import fs from "fs";
import path from "path";

interface Card {
  card_id: string;
  name: string;
  welcome_offer?: {
    bonus_value?: number | string | null;
    bonus_points?: number | null;
    estimated_value?: number | null;
    description?: string;
  };
}

const dir = path.join(process.cwd(), "data/cards");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

// Canonical fields per lib/cards.ts WelcomeOffer interface. Anything outside
// this set on welcome_offer is non-standard and likely needs migration.
const CANONICAL_FIELDS = new Set([
  "spending_requirement", "time_period_months", "bonus_points",
  "estimated_value", "point_program", "description",
  "bonus_value",                   // legacy but tolerated (own bucket below)
  "is_elevated", "normal_bonus_points", "elevated_until",
  "free_nights", "free_night_value_cap",  // hotel co-brand FNA welcome offers
]);

// Map non-standard field → canonical replacement suggestion.
const FIELD_MIGRATION: Record<string, string> = {
  bonus_cash: "estimated_value (cash bonuses use estimated_value, no bonus_points)",
  bonus_miles: "bonus_points (canonical for both points and miles)",
  bonus: "bonus_points or estimated_value (specify which)",
  requirement: "spending_requirement (likely typo)",
  free_nights: "express as `recurring_credits[].is_free_night=true` or note in description; not a welcome_offer field",
};

const empty: Array<{ id: string; name: string }> = [];
const legacy: Array<{ id: string; name: string; bonus_value: any; estimated_value: number | null | undefined }> = [];
const stringy: Array<{ id: string; name: string; bonus_value: string }> = [];
const nonStandard: Array<{ id: string; name: string; field: string; value: unknown; suggestion: string }> = [];

for (const file of files) {
  let card: Card;
  try { card = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); } catch { continue; }
  if (!card.card_id) continue;
  const w = card.welcome_offer;
  if (!w) continue;
  const bp = w.bonus_points ?? 0;
  const bv = w.bonus_value;

  // Detect any keys not in CANONICAL_FIELDS
  for (const key of Object.keys(w)) {
    if (!CANONICAL_FIELDS.has(key)) {
      nonStandard.push({
        id: card.card_id,
        name: card.name,
        field: key,
        value: (w as Record<string, unknown>)[key],
        suggestion: FIELD_MIGRATION[key] || "(not a canonical welcome_offer field — review)",
      });
    }
  }

  const ev = w.estimated_value ?? 0;
  if (bp === 0 && (bv === 0 || bv == null || bv === "") && ev === 0) {
    empty.push({ id: card.card_id, name: card.name });
    continue;
  }
  if (typeof bv === "string" && !/^\d+(\.\d+)?$/.test(bv)) {
    stringy.push({ id: card.card_id, name: card.name, bonus_value: bv });
    continue;
  }
  if (bp === 0 && bv != null && bv !== 0 && bv !== "") {
    legacy.push({
      id: card.card_id,
      name: card.name,
      bonus_value: bv,
      estimated_value: w.estimated_value ?? null,
    });
  }
}

console.log(`Audited ${files.length} cards. Findings:\n`);

if (empty.length) {
  console.log(`EMPTY (${empty.length}) — both bonus_value and bonus_points are zero/null. Welcome_offer object is dead weight on these cards:`);
  for (const e of empty) console.log(`  ${e.id.padEnd(40)} ${e.name}`);
  console.log();
}

if (legacy.length) {
  console.log(`LEGACY (${legacy.length}) — bonus_value carries a number but bonus_points is missing. Likely cash-back offers that never got migrated to the modern (bonus_points + estimated_value) shape:`);
  console.log(`  ${"id".padEnd(40)} bonus_value  estimated_value`);
  for (const l of legacy) {
    const ev = l.estimated_value ?? "(none)";
    console.log(`  ${l.id.padEnd(40)} ${String(l.bonus_value).padEnd(12)} ${ev}`);
  }
  console.log();
}

if (stringy.length) {
  console.log(`STRING (${stringy.length}) — bonus_value is a free-form string the UI can't render numerically:`);
  for (const s of stringy) console.log(`  ${s.id.padEnd(40)} "${s.bonus_value}"`);
  console.log();
}

if (nonStandard.length) {
  // Group by field name for readability
  const byField: Record<string, typeof nonStandard> = {};
  for (const n of nonStandard) {
    (byField[n.field] ||= []).push(n);
  }
  console.log(`NON_STANDARD_FIELD (${nonStandard.length}) — welcome_offer keys that aren't in lib/cards.ts WelcomeOffer interface. UI ignores them:`);
  for (const field of Object.keys(byField).sort()) {
    const rows = byField[field];
    console.log(`  ${field}  (${rows.length}) — migrate to: ${rows[0].suggestion}`);
    for (const r of rows) {
      const v = typeof r.value === "string" ? `"${r.value}"` : JSON.stringify(r.value);
      console.log(`    ${r.id.padEnd(40)} ${field}=${v}`);
    }
  }
  console.log();
}

if (!empty.length && !legacy.length && !stringy.length && !nonStandard.length) {
  console.log("✓ No legacy bonus_value or non-standard welcome_offer fields detected.");
}
