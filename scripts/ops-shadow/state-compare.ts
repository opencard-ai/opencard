/** New-vs-known report for the shadow-with-state workflow (read-only; exit 0 on differences, 2 on bad input).
 *   npx tsx scripts/ops-shadow/state-compare.ts offer --before DIR --after DIR --plan apply-D.nopublish.json --candidates candidates-D.json [--out f.json]
 *   npx tsx scripts/ops-shadow/state-compare.ts audit --dir AUDIT_DIR --today D [--out f.json]
 * before = pristine copy of the ops-state snapshot; after = the --state-dir the run wrote to (runner temp only). */
import fs from 'node:fs';
import path from 'node:path';
import { readHistory } from '../offer-watch/state';
import { auditStateReport, baselineFile, offerStateReport, renderAudit, renderOffer } from './state-core';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const need = (n: string) => { const v = arg(n); if (!v) { console.error(`missing ${n}`); process.exit(2); } return v; };
const json = (f: string) => { if (!fs.existsSync(f)) { console.error(`missing input: ${f}`); process.exit(2); } return JSON.parse(fs.readFileSync(f, 'utf8')); };
const mode = process.argv[2];
let report: unknown, md: string;
if (mode === 'offer') {
  const before = need('--before'), after = need('--after');
  const plan = arg('--plan') && fs.existsSync(arg('--plan')!) ? json(arg('--plan')!) : null;
  const candidates = arg('--candidates');
  const candidatesPresent = !!candidates && fs.existsSync(candidates);
  const r = offerStateReport({
    ledgerBefore: json(path.join(before, 'ledger.json')), ledgerAfter: json(path.join(after, 'ledger.json')),
    historyBefore: readHistory(path.join(before, 'history.jsonl')).length, historyAfter: readHistory(path.join(after, 'history.jsonl')),
    plan, candidates: candidatesPresent ? json(candidates!) : [],
    fetchFailuresBefore: json(path.join(before, 'daily-state.json')).fetch_failures || {},
  });
  report = { ...r, plan_present: !!plan, candidates_present: candidatesPresent };
  md = (plan ? '' : '**no apply plan (run failed before apply)**\n\n')
    + (candidatesPresent ? '' : '(no candidates — run failed before collect)\n\n') + renderOffer(r);
} else if (mode === 'audit') {
  const dir = need('--dir'), today = need('--today');
  const cur = path.join(dir, `${today}-db-audit.json`);
  const base = baselineFile(fs.readdirSync(dir), today);
  const r = auditStateReport(base ? json(path.join(dir, base)).findings || [] : null, json(cur).findings || [], base);
  report = r; md = renderAudit(r);
} else { console.error('usage: state-compare.ts offer|audit ...'); process.exit(2); }
if (arg('--out')) fs.writeFileSync(arg('--out')!, `${JSON.stringify(report, null, 2)}\n`);
console.log(md);
