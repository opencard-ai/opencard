/** Weekly Traditional Chinese digest (<1800 chars) -> artifacts/offer-watch/digest-<date>.md
 *   npx tsx scripts/offer-watch/digest.ts [--today YYYY-MM-DD] [--out file]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildDigest } from './digest-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, laToday, loadLedger, readHistory } from './state';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const today = arg('--today') || laToday();
const text = buildDigest(readHistory(arg('--history') || DEFAULT_HISTORY), loadLedger(arg('--ledger') || DEFAULT_LEDGER), today);
const out = arg('--out') || `artifacts/offer-watch/digest-${today}.md`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${text}\n`);
console.log(text);
console.error(`digest saved: ${out} (${text.length} chars)`);
