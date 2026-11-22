/**
 * Load the gold set and sources whitelist into the v1 DB. Data files live OUTSIDE the repo.
 * Usage: npx tsx scripts/v1-load-gold.ts <gold.json> <whitelist.json>
 * - Whitelist: upsert all entries (dispatchable flag preserved).
 * - Gold: one task per item with a opaque newId("t") task_id; gold_id/answer/provenance only in task_gold_answers.
 *   Idempotent by gold_id; changed/closed/expired tasks are retired with historical answers preserved. Items whose source_url is not on a dispatchable source are skipped.
 * Prints counts only; never prints answers, ids or notes.
 */
import { readFileSync } from "node:fs";
import { getV1Db } from "../lib/v1/db";
import { logFailure, configureAdminDatabaseUrl } from "../lib/v1-settle/admin";
import { loadGold } from "../lib/v1-settle/gold-loader";

async function main() {
  configureAdminDatabaseUrl();
  const [goldPath, wlPath] = process.argv.slice(2);
  if (!goldPath || !wlPath) throw new Error("usage: v1-load-gold.ts <gold.json> <whitelist.json>");
  const gold = JSON.parse(readFileSync(goldPath, "utf8"));
  const wl = JSON.parse(readFileSync(wlPath, "utf8"));
  const out = await loadGold(await getV1Db(), gold, wl);
  console.log(JSON.stringify(out));
  process.exit(0);
}
main().catch((e) => { logFailure("load", e); process.exit(1); });
