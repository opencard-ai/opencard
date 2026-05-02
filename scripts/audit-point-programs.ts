/**
 * Catalog audit: flag suspect point_program values on co-brand cards.
 *
 * Heuristic: if a card's card_id or name strongly implies a specific
 * loyalty program (Hilton Honors, Delta SkyMiles, etc.), then the
 * welcome_offer.point_program AND earning_rates[*].program should
 * mostly use that program. When they instead use a generic transferable
 * currency (Amex MR, Chase UR, Citi TY) or another co-brand's program,
 * that's almost certainly a data bug.
 *
 * Usage:
 *   tsx scripts/audit-point-programs.ts        # human-readable report
 *   tsx scripts/audit-point-programs.ts --json # machine-readable
 *
 * The script is read-only; it never edits catalog files.
 */

import fs from "fs";
import path from "path";

interface WelcomeOffer {
  point_program?: string;
  bonus_points?: number;
}
interface EarningRate {
  category?: string;
  program?: string;
  rate?: number;
}
interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  welcome_offer?: WelcomeOffer;
  earning_rates?: EarningRate[];
}

interface ProgramMatcher {
  /** Substrings (lowercase) in card_id or name that indicate this co-brand. */
  hints: string[];
  /** Canonical program string. */
  expected: string;
  /** Strings that, if present in point_program, are obvious mistakes. */
  badContains?: string[];
}

const COBRAND_RULES: ProgramMatcher[] = [
  { hints: ["hilton"], expected: "Hilton Honors", badContains: ["membership rewards", "ultimate rewards", "thankyou", "miles & more"] },
  { hints: ["marriott", "bonvoy", "bevy", "brilliant", "boundless"], expected: "Marriott Bonvoy", badContains: ["membership rewards", "ultimate rewards", "thankyou"] },
  { hints: ["hyatt"], expected: "World of Hyatt", badContains: ["membership rewards", "thankyou"] },
  { hints: ["ihg"], expected: "IHG One Rewards", badContains: ["membership rewards", "ultimate rewards", "thankyou"] },
  { hints: ["wyndham"], expected: "Wyndham Rewards", badContains: ["membership rewards", "ultimate rewards", "thankyou"] },
  { hints: ["choice"], expected: "Choice Privileges", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["delta"], expected: "Delta SkyMiles", badContains: ["membership rewards", "ultimate rewards", "thankyou"] },
  { hints: ["united"], expected: "United MileagePlus", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["aa-", "aadvantage", "citi-aa", "citi-aadvantage"], expected: "AAdvantage", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["alaska"], expected: "Alaska Mileage Plan", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["southwest"], expected: "Rapid Rewards", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["jetblue"], expected: "JetBlue TrueBlue", badContains: ["membership rewards", "ultimate rewards"] },
  { hints: ["british-airways", "iberia", "aer-lingus"], expected: "Avios", badContains: ["membership rewards", "thankyou"] },
];

interface Finding {
  card_id: string;
  name: string;
  field: "welcome_offer.point_program" | "earning_rates.program";
  expected: string;
  actual: string;
  rate?: number;
  category?: string;
  severity: "high" | "medium";
}

function matchRule(card: Card): ProgramMatcher | null {
  const hay = `${card.card_id} ${card.name}`.toLowerCase();
  for (const rule of COBRAND_RULES) {
    if (rule.hints.some((h) => hay.includes(h))) return rule;
  }
  return null;
}

function audit(cards: Card[]): Finding[] {
  const findings: Finding[] = [];
  for (const card of cards) {
    const rule = matchRule(card);
    if (!rule) continue;

    const wp = card.welcome_offer?.point_program;
    if (wp) {
      const lower = wp.toLowerCase();
      const expectedTokens = rule.expected.toLowerCase().split(/\s+/).filter((tk) => tk.length > 3);
      const hitsExpected = expectedTokens.some((tk) => lower.includes(tk));
      const hitsBad = (rule.badContains || []).some((b) => lower.includes(b));
      if (!hitsExpected && hitsBad) {
        findings.push({
          card_id: card.card_id,
          name: card.name,
          field: "welcome_offer.point_program",
          expected: rule.expected,
          actual: wp,
          severity: "high",
        });
      } else if (!hitsExpected) {
        findings.push({
          card_id: card.card_id,
          name: card.name,
          field: "welcome_offer.point_program",
          expected: rule.expected,
          actual: wp,
          severity: "medium",
        });
      }
    }

    const expectedTokensRate = rule.expected.toLowerCase().split(/\s+/).filter((tk) => tk.length > 3);
    for (const rate of card.earning_rates || []) {
      if (!rate.program) continue;
      const lower = rate.program.toLowerCase();
      const hitsExpected = expectedTokensRate.some((tk) => lower.includes(tk));
      const hitsBad = (rule.badContains || []).some((b) => lower.includes(b));
      // Earning categories on a co-brand card frequently have transferable
      // companion programs (e.g. Amex Hilton Aspire still earns MR on a
      // misc category). So flag only the bad-contains case as high here,
      // and skip medium for earning rates.
      if (hitsBad && !hitsExpected) {
        findings.push({
          card_id: card.card_id,
          name: card.name,
          field: "earning_rates.program",
          expected: rule.expected,
          actual: rate.program,
          rate: rate.rate,
          category: rate.category,
          severity: "high",
        });
      }
    }
  }
  return findings;
}

function main() {
  const wantJson = process.argv.includes("--json");
  const dir = path.join(process.cwd(), "data/cards");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const cards: Card[] = [];
  for (const file of files) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (c.card_id) cards.push(c);
    } catch {}
  }
  const findings = audit(cards);

  if (wantJson) {
    process.stdout.write(JSON.stringify(findings, null, 2) + "\n");
    return;
  }

  if (findings.length === 0) {
    console.log(`✓ No suspect point_program entries across ${cards.length} cards.`);
    return;
  }

  const high = findings.filter((f) => f.severity === "high");
  const med = findings.filter((f) => f.severity === "medium");

  console.log(`Audited ${cards.length} cards. Found ${findings.length} suspect entries (${high.length} high, ${med.length} medium).\n`);
  if (high.length) {
    console.log("HIGH — likely-wrong (co-brand card pointing to a transferable currency):");
    for (const f of high) {
      const tail = f.field === "earning_rates.program"
        ? `  [${f.rate}× ${f.category}]`
        : "";
      console.log(`  ${f.card_id}  ${f.field}${tail}`);
      console.log(`    expected: ${f.expected}`);
      console.log(`    actual:   ${f.actual}`);
    }
    console.log();
  }
  if (med.length) {
    console.log("MEDIUM — review (program does not match co-brand, may be intentional):");
    for (const f of med) {
      console.log(`  ${f.card_id}  ${f.field}`);
      console.log(`    expected: ${f.expected}`);
      console.log(`    actual:   ${f.actual}`);
    }
    console.log();
  }
}

main();
