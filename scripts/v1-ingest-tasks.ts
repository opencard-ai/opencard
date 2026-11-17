/** Import an array of field-level TaskSignal objects prepared from existing pipeline findings.
 * Usage: npx tsx scripts/v1-ingest-tasks.ts /private/path/signals.json
 * Reads admin credentials from the local private file only. Logs counts, never input values.
 */
import { readFileSync } from "node:fs";
import { getV1Db } from "../lib/v1/db";
import { ingestTask, type TaskSignal } from "../lib/v1-settle/task-ingest";
import { logFailure, configureAdminDatabaseUrl } from "../lib/v1-settle/admin";
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("signal file required");
  const signals: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(signals)) throw new Error("expected array");
  configureAdminDatabaseUrl();
  const db = await getV1Db();
  let created = 0;
  await db.transaction(async (tx) => {
    for (const signal of signals) if (await ingestTask(tx, signal as TaskSignal)) created++;
  });
  console.log(JSON.stringify({ created, skipped: signals.length - created }));
  process.exit(0);
}
main().catch((e) => { logFailure("ingest", e); process.exit(1); });
