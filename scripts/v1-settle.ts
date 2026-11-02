/**
 * Offline settlement job: grades gold votes, runs consensus, settles credits, updates tiers.
 * Usage: V1_DATABASE_URL=... npx tsx scripts/v1-settle.ts   (prints counts only)
 */
import { getV1Db } from "../lib/v1/db";
import { logFailure, useAdminDatabaseUrl } from "../lib/v1-settle/admin";
import { settle } from "../lib/v1-settle/scoring";

async function main() {
  useAdminDatabaseUrl();
  const s = await settle(await getV1Db());
  console.log(JSON.stringify(s));
  process.exit(0);
}
main().catch((e) => { logFailure("settle", e); process.exit(1); });
