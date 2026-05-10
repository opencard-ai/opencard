/**
 * Unit tests for the 3 Phase 2 spec §4 blocking gates wired into extract.ts.
 *
 * Run: npx tsx scripts/test-extract-gates.ts
 *
 * Exits non-zero on any failure so it can be wired into CI later.
 */
import {
  checkPaidToFreeNoEvidence,
  checkPointsCollapse,
  checkSourcePageDiscontinued,
} from "./auto-update-cards/extract";

let pass = 0;
let fail = 0;

function expectBlocked(label: string, result: { blocked: boolean }, want: boolean): void {
  if (result.blocked === want) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label} — expected blocked=${want}, got blocked=${result.blocked}`);
    fail++;
  }
}

// ── Gate 1: paid_to_free_no_evidence ──────────────────────────────────────
console.log("\nGate 1: paid_to_free_no_evidence");
{
  // Real regression: chase-hyatt $95 → $0 hallucination. Page body never
  // mentions "$0", "no annual fee", or "discontinued".
  expectBlocked(
    "blocks: $95 → $0 with no evidence (chase-hyatt regression)",
    checkPaidToFreeNoEvidence(
      95,
      0,
      "earn 30,000 bonus points after $3,000 spend in 3 months",
      "world of hyatt credit card welcome offer earn 30,000 bonus points annual fee 95",
    ),
    true,
  );
  expectBlocked(
    "passes: page contains '$0'",
    checkPaidToFreeNoEvidence(95, 0, "annual fee waived", "this card now has $0 annual fee for the first year"),
    false,
  );
  expectBlocked(
    "passes: page contains 'no annual fee'",
    checkPaidToFreeNoEvidence(95, 0, "now has no annual fee", "marketing copy describing free tier with no annual fee"),
    false,
  );
  expectBlocked(
    "passes: page mentions 'discontinued'",
    checkPaidToFreeNoEvidence(95, 0, "card has been discontinued", "legacy card discontinued by issuer"),
    false,
  );
  expectBlocked(
    "passes: legitimately free card (catalog 0, candidate 0)",
    checkPaidToFreeNoEvidence(0, 0, "no annual fee", "free card body"),
    false,
  );
  expectBlocked(
    "passes: paid → paid (no $0 transition at all)",
    checkPaidToFreeNoEvidence(95, 195, "annual fee $195", "annual fee 195"),
    false,
  );
  expectBlocked(
    "passes: catalog free, candidate paid (out of scope for this gate)",
    checkPaidToFreeNoEvidence(0, 95, "annual fee $95", "annual fee 95"),
    false,
  );
}

// ── Gate 2: points_collapse ────────────────────────────────────────────────
console.log("\nGate 2: points_collapse");
{
  // Real regression: chase-ink-biz-unlimited 75K → 750 (LLM misread "$750
  // cash back" marketing as the points number).
  expectBlocked(
    "blocks: 75000 → 750 on UR (chase-ink-biz-unlimited regression)",
    checkPointsCollapse(75000, 750, "Chase Ultimate Rewards"),
    true,
  );
  expectBlocked(
    "blocks: 100000 → 1000 on Amex MR",
    checkPointsCollapse(100000, 1000, "Amex Membership Rewards"),
    true,
  );
  expectBlocked(
    "passes: cashback program exempt ('Cashback')",
    checkPointsCollapse(75000, 750, "Cashback"),
    false,
  );
  expectBlocked(
    "passes: cashback variant 'Cash Back' exempt",
    checkPointsCollapse(75000, 750, "Cash Back"),
    false,
  );
  expectBlocked(
    "passes: 60% drop (below 80% threshold)",
    checkPointsCollapse(100000, 40000, "Amex Membership Rewards"),
    false,
  );
  expectBlocked(
    "passes: collapse but new value ≥ 5000",
    checkPointsCollapse(100000, 5000, "Amex Membership Rewards"),
    false,
  );
  expectBlocked(
    "passes: catalog had no bonus baseline",
    checkPointsCollapse(0, 750, "Amex Membership Rewards"),
    false,
  );
  expectBlocked(
    "passes: candidate bonus is null (different gate concern)",
    checkPointsCollapse(75000, null, "Amex Membership Rewards"),
    false,
  );
  expectBlocked(
    "passes: tiny baseline + minor drop (5000 → 4999, well under 80%)",
    checkPointsCollapse(5000, 4999, "Amex Membership Rewards"),
    false,
  );
}

// ── Gate 3: source_page_marked_discontinued ────────────────────────────────
console.log("\nGate 3: source_page_marked_discontinued");
{
  // Real regression: amex-gold scraped the legacy /amex-gold/ USCCG page
  // labelled "AmEx Gold 旧版 (Discontinued)" — both markers within a few
  // chars of the card name.
  expectBlocked(
    "blocks: 'discontinued' near 'gold card' (amex-gold regression)",
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "review of the american express gold card — note: this is the discontinued legacy version",
    ),
    true,
  );
  expectBlocked(
    "blocks: '旧版' near card name (zh marker)",
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "amex gold card 旧版 介紹 (此為舊版本)",
    ),
    true,
  );
  expectBlocked(
    "passes: 'discontinued' >200 chars from any card-name word",
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "intro paragraph mentioning unrelated topic. " + "x".repeat(400) + " an unrelated discontinued partnership programme " + "y".repeat(400) + " here we describe the american express gold card",
    ),
    false,
  );
  expectBlocked(
    "passes: page never mentions 'discontinued' or '旧版'",
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "american express gold card welcome offer earn 100,000 membership rewards points",
    ),
    false,
  );
  expectBlocked(
    "passes: page contains 'discontinued' but the card-words don't appear at all",
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "the citi prestige product line was discontinued in 2021. that's all this page covers.",
    ),
    false,
  );
  expectBlocked(
    "blocks (intentionally conservative): 'discontinued' shares window with card-name word",
    // Spec accepts this kind of false positive over false negative — it's
    // cheaper to manually approve a flagged candidate than to let a bad PR
    // ship. If 'card' (a generic word) lands within 200 chars, gate fires.
    checkSourcePageDiscontinued(
      "American Express Gold Card",
      "the citi prestige card was discontinued in 2021. moving on to the gold review",
    ),
    true,
  );
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
