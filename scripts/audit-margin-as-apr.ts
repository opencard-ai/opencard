/**
 * Margin-as-APR audit.
 *
 * Background: the 2026-04-25 incident corrupted amex-platinum's penalty_apr
 * to 26.74 — but 26.74 is the *margin* in "Prime Rate + 26.74%", not the
 * absolute APR. The actual penalty APR is ~34% (Prime ~7.5% + 26.74%).
 *
 * Stage 2 verify cleared penalty_apr on amex-platinum, but the brief flags
 * that other Amex/Chase/Citi cards likely still have margin values written
 * to absolute-APR fields. This script identifies them.
 *
 * What this script DOES:
 *   - Read all data/cards/*.json
 *   - For each APR-like field (penalty_apr, apr_purchases*, apr_cash_advances),
 *     classify the value as: legitimate / suspect-margin / out-of-range
 *   - Output a console report and a JSON file
 *
 * What this script DOES NOT do:
 *   - Modify data/cards/. Use scripts/fix-margin-as-apr.ts after reviewing.
 *
 * Usage:
 *   npx tsx scripts/audit-margin-as-apr.ts
 *   npx tsx scripts/audit-margin-as-apr.ts --json-only
 */
import * as fs from "fs";
import * as path from "path";

type Verdict =
  | "legitimate"
  | "legitimate-string" // valid value but stored as string instead of number
  | "suspect-margin"
  | "suspect-margin-string" // string value that parses as a likely margin
  | "out-of-range"
  | "non-numeric"
  | "missing";

interface FieldFinding {
  field: string;
  value: number | null;
  raw: unknown; // original value as stored
  verdict: Verdict;
  reason: string;
}

interface CardAudit {
  card_id: string;
  name?: string;
  issuer?: string;
  last_updated?: string;
  cfpb_verified?: boolean;
  findings: FieldFinding[];
  /** True if any finding has verdict "suspect-margin" or "out-of-range". */
  has_issue: boolean;
}

interface AuditReport {
  generated_at: string;
  total_cards: number;
  fields_audited: string[];
  by_verdict: Record<Verdict, number>;
  cards_with_issues: number;
  cards: CardAudit[];
}

const APR_FIELDS = [
  "penalty_apr",
  "apr_purchases",
  "apr_purchases_min",
  "apr_purchases_max",
  "apr_cash_advances",
] as const;

/**
 * Issuer groups by APR baseline behavior. Affects the suspect-margin threshold.
 *
 * - "fixed-premium": issuer typically uses fixed absolute penalty_apr ~29.99%
 *   (Amex). Anything < 25% is almost certainly a margin.
 * - "variable-prime-plus": issuer uses Prime+margin and publishes the absolute
 *   APR in the Schumer Box. Anything < 22% is suspect (Prime ~7.5% + 12%
 *   minimum margin = ~19.5% floor for purchase APR).
 * - "credit-union": NFCU and PenFed offer genuinely lower absolute APRs
 *   (10.99-18% real). Don't flag below 20%.
 * - "subprime": secured / first-progress cards run high (25-35% absolute).
 */
type IssuerClass =
  | "fixed-premium"
  | "variable-prime-plus"
  | "credit-union"
  | "subprime"
  | "unknown";

function classifyIssuer(issuer?: string, cardId?: string): IssuerClass {
  const i = (issuer ?? "").toLowerCase();
  const id = (cardId ?? "").toLowerCase();
  if (
    i.includes("navy federal") ||
    i.includes("penfed") ||
    i.includes("credit union") ||
    id.startsWith("navy-federal") ||
    id.startsWith("penfed")
  ) {
    return "credit-union";
  }
  if (i === "american express" || id.startsWith("amex-") || id.startsWith("delta-skymiles")) {
    return "fixed-premium";
  }
  if (
    i === "chase" ||
    i === "citi" ||
    i === "capital one" ||
    i === "bank of america" ||
    i === "barclays" ||
    i === "u.s. bank" ||
    i === "us bank" ||
    i === "wells fargo" ||
    i === "discover"
  ) {
    return "variable-prime-plus";
  }
  if (
    id.includes("secured") ||
    id.includes("first-progress") ||
    id.includes("opensky") ||
    i === "first electronic bank"
  ) {
    return "subprime";
  }
  return "unknown";
}

/**
 * Per-field thresholds for "this is suspiciously low for an absolute APR
 * — likely a margin written by mistake".
 *
 * Returns: lowerBound (inclusive). Values < lowerBound get flagged suspect-margin.
 *          Returns null if we trust the issuer class to genuinely have low APRs.
 */
