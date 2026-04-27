/**
 * Soft-deprecate cards per operator review of card-removal-audit.
 *
 * Decisions (Kacey 2026-04-27):
 *   A. Discontinued — KEEP (already flagged; site tracks remaining recurring_credits)
 *   B. Store cards  — DEPRECATE all 14 except bread-cashback-american-express
 *   C. Subprime     — DEPRECATE all 11 except boa-alaska-airlines-visa-platinum
 *   D. Niche int'l  — DEPRECATE all 4
 *   E. Duplicates   — Mark _duplicate_of (Option C: no file rename, no URL change)
 *   F. Business niche — DEFER (operator review welcome bonus / benefits per card)
 *
 * Soft-deprecate means:
 *   - Card file stays at data/cards/<id>.json
 *   - Adds `deprecated: true` + `deprecated_reason: <text>`
 *   - Adds `last_updated: <now>`
 *   - UI/recommendation engine can filter on deprecated=true to hide from main listings
 *   - Card pages still resolve (SEO + bookmark friendly)
 *
 * Idempotent — re-running just refreshes timestamps; doesn't unset flags.
 *
 * Usage:
 *   npx tsx scripts/migrate-soft-deprecate-cards.ts          # dry-run
 *   npx tsx scripts/migrate-soft-deprecate-cards.ts --apply  # write
 */
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Decisions
// ============================================================

const STORE_CARDS_TO_DEPRECATE = [
  "barclays-athleta-rewards-mastercard",
  "barclays-banana-republic-rewards-mastercard",
  "barclays-gap-good-rewards-mastercard",
  "barclays-old-navy-navyist-rewards-mastercard",
  "comenity-bed-bath-beyond-mastercard",
  "comenity-kayak-credit-card",
  "comenity-ulta-beauty-mastercard",
  "kohls-charge",
  "synchrony-amazon-prime-store-card",
  "synchrony-amazon-store",
  "synchrony-care-credit-rewards-mastercard",
  "synchrony-paypal-cashback-mastercard",
  "synchrony-sams-club-mastercard",
  "synchrony-verizon-visa",
  // bread-cashback-american-express EXCLUDED per Kacey decision
];

const SUBPRIME_TO_DEPRECATE = [
  "barclays-aarp-essential-rewards-mastercard",
  "barclays-aarp-travel-rewards-mastercard",
  "boa-customized-cash-rewards-secured",
  "boa-student-customized-cash-rewards",
  "boa-student-travel-rewards",
  "capital-one-journey-student",
  "capital-one-quicksilver-one",
  "capital-one-quicksilver-secured",
  "citi-secured-mastercard",
  "discover-it-secured",
  "petal-1-visa",
  "petal-2-visa",
  "us-bank-altitude-go-secured",
  // boa-alaska-airlines-visa-platinum EXCLUDED per Kacey decision (was false positive)
];

const NICHE_INTERNATIONAL_TO_DEPRECATE = [
  "cathay-world-elite",
  "chase-aer-lingus-visa-signature",
  "chase-iberia-visa-signature",
  "emirates-skywards-mastercard",
];

// High-confidence duplicates with canonical mapping
// (Lower-confidence pairs left for operator manual verification)
const DUPLICATES: Array<{ drop: string; canonical: string; note: string }> = [
  {
    drop: "amex-blue-cash-everyday",
    canonical: "amex-bce",
    note: "Same product. Canonical 'amex-bce' is the project's existing short-id convention.",
  },
  {
    drop: "amex-blue-cash-preferred",
    canonical: "amex-bcp",
    note: "Same product. Canonical 'amex-bcp' is shorter and matches project naming.",
  },
  {
    drop: "delta-skymiles-blue-amex",
    canonical: "amex-delta-blue",
    note: "Same product. Canonical 'amex-delta-blue' uses issuer-first prefix per project convention.",
  },
  {
    drop: "costco-anywhere-visa-business-citi",
    canonical: "citi-costco-biz",
    note: "Same product. Canonical 'citi-costco-biz' uses issuer-first + biz suffix per project convention.",
  },
  {
    drop: "wyndham-rewards-earner-barclays",
    canonical: "barclays-wyndham-earner",
    note: "Same product. Canonical uses issuer-first prefix per project convention.",
  },
  {
    drop: "wyndham-rewards-earner-business-barclays",
    canonical: "barclays-wyndham-earner-biz",
    note: "Same product. Canonical uses issuer-first prefix + biz suffix per project convention.",
  },
];

