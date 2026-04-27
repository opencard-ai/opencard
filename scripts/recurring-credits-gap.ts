/**
 * Gap analysis for recurring_credits coverage.
 *
 * Goal: identify which of the 249 cards most need recurring_credits filled,
 * prioritized by likely yield (i.e. cards that probably HAVE recurring credits
 * worth listing).
 *
 * Heuristics for priority:
 *   - Premium issuers (Amex, Chase, Citi, Cap One) with annual_fee ≥ $95 →
 *     almost certainly have benefits worth listing.
 *   - Business cards from Amex/Chase → often have biz-specific credits
 *     (Adobe, Indeed, Dell, etc.).
 *   - No-AF cards from premium issuers (Freedom Unlimited, Gold Card) →
 *     occasionally have small credits (e.g. DoorDash DashPass).
 *   - Secured / store cards / credit unions → low yield, deprioritize.
 *
 * Outputs:
 *   - data/recurring-credits-research/gap-analysis.json
 *   - Console summary (top 50 priority cards)
 */
import * as fs from "fs";
import * as path from "path";

interface CardSummary {
  card_id: string;
  name?: string;
  issuer?: string;
  annual_fee?: number;
  has_recurring_credits: boolean;
  rc_count: number;
  tags?: string[];
  card_type: "consumer" | "business" | "secured" | "student" | "store" | "unknown";
  tier: "premium" | "mid" | "no-af" | "secured-or-store";
  priority_score: number;
  priority_reason: string;
}

function inferCardType(c: Record<string, unknown>): CardSummary["card_type"] {
  const id = String(c.card_id ?? "").toLowerCase();
  const name = String(c.name ?? "").toLowerCase();
  const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
  if (id.includes("biz") || id.includes("business") || /business|biz/.test(name) || tags.includes("business")) return "business";
  if (id.includes("secured") || /secured/.test(name)) return "secured";
  if (id.includes("student") || /student/.test(name)) return "student";
  // Store-card heuristic: synchrony / comenity, or named after a retailer
  if (
    id.startsWith("sync-") ||
    /\b(amazon store|target|kohl|gap|old navy|banana republic|nordstrom|bestbuy|home depot|lowes)\b/.test(name)
  ) return "store";
  return "consumer";
}

function inferTier(c: Record<string, unknown>, type: CardSummary["card_type"]): CardSummary["tier"] {
  if (type === "secured" || type === "store") return "secured-or-store";
  const af = typeof c.annual_fee === "number" ? c.annual_fee : 0;
  if (af >= 250) return "premium";
  if (af >= 95) return "mid";
  return "no-af";
}

function priorityScore(c: Record<string, unknown>, type: CardSummary["card_type"], tier: CardSummary["tier"]): { score: number; reason: string } {
  const issuer = String(c.issuer ?? "").toLowerCase();
  const id = String(c.card_id ?? "").toLowerCase();

  // Lowest priority: secured/store/credit-union specifically
  if (type === "secured" || type === "store") return { score: 5, reason: "secured/store — low yield" };
  if (issuer.includes("credit union") || issuer.includes("navy federal") || issuer.includes("penfed")) {
    return { score: 15, reason: "credit union — usually no marketing credits" };
  }

  // Highest: premium consumer/business cards from major issuers
  const isMajor = ["american express", "chase", "citi", "capital one", "barclays"].some((m) => issuer.includes(m));
  if (tier === "premium" && isMajor) return { score: 100, reason: `premium ${type} ${issuer} ($${(c.annual_fee as number) ?? "?"} AF) — high yield` };
  if (tier === "premium") return { score: 85, reason: `premium ${type} ${issuer}` };

  // Business cards from major issuers — often biz-specific credits
  if (type === "business" && isMajor) return { score: 75, reason: `business ${issuer} — biz-specific credits likely` };

  // Mid-tier major
  if (tier === "mid" && isMajor) return { score: 60, reason: `mid-tier ${issuer} ($${(c.annual_fee as number) ?? "?"} AF)` };

  // No-AF major (Freedom Unlimited, etc.) — occasionally has small credits
  if (tier === "no-af" && isMajor) return { score: 35, reason: `no-AF ${issuer} — occasional small credits` };

  // Mid-tier non-major
  if (tier === "mid") return { score: 40, reason: `mid-tier ${issuer}` };

  // No-AF non-major
  if (tier === "no-af") return { score: 20, reason: `no-AF ${issuer} — low yield` };

  return { score: 10, reason: "unclassified" };
}

