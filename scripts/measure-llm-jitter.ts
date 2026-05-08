/**
 * Measure LLM extraction jitter on a single card by running the full
 * scrape → extract pipeline N times against the SAME cached HTML.
 *
 * Goal: characterise non-determinism in MiniMax M2.7 output (handoff
 * 2026-05-05 §32 #3 noted "Preferred 75K / 60K" jitter on consecutive
 * runs). Without ground-truth on jitter shape we can't design the
 * self-check pattern (retry-on-suspicious vs N=3 majority vote).
 *
 * Run:
 *   node --env-file=.env -r ts-node/register -- doesn't work with tsx, use:
 *   npx tsx --env-file=.env scripts/measure-llm-jitter.ts chase-sapphire-preferred 5
 *
 * Cost: ~$0.05 × N MiniMax calls. Scrape happens once, all N calls hit
 * the same HTML so any variance is pure LLM non-determinism.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { extractCardData, type ExtractedData } from "./auto-update-cards/extract";
import { scrapeCard } from "./auto-update-cards/scrape";
import type { Card } from "./auto-update-cards/cards-loader";

const cardId = process.argv[2] || "chase-sapphire-preferred";
const N = parseInt(process.argv[3] || "5", 10);

(async () => {
  const cardPath = path.join(process.cwd(), "data", "cards", `${cardId}.json`);
  const card: Card = JSON.parse(readFileSync(cardPath, "utf8"));
  console.log(`Card: ${card.card_id} (${card.name})`);
  console.log(`N=${N} parallel LLM calls against the same scraped HTML\n`);

  console.log("[1/2] Scraping (single fetch)...");
  const t0 = Date.now();
  const scrape = await scrapeCard(card);
  console.log(`      source=${scrape.source} url=${scrape.fallbackUrl} bytes=${scrape.html?.length ?? 0} (${Date.now() - t0}ms)`);
  if (!scrape.html) {
    console.error("✗ scrape failed:", scrape.error);
    process.exit(1);
  }
  const html = scrape.html;
  const sourceUrl = scrape.fallbackUrl ?? "";

  console.log(`\n[2/2] Firing ${N} extract calls in parallel...`);
  const t1 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: N }, () => extractCardData(card, html, sourceUrl)),
  );
  console.log(`      done in ${Date.now() - t1}ms`);

  const ok: ExtractedData[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push(r.value);
    else console.log(`  run #${i + 1}: ERROR ${r.reason}`);
  });
  if (ok.length === 0) {
    console.error("\nAll runs failed.");
    process.exit(2);
  }

  // ── Per-field summary table ────────────────────────────────────────
  const rows: Array<{ field: string; values: unknown[] }> = [
    { field: "annual_fee",                       values: ok.map((r) => r.annual_fee) },
    { field: "welcome_offer.bonus_points",       values: ok.map((r) => r.welcome_offer?.bonus_points ?? null) },
    { field: "welcome_offer.spending_requirement",values: ok.map((r) => r.welcome_offer?.spending_requirement ?? null) },
    { field: "welcome_offer.time_period_months", values: ok.map((r) => r.welcome_offer?.time_period_months ?? null) },
    { field: "welcome_offer.point_program",      values: ok.map((r) => r.welcome_offer?.point_program ?? null) },
    { field: "welcome_offer.is_elevated",        values: ok.map((r) => r.welcome_offer?.is_elevated ?? null) },
    { field: "welcome_offer.normal_bonus_points",values: ok.map((r) => r.welcome_offer?.normal_bonus_points ?? null) },
    { field: "welcome_offer.elevated_until",     values: ok.map((r) => r.welcome_offer?.elevated_until ?? null) },
    { field: "welcome_offer.free_nights",        values: ok.map((r) => r.welcome_offer?.free_nights ?? null) },
    { field: "welcome_offer.free_night_value_cap",values: ok.map((r) => r.welcome_offer?.free_night_value_cap ?? null) },
    { field: "earning_rates.length",             values: ok.map((r) => r.earning_rates?.length ?? 0) },
    { field: "confidence",                       values: ok.map((r) => Number(r.confidence?.toFixed(3) ?? 0)) },
  ];

  console.log(`\n=== Field-level jitter (N=${ok.length}) ===\n`);
  let totalUnstable = 0;
  for (const { field, values } of rows) {
    const distinct = [...new Set(values.map((v) => JSON.stringify(v)))];
    const stable = distinct.length === 1;
    if (!stable) totalUnstable++;
    const marker = stable ? "  " : "✗ ";
    console.log(`${marker}${field.padEnd(36)} ${stable ? "stable" : `${distinct.length} distinct`}: ${distinct.slice(0, 4).join(", ")}${distinct.length > 4 ? "…" : ""}`);
  }

  // Description string is high-entropy by design; check word-level stability instead
  const descs = ok.map((r) => r.welcome_offer?.description ?? "");
  const descDistinct = [...new Set(descs)].length;
  console.log(`  ${"welcome_offer.description".padEnd(36)} ${descDistinct === 1 ? "stable" : `${descDistinct} distinct`} (lengths: ${descs.map((d) => d.length).join(", ")})`);

  console.log(`\nTotal: ${rows.length - totalUnstable}/${rows.length} numeric/enum fields stable across ${ok.length} runs.`);
})();
