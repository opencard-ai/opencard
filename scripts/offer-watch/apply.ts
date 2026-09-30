/** Apply guarded changes from a review report (review.ts output) to data/cards. Dry run unless --apply.
 *   npx tsx scripts/offer-watch/apply.ts --report <review.json> [--apply] [--out <plan.json>] [--ledger file] [--today YYYY-MM-DD]
 * Guards: official allowlisted domain; >=2 independent official fetches agreeing in this run; sanity (3x bonus jump,
 * fee range, spend > 0, valid future dates); schema check + full validator. Expired elevated offers are reverted only
 * when an official page was fetched and no longer shows the old bonus; otherwise they are marked for review.
 * Everything not applied is recorded in the ledger as needs_verification (never published).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { DEFAULT_OFFICIAL_DOMAINS, changeFingerprint } from './gate';
import { applyPlanToCard, planApply, schemaCheck } from './apply-core';
import { DEFAULT_HISTORY, DEFAULT_LEDGER, appendHistory, laToday, loadLedger, saveLedger, upsertLedger, type HistoryEvent, type LedgerUpdate } from './state';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const reportFile = arg('--report');
if (!reportFile) throw new Error('--report <review.json> is required');
const doApply = process.argv.includes('--apply');
const today = arg('--today') || laToday();
const ledgerFile = arg('--ledger') || DEFAULT_LEDGER;
const historyFile = arg('--history') || DEFAULT_HISTORY;
const domainsFile = 'scripts/offer-watch/official-domains.json';
const officialDomains: string[] = fs.existsSync(domainsFile) ? JSON.parse(fs.readFileSync(domainsFile, 'utf8')).domains : DEFAULT_OFFICIAL_DOMAINS;
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const runAt = Date.now();

const cardFile = (id: string) => path.join('data', 'cards', `${id}.json`);
const cards = new Map<string, any>();
for (const file of fs.readdirSync('data/cards').filter(f => f.endsWith('.json'))) {
  const card = JSON.parse(fs.readFileSync(path.join('data/cards', file), 'utf8'));
  if (card.card_id) cards.set(card.card_id, card);
}
const dirty = new Set(execFileSync('git', ['status', '--porcelain', '--', 'data/cards'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .map(line => line.slice(3).trim()).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json')));

const plan = planApply(report, cards, { today, runAt, officialDomains }, dirty);
const outputs = plan.applied.map(p => {
  const before = cards.get(p.card_id);
  const file = cardFile(p.card_id);
  if (!before || !fs.existsSync(file)) return { plan: p, file, error: 'card_file_missing' };
  const after = applyPlanToCard(before, p, today);
  const schemaErrors = schemaCheck(after);
  return { plan: p, file, before, after, error: schemaErrors.length ? `schema:${schemaErrors.join(',')}` : null };
});
const failed = outputs.filter(o => o.error);
const ok = outputs.filter(o => !o.error);
failed.forEach(o => plan.held.push(...o.plan.changes.map(c => ({ card_id: o.plan.card_id, field: c.field, value: c.new_value, reasons: [o.error!], fingerprint: c.fingerprint }))));

let validation = 'not_run';
if (doApply && ok.length) {
  const original = new Map(ok.map(o => [o.file, fs.readFileSync(o.file, 'utf8')]));
  for (const o of ok) fs.writeFileSync(o.file, `${JSON.stringify(o.after, null, 2)}\n`);
  const res = spawnSync('npx', ['tsx', 'scripts/validate-all.ts'], { encoding: 'utf8' });
  validation = res.status === 0 ? 'passed' : 'failed';
  if (res.status !== 0) {
    for (const [file, text] of original) fs.writeFileSync(file, text);
    ok.forEach(o => plan.held.push(...o.plan.changes.map(c => ({ card_id: o.plan.card_id, field: c.field, value: c.new_value, reasons: ['schema_validation_failed'], fingerprint: c.fingerprint }))));
    ok.length = 0;
    console.error(res.stdout.slice(-2000));
  }
}

const nowIso = new Date(runAt).toISOString();
const result = {
  kind: 'offer-watch-apply', mode: doApply ? 'apply' : 'dry-run', generated_at: nowIso, today, report: reportFile, validation,
  applied: ok.map(o => ({ card_id: o.plan.card_id, file: o.file, kinds: o.plan.kinds, changes: o.plan.changes, sources: o.plan.sources, notes: o.plan.notes })),
  held: plan.held, expiry_review: plan.expiry_review,
  preview: doApply ? undefined : ok.map(o => ({ card_id: o.plan.card_id, welcome_offer_after: o.after?.welcome_offer, annual_fee_after: o.after?.annual_fee })),
};
const json = JSON.stringify(result, null, 2);
console.log(json);
if (!doApply && arg('--out')) { fs.mkdirSync(path.dirname(arg('--out')!), { recursive: true }); fs.writeFileSync(arg('--out')!, `${json}\n`); console.error(`dry-run plan saved: ${arg('--out')}`); }
if (doApply) {
  const out = arg('--out') || `artifacts/offer-watch/apply-${nowIso.replace(/[:.]/g, '-')}.json`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${json}\n`);
  console.error(`apply plan saved: ${out}`);
  const updates: LedgerUpdate[] = [
    ...result.applied.flatMap(a => a.changes.map(c => ({ key: c.fingerprint, card_id: a.card_id, field: c.field, value: c.new_value, status: 'applied_pending_publish' }))),
    ...plan.held.map(h => ({ key: h.fingerprint ?? changeFingerprint(h.card_id, h.field ?? 'card', h.value ?? null, 'public'), card_id: h.card_id, field: h.field, value: h.value ?? null, status: 'needs_verification', reasons: h.reasons })),
    ...plan.expiry_review.map(h => ({ key: changeFingerprint(h.card_id, `expiry_review:${h.field}`, h.reasons.join(','), 'public'), card_id: h.card_id, field: h.field, value: null, status: 'needs_verification', reasons: h.reasons })),
  ];
  saveLedger(upsertLedger(loadLedger(ledgerFile), updates, nowIso), ledgerFile);
  const events: HistoryEvent[] = [
    ...result.applied.map(a => ({ ts: nowIso, type: 'applied' as const, card_id: a.card_id, changes: a.changes.map(({ field, old_value, new_value }) => ({ field, old_value, new_value })), sources: a.sources })),
    ...plan.held.map(h => ({ ts: nowIso, type: 'held' as const, card_id: h.card_id, changes: h.field ? [{ field: h.field, old_value: null, new_value: h.value ?? null }] : undefined, reasons: h.reasons })),
    ...plan.expiry_review.map(h => ({ ts: nowIso, type: 'expiry_review' as const, card_id: h.card_id, reasons: h.reasons })),
    ...(validation === 'failed' ? [{ ts: nowIso, type: 'schema_failed' as const, card_id: null, note: 'validate-all failed; card files restored' }] : []),
  ];
  appendHistory(events, historyFile);
}
if (validation === 'failed') process.exit(1);
