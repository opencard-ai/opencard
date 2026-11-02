/**
 * Offline settlement job: grades gold votes, runs consensus, settles credits, updates tiers.
 * Usage: V1_DATABASE_URL=... npx tsx scripts/v1-settle.ts   (prints counts only)
 */
import { getV1Db } from "../lib/v1/db";
import { settle } from "../lib/v1-settle/scoring";

settle(await getV1Db())
  .then((s) => { console.log(JSON.stringify(s)); process.exit(0); })
  .catch((e) => { console.error(`settle failed: ${e instanceof Error ? e.message : "unknown"}`); process.exit(1); });
