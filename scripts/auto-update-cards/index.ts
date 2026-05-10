/**
 * OpenCard Auto-Update Cards Pipeline
 *
 * Usage:
 *   npx tsx scripts/auto-update-cards/index.ts --dry        # dry-run (no PRs)
 *   npx tsx scripts/auto-update-cards/index.ts --apply      # actually open PRs
 *   npx tsx scripts/auto-update-cards/index.ts --max 10      # override weekly budget
 *
 * This script is designed to run in GitHub Actions but also works locally.
 */

import fs from "fs";
import path from "path";
import { CONFIG } from "./config";
import { loadCards } from "./cards-loader";
import { buildQueue } from "./bucket";
import { parseDocRss } from "./doc-parser";
import { scrapeCard } from "./scrape";
import { extractCardData } from "./extract";
import { diffCard } from "./diff";
import { classifyRisk } from "./classify";
import { createPR } from "./pr";
import { sendSummaryEmail } from "./notify";

const DRY_RUN = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");

// Override weekly budget via --max N or --max=N
const maxArg = process.argv.find((a) => a.startsWith("--max=")) ||
  process.argv.find((a) => a === "--max");
const maxIndex = process.argv.indexOf("--max");
const WEEKLY_BUDGET = maxArg
  ? parseInt((maxArg.startsWith("--max=") ? maxArg.split("=")[1] : process.argv[maxIndex + 1]), 10)
  : CONFIG.WEEKLY_BUDGET;

const OUT_DIR = path.join(process.cwd(), "data/audit-reports");
const DATE = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

async function main() {
  console.log(`\n🟡 OpenCard Auto-Update Pipeline`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : APPLY ? "APPLY" : "NO-OP (use --dry or --apply)"}`);
  console.log(`   Budget: ${WEEKLY_BUDGET} cards\n`);

  if (!DRY_RUN && !APPLY) {
    console.log("⚠️  Pass --dry or --apply to actually do something.");
    process.exit(1);
  }

  // Ensure audit output dir exists
  const runDir = path.join(OUT_DIR, DATE);
  fs.mkdirSync(runDir, { recursive: true });

  // ── Step 1: Load catalog ──────────────────────────────────────────────────
  console.log("📂 Loading card catalog...");
  const allCards = loadCards();
  console.log(`   Loaded ${allCards.length} cards`);

  // ── Step 2: Build processing queue ───────────────────────────────────────
  console.log("\n🔍 Building processing queue...");
  const docItems = await parseDocRss(CONFIG.DOC_LOOKBACK_DAYS);
  console.log(`   DoC RSS items (last ${CONFIG.DOC_LOOKBACK_DAYS} days): ${docItems.length}`);

  const queue = buildQueue(allCards, docItems, WEEKLY_BUDGET);
  console.log(`   Queue size: ${queue.length}`);
  if (queue.length > 0) {
    const featured = queue.filter((c) => c.featured).length;
    console.log(`   (Featured: ${featured}, Stale/DoC: ${queue.length - featured})`);
    console.log(`   Queue preview: ${queue.map((c) => c.card_id).join(", ")}`);
  }

  if (queue.length === 0) {
    console.log("\n✅ No cards to process. Exiting.");
    await sendSummaryEmail([], runDir);
    return;
  }

  // ── Step 3–6: Process each card ─────────────────────────────────────────
  const results: CardResult[] = [];

  for (let i = 0; i < queue.length; i++) {
    const card = queue[i];
    const delay = CONFIG.SCRAPE_DELAY_MIN_MS +
      Math.random() * (CONFIG.SCRAPE_DELAY_MAX_MS - CONFIG.SCRAPE_DELAY_MIN_MS);
    await sleep(delay);

    console.log(`\n[${i + 1}/${queue.length}] Processing: ${card.card_id}`);
    const result = await processCard(card, runDir, DRY_RUN);
    results.push(result);

    if (result.error) {
      console.log(`   [ERROR] ${card.card_id}: ${result.error}`);
    } else if (!result.hasChanges) {
      console.log(`   [OK] No changes detected for ${card.card_id}`);
    }
  }

  // ── Step 7: Summary ───────────────────────────────────────────────────────
  const prResults = results.filter((r) => r.prUrl);
  const highRisk = results.filter((r) => r.risk === "HIGH").length;
  const changes = results.filter((r) => r.hasChanges).length;
  const errors = results.filter((r) => r.error).length;
  const noChanges = results.filter((r) => !r.hasChanges && !r.error).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Pipeline Summary`);
  console.log(`   Cards processed: ${results.length}`);
  console.log(`   With changes:    ${changes}`);
  console.log(`   No changes:     ${noChanges}`);
  console.log(`   Errors:         ${errors}`);
  console.log(`   PRs opened:     ${prResults.length}`);
  console.log(`   HIGH risk:      ${highRisk}`);
  if (DRY_RUN) console.log(`   (DRY RUN — no PRs actually opened)`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Step 8: Send notification email ─────────────────────────────────────
  if (!DRY_RUN) {
    await sendSummaryEmail(results, runDir);
  } else {
    // In dry-run mode, just print what would have been sent
    printDryRunSummary(results);
  }

  // Write run metadata
  const meta = {
    date: DATE,
    mode: DRY_RUN ? "dry" : "apply",
    budget: WEEKLY_BUDGET,
    total: results.length,
    changes,
    prs: prResults.length,
    highRisk,
    errors,
  };
  fs.writeFileSync(path.join(runDir, "run-meta.json"), JSON.stringify(meta, null, 2));

  // Explicit exit. Without it the 2026-05-05 dry-run dispatch hung 28 minutes
  // after the pipeline finished (until the workflow's 30-min timeout cancelled
  // it). Likely culprit: undici keep-alive sockets from MiniMax fetches plus
  // tsx/esbuild worker subprocesses keep the event loop alive even though
  // every awaited task has resolved. Forcing exit here is a clean bandaid;
  // the alternative is auditing every fetch/import for unref'd handles.
  //
  // In DRY_RUN mode, treat per-card errors as informational (exit 0) so the
  // GitHub Actions UI doesn't flag a green data-collection run as red. In
  // APPLY mode, errors > 0 still exits non-zero so failed PR creation surfaces
  // in the dashboard.
  process.exit(DRY_RUN ? 0 : errors > 0 ? 1 : 0);
}