function main() {
  const cardsDir = path.join(process.cwd(), "data", "cards");
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

  const summaries: CardSummary[] = [];
  for (const f of files) {
    let c: Record<string, unknown>;
    try {
      c = JSON.parse(fs.readFileSync(path.join(cardsDir, f), "utf8"));
    } catch {
      continue;
    }
    const rc = c.recurring_credits;
    const has = Array.isArray(rc) && rc.length > 0;
    const count = Array.isArray(rc) ? rc.length : 0;
    const type = inferCardType(c);
    const tier = inferTier(c, type);
    const { score, reason } = priorityScore(c, type, tier);
    summaries.push({
      card_id: c.card_id as string,
      name: c.name as string | undefined,
      issuer: c.issuer as string | undefined,
      annual_fee: c.annual_fee as number | undefined,
      has_recurring_credits: has,
      rc_count: count,
      tags: c.tags as string[] | undefined,
      card_type: type,
      tier,
      priority_score: score,
      priority_reason: reason,
    });
  }

  // Filter to gap (cards needing recurring_credits)
  const gap = summaries.filter((s) => !s.has_recurring_credits);
  gap.sort((a, b) => b.priority_score - a.priority_score);

  // Coverage stats by tier
  const byTier: Record<string, { has: number; missing: number }> = {};
  for (const s of summaries) {
    const k = `${s.tier} (${s.card_type})`;
    if (!byTier[k]) byTier[k] = { has: 0, missing: 0 };
    if (s.has_recurring_credits) byTier[k].has++;
    else byTier[k].missing++;
  }

  // Output
  const outDir = path.join(process.cwd(), "data", "recurring-credits-research");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "gap-analysis.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_cards: summaries.length,
        with_recurring_credits: summaries.filter((s) => s.has_recurring_credits).length,
        gap_count: gap.length,
        coverage_by_tier: byTier,
        top_priority_gap: gap.slice(0, 80),
        all_gap: gap,
        full_inventory: summaries,
      },
      null,
      2,
    ),
  );

  console.log(`📊 RC coverage: ${summaries.filter((s) => s.has_recurring_credits).length} / ${summaries.length} cards`);
  console.log(`   Gap: ${gap.length} cards missing recurring_credits`);
  console.log();
  console.log(`📋 Coverage by tier:`);
  for (const [k, v] of Object.entries(byTier).sort()) {
    console.log(`   ${k.padEnd(28)} has=${v.has}  missing=${v.missing}`);
  }
  console.log();
  console.log(`🎯 Top 50 priority gap cards (high-yield candidates):`);
  console.log(
    `   ${"score".padStart(5)}  ${"card_id".padEnd(38)} ${"issuer".padEnd(20)} ${"AF".padStart(5)}  ${"tier".padEnd(8)} ${"type"}`,
  );
  console.log(`   ${"-".repeat(100)}`);
  for (const g of gap.slice(0, 50)) {
    console.log(
      `   ${String(g.priority_score).padStart(5)}  ${g.card_id.padEnd(38)} ${(g.issuer ?? "?").padEnd(20)} ${String(g.annual_fee ?? "-").padStart(5)}  ${g.tier.padEnd(8)} ${g.card_type}`,
    );
  }
  console.log();
  console.log(`✅ Full report: ${outPath}`);
}

main();
