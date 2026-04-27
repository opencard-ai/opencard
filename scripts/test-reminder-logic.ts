/**
 * Unit tests for lib/reminder-logic.ts
 *
 * Run: npx tsx scripts/test-reminder-logic.ts
 *
 * Exits non-zero on failure so it can be wired into CI.
 */
import { bucketCredit, periodBoundaries } from "../lib/reminder-logic";

interface TestCase {
  name: string;
  input: { frequency: string; reset_type?: string; cardOpenDate?: string };
  now: string;
  expected: "thisMonth" | "expiringSoon" | null;
}

const cases: TestCase[] = [
  // ─── monthly ────────────────────────────────────────────
  {
    name: "monthly: day 1 → thisMonth",
    input: { frequency: "monthly" },
    now: "2026-04-01T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "monthly: day 5 → thisMonth (within fresh window)",
    input: { frequency: "monthly" },
    now: "2026-04-05T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "monthly: day 15 → null (mid-month)",
    input: { frequency: "monthly" },
    now: "2026-04-15T09:00:00Z",
    expected: null,
  },
  {
    name: "monthly: day 20 → expiringSoon",
    input: { frequency: "monthly" },
    now: "2026-04-20T09:00:00Z",
    expected: "expiringSoon",
  },
  {
    name: "monthly: day 30 → expiringSoon",
    input: { frequency: "monthly" },
    now: "2026-04-30T09:00:00Z",
    expected: "expiringSoon",
  },

  // ─── quarterly ──────────────────────────────────────────
  {
    name: "quarterly: Q2 first day Apr 1 → thisMonth",
    input: { frequency: "quarterly" },
    now: "2026-04-01T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "quarterly: Q2 mid Apr 20 → null (not expiring, not fresh)",
    input: { frequency: "quarterly" },
    now: "2026-04-20T09:00:00Z",
    expected: null,
  },
  {
    name: "quarterly: Q2 mid May 20 → null (BUG WAS HERE — old code wrongly fired expiring)",
    input: { frequency: "quarterly" },
    now: "2026-05-20T09:00:00Z",
    expected: null,
  },
  {
    name: "quarterly: Q2 last 14d Jun 20 → expiringSoon",
    input: { frequency: "quarterly" },
    now: "2026-06-20T09:00:00Z",
    expected: "expiringSoon",
  },
  {
    name: "quarterly: Q2 end Jun 30 → expiringSoon",
    input: { frequency: "quarterly" },
    now: "2026-06-30T23:00:00Z",
    expected: "expiringSoon",
  },

  // ─── semi_annual ────────────────────────────────────────
  {
    name: "semi_annual: H1 start Jan 1 → thisMonth",
    input: { frequency: "semi_annual" },
    now: "2026-01-01T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "semi_annual: H1 end Jun 25 → expiringSoon",
    input: { frequency: "semi_annual" },
    now: "2026-06-25T09:00:00Z",
    expected: "expiringSoon",
  },
  {
    name: "semi_annual: H2 start Jul 3 → thisMonth",
    input: { frequency: "semi_annual" },
    now: "2026-07-03T09:00:00Z",
    expected: "thisMonth",
  },

  // ─── annual (calendar_year, default) ─────────────────────
  {
    name: "annual calendar: Jan 1 → thisMonth (BUG WAS: old code never fired thisMonth for annual)",
    input: { frequency: "annual", reset_type: "calendar_year" },
    now: "2026-01-01T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "annual calendar: Jul 1 → null (mid-year)",
    input: { frequency: "annual", reset_type: "calendar_year" },
    now: "2026-07-01T09:00:00Z",
    expected: null,
  },
  {
    name: "annual calendar: Dec 20 → expiringSoon",
    input: { frequency: "annual", reset_type: "calendar_year" },
    now: "2026-12-20T09:00:00Z",
    expected: "expiringSoon",
  },

  // ─── annual anniversary (per-card open_date) ─────────────
  {
    name: "annual anniversary: 2 days after open anniversary → thisMonth",
    input: { frequency: "annual", reset_type: "anniversary", cardOpenDate: "2024-04-25T00:00:00Z" },
    now: "2026-04-27T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "annual anniversary: 8 months in → null (mid-cycle)",
    input: { frequency: "annual", reset_type: "anniversary", cardOpenDate: "2024-04-25T00:00:00Z" },
    now: "2026-12-15T09:00:00Z",
    expected: null,
  },
  {
    name: "annual anniversary: 14 days before next anniversary → expiringSoon",
    input: { frequency: "annual", reset_type: "anniversary", cardOpenDate: "2024-04-25T00:00:00Z" },
    now: "2027-04-15T09:00:00Z",
    expected: "expiringSoon",
  },

  // ─── cardmember_year ─────────────────────────────────────
  {
    name: "cardmember_year without cardOpenDate → null (cannot compute)",
    input: { frequency: "cardmember_year" },
    now: "2026-04-27T09:00:00Z",
    expected: null,
  },
  {
    name: "cardmember_year with cardOpenDate, anniversary today → thisMonth",
    input: { frequency: "cardmember_year", cardOpenDate: "2024-04-27T00:00:00Z" },
    now: "2026-04-27T09:00:00Z",
    expected: "thisMonth",
  },

  // ─── every_4_years (Global Entry) ────────────────────────
  {
    name: "every_4_years: just opened → thisMonth (within first 7d)",
    input: { frequency: "every_4_years", cardOpenDate: "2026-04-25T00:00:00Z" },
    now: "2026-04-27T09:00:00Z",
    expected: "thisMonth",
  },
  {
    name: "every_4_years: 2 years in → null (mid-cycle)",
    input: { frequency: "every_4_years", cardOpenDate: "2024-04-25T00:00:00Z" },
    now: "2026-04-25T09:00:00Z",
    expected: null,
  },
  {
    name: "every_4_years: 14 days before 4-year mark → expiringSoon",
    input: { frequency: "every_4_years", cardOpenDate: "2024-04-25T00:00:00Z" },
    now: "2028-04-15T09:00:00Z",
    expected: "expiringSoon",
  },
  {
    name: "every_4_years: no cardOpenDate → null (cannot compute)",
    input: { frequency: "every_4_years" },
    now: "2026-04-27T09:00:00Z",
    expected: null,
  },

  // ─── per_stay ────────────────────────────────────────────
  {
    name: "per_stay: any date → null (no scheduled reminder)",
    input: { frequency: "per_stay" },
    now: "2026-04-15T09:00:00Z",
    expected: null,
  },

  // ─── unknown frequency ───────────────────────────────────
  {
    name: "unknown frequency → null (forward-compat)",
    input: { frequency: "blah" },
    now: "2026-04-15T09:00:00Z",
    expected: null,
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of cases) {
  const result = bucketCredit(tc.input, new Date(tc.now));
  if (result === tc.expected) {
    passed++;
  } else {
    failed++;
    failures.push(`❌ ${tc.name}\n   input: ${JSON.stringify(tc.input)}\n   now:   ${tc.now}\n   expected: ${tc.expected}\n   got:      ${result}`);
  }
}

console.log(`\n📊 ${passed}/${cases.length} passed`);
if (failed > 0) {
  console.log();
  for (const f of failures) console.log(f, "\n");
  process.exit(1);
}
console.log("✅ all green");