// ─── Per-card processing ───────────────────────────────────────────────────

interface CardResult {
  cardId: string;
  cardName: string;
  hasChanges: boolean;
  risk?: "LOW" | "MED" | "HIGH";
  prUrl?: string;
  diff?: ReturnType<typeof diffCard>;
  confidence?: number;
  error?: string;
}

async function processCardCore(
  card: ReturnType<typeof loadCards>[0],
  runDir: string,
  dryRun: boolean
): Promise<CardResult> {
  const result: CardResult = {
    cardId: card.card_id,
    cardName: card.name,
    hasChanges: false,
  };

  try {
    // Step 3: Scrape
    const scrapeResult = await scrapeCard(card);
    if (!scrapeResult.html && !scrapeResult.fallbackUrl) {
      result.error = `All sources failed for ${card.card_id}`;
      fs.writeFileSync(
        path.join(runDir, `error-${card.card_id}.json`),
        JSON.stringify({ cardId: card.card_id, error: result.error }, null, 2)
      );
      return result;
    }

    // Step 4: AI Extract
    const extractResult = await extractCardData(
      card,
      scrapeResult.html || "",
      scrapeResult.fallbackUrl || card.sources?.[0]?.url || ""
    );

    if (extractResult.confidence < CONFIG.MIN_CONFIDENCE) {
      // Low confidence → write to audit, skip diff
      fs.writeFileSync(
        path.join(runDir, `low-confidence-${card.card_id}.json`),
        JSON.stringify({ cardId: card.card_id, ...extractResult }, null, 2)
      );
      result.confidence = extractResult.confidence;
      result.error = `Low confidence (${extractResult.confidence.toFixed(2)} < ${CONFIG.MIN_CONFIDENCE})`;
      return result;
    }

    result.confidence = extractResult.confidence;

    // Step 5: Diff
    const diff = diffCard(card, extractResult);
    if (!diff || diff.changes.length === 0) {
      return result; // No changes
    }

    result.hasChanges = true;
    result.diff = diff;

    // Step 6: Classify risk
    const risk = classifyRisk(diff);
    result.risk = risk;

    // Step 7: Create PR (unless dry-run)
    if (!dryRun) {
      const prUrl = await createPR(card, diff, extractResult, risk);
      result.prUrl = prUrl;
    } else {
      console.log(`   [DRY] Would open PR: ${card.card_id} (${risk})`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    fs.writeFileSync(
      path.join(runDir, `error-${card.card_id}.json`),
      JSON.stringify({ cardId: card.card_id, error: msg }, null, 2)
    );
    return result;
  }
}

const PER_CARD_BUDGET_MS = 120_000;

async function processCard(
  card: ReturnType<typeof loadCards>[0],
  runDir: string,
  dryRun: boolean
): Promise<CardResult> {
  // Hard per-card budget so one stuck card can't hang the whole run.
  return Promise.race([
    processCardCore(card, runDir, dryRun),
    new Promise<CardResult>((resolve) =>
      setTimeout(() => {
        const timedOut: CardResult = {
          cardId: card.card_id,
          cardName: card.name,
          hasChanges: false,
          error: `Per-card budget exceeded (${PER_CARD_BUDGET_MS / 1000}s)`,
        };
        fs.writeFileSync(
          path.join(runDir, `timeout-${card.card_id}.json`),
          JSON.stringify(timedOut, null, 2)
        );
        resolve(timedOut);
      }, PER_CARD_BUDGET_MS)
    ),
  ]);
}

function printDryRunSummary(results: CardResult[]) {
  const changes = results.filter((r) => r.hasChanges);
  if (changes.length === 0) {
    console.log("📭 No changes detected in dry-run.");
    return;
  }
  console.log("📋 Dry-run would open the following PRs:\n");
  for (const r of changes) {
    const d = r.diff!;
    const changeList = d.changes.map((c) => `  • ${c.field}: ${c.from} → ${c.to}`).join("\n");
    console.log(`[${r.risk}] ${r.cardName} (${r.cardId})`);
    console.log(changeList);
    console.log();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