function suspectThreshold(
  field: string,
  klass: IssuerClass,
): { suspect_below: number | null; out_of_range_above: number | null } {
  // penalty_apr is almost always ≥ 25% absolute; margins range 18-29%
  if (field === "penalty_apr") {
    if (klass === "credit-union") return { suspect_below: 18, out_of_range_above: 35 };
    if (klass === "fixed-premium") return { suspect_below: 28, out_of_range_above: 35 };
    if (klass === "variable-prime-plus") return { suspect_below: 25, out_of_range_above: 35 };
    if (klass === "subprime") return { suspect_below: 25, out_of_range_above: 40 };
    return { suspect_below: 25, out_of_range_above: 40 };
  }
  // apr_purchases (and min/max) absolute values 14-30% for most cards
  if (field.startsWith("apr_purchases")) {
    if (klass === "credit-union") return { suspect_below: 9, out_of_range_above: 25 };
    if (klass === "fixed-premium") return { suspect_below: 18, out_of_range_above: 32 };
    if (klass === "variable-prime-plus") return { suspect_below: 14, out_of_range_above: 32 };
    if (klass === "subprime") return { suspect_below: 18, out_of_range_above: 36 };
    return { suspect_below: 14, out_of_range_above: 36 };
  }
  // apr_cash_advances: usually higher, ~25-30%
  if (field === "apr_cash_advances") {
    if (klass === "credit-union") return { suspect_below: 9, out_of_range_above: 30 };
    return { suspect_below: 22, out_of_range_above: 36 };
  }
  return { suspect_below: null, out_of_range_above: null };
}

function classifyField(
  field: string,
  raw: unknown,
  klass: IssuerClass,
): FieldFinding {
  if (raw === undefined || raw === null) {
    return { field, value: null, raw, verdict: "missing", reason: "field absent" };
  }

  // Coerce: accept number directly, or numeric string. Anything else is non-numeric garbage.
  let value: number;
  let isString = false;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed)) {
      return {
        field,
        value: null,
        raw,
        verdict: "non-numeric",
        reason: `string "${raw}" cannot be parsed as a number`,
      };
    }
    value = parsed;
    isString = true;
  } else {
    return {
      field,
      value: null,
      raw,
      verdict: "non-numeric",
      reason: `unexpected type ${typeof raw}: ${JSON.stringify(raw)}`,
    };
  }

  const thresh = suspectThreshold(field, klass);
  if (thresh.suspect_below !== null && value < thresh.suspect_below) {
    return {
      field,
      value,
      raw,
      verdict: isString ? "suspect-margin-string" : "suspect-margin",
      reason: `${value}% is below ${thresh.suspect_below}% (likely Prime+${value}% margin written as absolute APR for ${klass} issuer)${isString ? "; stored as string" : ""}`,
    };
  }
  if (thresh.out_of_range_above !== null && value > thresh.out_of_range_above) {
    return {
      field,
      value,
      raw,
      verdict: "out-of-range",
      reason: `${value}% exceeds plausible upper bound ${thresh.out_of_range_above}% for ${klass} issuer`,
    };
  }
  return {
    field,
    value,
    raw,
    verdict: isString ? "legitimate-string" : "legitimate",
    reason: `${value}% within expected range for ${klass} issuer${isString ? "; stored as string instead of number" : ""}`,
  };
}

function auditCard(card: Record<string, unknown>): CardAudit {
  const klass = classifyIssuer(
    card.issuer as string | undefined,
    card.card_id as string | undefined,
  );
  const findings = APR_FIELDS.map((f) => classifyField(f, card[f], klass));
  const has_issue = findings.some(
    (f) => f.verdict === "suspect-margin" || f.verdict === "out-of-range",
  );
  return {
    card_id: card.card_id as string,
    name: card.name as string | undefined,
    issuer: card.issuer as string | undefined,
    last_updated: card.last_updated as string | undefined,
    cfpb_verified: card.cfpb_verified as boolean | undefined,
    findings,
    has_issue,
  };
}