// ============================================================
// Apply
// ============================================================

interface ChangePlan {
  card_id: string;
  file: string;
  type: "deprecate" | "duplicate";
  current: Record<string, unknown>;
  patch: Record<string, unknown>;
  note: string;
}

function loadCard(id: string): { file: string; data: Record<string, unknown> } | null {
  const file = path.join(process.cwd(), "data", "cards", `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function planDeprecation(id: string, reason: string, bucket: string): ChangePlan | null {
  const loaded = loadCard(id);
  if (!loaded) {
    console.warn(`⚠️  ${id}: file not found, skipping`);
    return null;
  }
  return {
    card_id: id,
    file: loaded.file,
    type: "deprecate",
    current: loaded.data,
    patch: {
      deprecated: true,
      deprecated_reason: reason,
      deprecated_bucket: bucket,
    },
    note: `bucket ${bucket}: ${reason}`,
  };
}

function planDuplicate(drop: string, canonical: string, note: string): ChangePlan | null {
  const loaded = loadCard(drop);
  if (!loaded) {
    console.warn(`⚠️  ${drop}: file not found, skipping dup mapping`);
    return null;
  }
  // Skip if already flagged
  if (loaded.data._duplicate_of === canonical) {
    return null;
  }
  return {
    card_id: drop,
    file: loaded.file,
    type: "duplicate",
    current: loaded.data,
    patch: {
      _duplicate_of: canonical,
      _dedup_note: note,
    },
    note: `→ ${canonical}: ${note}`,
  };
}

function main() {
  const apply = process.argv.includes("--apply");
  const plans: ChangePlan[] = [];

  for (const id of STORE_CARDS_TO_DEPRECATE) {
    const p = planDeprecation(
      id,
      "Store-card retail co-brand. Users searching OpenCard generally aren't shopping for retailer-specific cards. Excluded from main listings.",
      "B_store_card",
    );
    if (p) plans.push(p);
  }
  for (const id of SUBPRIME_TO_DEPRECATE) {
    const p = planDeprecation(
      id,
      "Subprime / secured / student card. Different user segment from OpenCard's rewards/credits-maximizer focus. Excluded from main listings.",
      "C_subprime",
    );
    if (p) plans.push(p);
  }
  for (const id of NICHE_INTERNATIONAL_TO_DEPRECATE) {
    const p = planDeprecation(
      id,
      "Niche international airline co-brand. US searchers rarely seek these. Excluded from main listings.",
      "D_niche_international",
    );
    if (p) plans.push(p);
  }
  for (const d of DUPLICATES) {
    const p = planDuplicate(d.drop, d.canonical, d.note);
    if (p) plans.push(p);
  }

  // Display
  console.log(`${apply ? "✅ APPLY" : "💤 DRY RUN"} — ${plans.length} card mutations`);
  console.log();
  const deprecates = plans.filter((p) => p.type === "deprecate");
  const dups = plans.filter((p) => p.type === "duplicate");

  console.log(`📋 Deprecating (${deprecates.length}):`);
  for (const p of deprecates) {
    const alreadyDep = p.current.deprecated === true ? " (already deprecated, refreshing reason)" : "";
    console.log(`   ${p.card_id.padEnd(42)} [${p.patch.deprecated_bucket}]${alreadyDep}`);
  }
  console.log();
  console.log(`🔗 Marking duplicates (${dups.length}):`);
  for (const p of dups) {
    console.log(`   ${p.card_id.padEnd(42)} → ${p.patch._duplicate_of}`);
  }

  if (!apply) {
    console.log();
    console.log(`(Dry run — pass --apply to write.)`);
    return;
  }

  const now = new Date().toISOString();
  for (const p of plans) {
    const next = { ...p.current, ...p.patch, last_updated: now };
    const trailing = fs.readFileSync(p.file, "utf8").endsWith("\n") ? "\n" : "";
    fs.writeFileSync(p.file, JSON.stringify(next, null, 2) + trailing);
  }
  console.log();
  console.log(`✅ ${plans.length} files updated.`);
  console.log(`   Run \`git diff data/cards/\` to verify, then commit.`);
}

main();