function main() {
  const jsonOnly = process.argv.includes("--json-only");
  const cardsDir = path.join(process.cwd(), "data", "cards");
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

  const audits: CardAudit[] = [];
  for (const f of files) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(cardsDir, f), "utf8"));
      audits.push(auditCard(c));
    } catch (err) {
      console.error(`⚠️  ${f}: parse error: ${(err as Error).message}`);
    }
  }

  const byVerdict: Record<Verdict, number> = {
    legitimate: 0,
    "legitimate-string": 0,
    "suspect-margin": 0,
    "suspect-margin-string": 0,
    "out-of-range": 0,
    "non-numeric": 0,
    missing: 0,
  };
  for (const a of audits) for (const f of a.findings) byVerdict[f.verdict]++;

  const report: AuditReport = {
    generated_at: new Date().toISOString(),
    total_cards: audits.length,
    fields_audited: APR_FIELDS as readonly string[] as string[],
    by_verdict: byVerdict,
    cards_with_issues: audits.filter((a) => a.has_issue).length,
    cards: audits,
  };

  const outPath = path.join(
    process.cwd(),
    "scripts/pipelines/cfpb/config/margin-as-apr-audit.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`🔍 Audited ${audits.length} cards × ${APR_FIELDS.length} APR-like fields`);
  console.log();
  console.log(`📊 Findings by verdict:`);
  for (const [k, v] of Object.entries(byVerdict)) {
    const total = audits.length * APR_FIELDS.length;
    const pct = ((v / total) * 100).toFixed(1);
    console.log(`   ${String(k).padEnd(18)} ${String(v).padStart(5)}  (${pct}% of ${total} field-checks)`);
  }
  console.log();

  // Group issues by verdict
  type Pair = { card: CardAudit; finding: FieldFinding };
  const suspectNum: Pair[] = [];
  const suspectStr: Pair[] = [];
  const legitStr: Pair[] = [];
  const oor: Pair[] = [];
  const nonNum: Pair[] = [];
  for (const a of audits) {
    for (const f of a.findings) {
      if (f.verdict === "suspect-margin") suspectNum.push({ card: a, finding: f });
      else if (f.verdict === "suspect-margin-string") suspectStr.push({ card: a, finding: f });
      else if (f.verdict === "legitimate-string") legitStr.push({ card: a, finding: f });
      else if (f.verdict === "out-of-range") oor.push({ card: a, finding: f });
      else if (f.verdict === "non-numeric") nonNum.push({ card: a, finding: f });
    }
  }

  const printTable = (rows: Pair[]) => {
    console.log(
      "    " +
        "card_id".padEnd(36) +
        "issuer".padEnd(20) +
        "field".padEnd(20) +
        "raw".padStart(10),
    );
    console.log("    " + "-".repeat(86));
    for (const { card, finding } of rows.sort((a, b) =>
      a.card.card_id.localeCompare(b.card.card_id) ||
      a.finding.field.localeCompare(b.finding.field),
    )) {
      console.log(
        "    " +
          card.card_id.padEnd(36) +
          (card.issuer ?? "?").padEnd(20) +
          finding.field.padEnd(20) +
          JSON.stringify(finding.raw).padStart(10),
      );
    }
    console.log();
  };

  console.log(`🚨 Suspect-margin (numeric) — ${suspectNum.length} field-card pairs`);
  console.log(`    These number values look like "Prime+X%" margins, NOT absolute APRs.`);
  console.log(`    This is the same bug pattern as the 2026-04-25 amex-platinum incident.`);
  console.log(`    ACTION: clear (set to null or remove field).`);
  console.log();
  printTable(suspectNum);

  console.log(`⚠️  Suspect-margin (string) — ${suspectStr.length} field-card pairs`);
  console.log(`    String values that parse as low APRs (likely margins).`);
  console.log(`    ACTION: clear (same as numeric suspects above).`);
  console.log();
  printTable(suspectStr);

  console.log(`📐 Legitimate-string — ${legitStr.length} field-card pairs`);
  console.log(`    Values are plausible absolute APRs but stored as string instead of number.`);
  console.log(`    ACTION: convert string → number (schema cleanup, no value change).`);
  console.log();
  printTable(legitStr);

  if (oor.length > 0) {
    console.log(`🚫 Out-of-range — ${oor.length} field-card pairs`);
    console.log(`    Values exceed plausible upper bound for the issuer's APR class.`);
    console.log(`    ACTION: manually verify — likely real anomalies or schema misuse.`);
    console.log();
    for (const { card, finding } of oor) {
      console.log(`    ${card.card_id} :: ${finding.field}=${JSON.stringify(finding.raw)}  [${finding.reason}]`);
    }
    console.log();
  }

  if (nonNum.length > 0) {
    console.log(`❓ Non-numeric — ${nonNum.length} field-card pairs`);
    for (const { card, finding } of nonNum) {
      console.log(`    ${card.card_id} :: ${finding.field}=${JSON.stringify(finding.raw)}`);
    }
    console.log();
  }

  console.log(`✅ Report written to ${outPath}`);
  console.log();
  console.log(`Next: review the suspect list above. To clear bad values, see`);
  console.log(`scripts/fix-margin-as-apr.ts (dry-run by default).`);
}

main();
