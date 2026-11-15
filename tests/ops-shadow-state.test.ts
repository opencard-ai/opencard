import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  OFFER_STATE_FILES, checkManifest, offerStateReport, auditStateReport, baselineFile,
  findingKey, scrubbedFindingKey, stripUrlQuery, type Finding, type ManifestFile,
} from '../scripts/ops-shadow/state-core';
import { holdKey, type HeldLike } from '../scripts/offer-watch/daily-core';
import { emptyLedger, type Candidate } from '../scripts/offer-watch/gate';
import { upsertLedger, type HistoryEvent } from '../scripts/offer-watch/state';

const stamp = '2026-11-13T12:00:00Z';
function temp(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-shadow-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir: string, rel: string, body: string) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
function entry(rel: string, body: string): ManifestFile {
  return { path: rel, size: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') };
}
function snapshot(t: TestContext) {
  const dir = temp(t), src = path.join(dir, 'src');
  const files = Object.fromEntries([
    ...OFFER_STATE_FILES.map(f => [`offer-watch/${f}`, f === 'history.jsonl' ? '' : '{}']),
    ['audit/2026-11-12-db-audit.json', '{"findings":[]}'],
    ['audit/2026-11-12-db-audit.md', 'synthetic report'],
    ['audit/2026-11-12-url-check.json', '[]'],
  ]);
  for (const [rel, body] of Object.entries(files)) write(src, rel, body);
  const manifest = Object.entries(files).map(([rel, body]) => entry(rel, body));
  const save = () => write(src, 'MANIFEST.json', JSON.stringify({ files: manifest }));
  save();
  return { dir, src, files, manifest, save };
}
// Use the requested CLI, with npm offline so a missing local dependency cannot cause network access.
const cli = (script: string, args: string[]) => {
  const result = spawnSync('npx', ['tsx', `scripts/ops-shadow/${script}.ts`, ...args], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false', NODE_NO_WARNINGS: '1' },
  });
  assert.ifError(result.error);
  return result;
};

test('checkManifest verifies synthetic bytes including an empty file', t => {
  const { src, manifest } = snapshot(t);
  assert.deepEqual(checkManifest(manifest, rel => fs.readFileSync(path.join(src, rel))), { ok: true, problems: [], verified: 6 });
});
for (const mode of ['sha', 'size', 'missing'] as const) {
  test(`checkManifest rejects ${mode} mismatch`, t => {
    const { src, manifest } = snapshot(t);
    if (mode === 'sha') manifest[0].sha256 = '0'.repeat(64);
    if (mode === 'size') manifest[0].size++;
    const r = checkManifest(manifest, rel => mode === 'missing' && rel === manifest[0].path ? null : fs.readFileSync(path.join(src, rel)));
    assert.equal(r.ok, false);
    assert.equal(r.verified, 5);
    assert.match(r.problems[0], mode === 'missing' ? /missing:/ : /sha256\/size mismatch:/);
  });
}
for (const rel of ['../x', 'audit/../x', 'other/x', 'audit/.', 'audit/..']) {
  test(`checkManifest rejects bad path ${rel} before reading`, () => {
    const r = checkManifest([entry(rel, 'x')], () => { assert.fail('must not read a bad path'); });
    assert.equal(r.ok, false);
    assert.match(r.problems[0], /bad path/);
  });
}
test('checkManifest rejects an empty list', () => {
  assert.deepEqual(checkManifest([], () => assert.fail('no reads')), { ok: false, problems: [], verified: 0 });
});

test('load-state CLI copies only listed offer state and audit reports', t => {
  const f = snapshot(t);
  write(f.src, 'offer-watch/unlisted.json', 'do not copy');
  write(f.src, 'audit/2026-11-11-db-audit.json', 'do not copy');
  write(f.src, 'audit/notes.txt', 'listed but not an audit report');
  f.manifest.push(entry('audit/notes.txt', 'listed but not an audit report')); f.save();
  const offer = path.join(f.dir, 'offer'), audit = path.join(f.dir, 'audit');
  const r = cli('load-state', ['--src', f.src, '--offer-out', offer, '--audit-out', audit, '--today', '2026-11-15']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(offer).sort(), [...OFFER_STATE_FILES].sort());
  assert.deepEqual(fs.readdirSync(audit).sort(), Object.keys(f.files).filter(p => p.startsWith('audit/')).map(p => path.basename(p)).sort());
  for (const [rel, body] of Object.entries(f.files)) {
    assert.equal(fs.readFileSync(path.join(rel.startsWith('audit/') ? audit : offer, path.basename(rel)), 'utf8'), body);
  }
  assert.match(r.stdout, /manifest verified: 7 files/);
});
test('load-state CLI copies only audit files strictly before --today', t => {
  const f = snapshot(t), today = '2026-11-15';
  for (const date of [today, '2026-11-16']) {
    for (const suffix of ['db-audit.json', 'db-audit.md', 'url-check.json']) {
      const rel = `audit/${date}-${suffix}`, body = 'synthetic seeded report';
      write(f.src, rel, body); f.manifest.push(entry(rel, body));
    }
  }
  f.save();
  const out = path.join(f.dir, 'audit');
  const r = cli('load-state', ['--src', f.src, '--audit-out', out, '--today', today]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), [
    '2026-11-12-db-audit.json', '2026-11-12-db-audit.md', '2026-11-12-url-check.json',
  ]);
  assert.equal(fs.existsSync(path.join(out, `${today}-db-audit.json`)), false);
});
test('load-state CLI exits 2 when the manifest has zero audit reports', t => {
  const f = snapshot(t);
  f.manifest.splice(0, f.manifest.length, ...f.manifest.filter(e => !e.path.startsWith('audit/')));
  f.save();
  const out = path.join(f.dir, 'audit');
  const r = cli('load-state', ['--src', f.src, '--audit-out', out, '--today', '2026-11-15']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no audit reports before today/);
  assert.equal(fs.existsSync(out), false);
});
test('load-state CLI exits 2 when no audit reports precede --today', t => {
  const f = snapshot(t), out = path.join(f.dir, 'audit');
  const r = cli('load-state', ['--src', f.src, '--audit-out', out, '--today', '2026-11-12']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no audit reports before today/);
  assert.equal(fs.existsSync(out), false);
});
for (const today of [undefined, '2026-2-01', '2026-02-30']) {
  test(`load-state CLI rejects invalid or missing --today: ${today}`, t => {
    const f = snapshot(t), out = path.join(f.dir, 'audit');
    const r = cli('load-state', ['--src', f.src, '--audit-out', out, ...(today ? ['--today', today] : [])]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /requires a valid --today/);
    assert.equal(fs.existsSync(out), false);
  });
}
for (const mode of ['sha mismatch', 'symlinked file', 'symlinked directory', 'missing offer manifest entry'] as const) {
  test(`load-state CLI exits 2 on ${mode}`, t => {
    const f = snapshot(t), rel = f.manifest[0].path;
    if (mode === 'sha mismatch') write(f.src, rel, '[]'); // Same byte length, different SHA-256.
    if (mode === 'symlinked file') {
      const target = path.join(f.dir, 'target.json'); fs.writeFileSync(target, f.files[rel]);
      fs.unlinkSync(path.join(f.src, rel)); fs.symlinkSync(target, path.join(f.src, rel));
    }
    if (mode === 'symlinked directory') {
      const target = path.join(f.dir, 'linked-offer');
      fs.renameSync(path.join(f.src, 'offer-watch'), target); fs.symlinkSync(target, path.join(f.src, 'offer-watch'));
    }
    if (mode === 'missing offer manifest entry') { f.manifest.shift(); f.save(); }
    const out = path.join(f.dir, 'out');
    const r = cli('load-state', ['--src', f.src, '--offer-out', out]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, mode === 'missing offer manifest entry' ? /offer state file not in manifest/ : /manifest check failed/);
    assert.equal(fs.existsSync(out), false, 'invalid snapshot must not be copied');
  });
}

function candidate(id: string, results: boolean[], holdOnly = false): Candidate {
  return { card_id: id, fields: {}, evidence: {
    url: 'https://example.invalid/offer', checked_at: stamp, official: true, audience: 'public', hold_only: holdOnly,
    confirmations: results.map((ok, n) => ({ url: 'https://example.invalid/offer', fetch_id: `${n}`, checked_at: stamp,
      ok, error: ok ? undefined : 'timeout: synthetic', official_domain: true, values: {} })),
  } };
}
test('offerStateReport uses seeded ledger hold keys, failure card IDs, and appended history', () => {
  const known: HeldLike = { card_id: 'known', field: 'annual_fee', value: 95, reasons: ['no_publish_mode'], fingerprint: 'explicit-fingerprint' };
  const changed: HeldLike = { card_id: 'changed', field: 'annual_fee', value: 10, reasons: ['changed_reason'] };
  const status: HeldLike = { card_id: 'status', field: null, reasons: ['verify'] };
  const fresh: HeldLike = { card_id: 'fresh', field: 'annual_fee', value: 20, reasons: ['no_publish_mode'] };
  const expiry: HeldLike = { card_id: 'expiry', field: 'welcome_offer.expiry', reasons: ['expired'] };
  const newExpiry: HeldLike = { card_id: 'new-expiry', field: 'welcome_offer.expiry', reasons: ['expired'] };
  const seed = [known, changed, status, expiry].map((h, n) => ({
    key: holdKey(h, n === 3 ? 'expiry_review' : 'held'), card_id: h.card_id, field: h.field, value: h.value,
    status: n === 2 ? 'published' : 'needs_verification', reasons: n === 1 ? ['old_reason'] : h.reasons,
  }));
  const before = upsertLedger(emptyLedger(), seed, stamp);
  const after = upsertLedger(before, [
    { ...seed[0], status: 'published' },
    { key: holdKey(fresh, 'held'), card_id: fresh.card_id, field: fresh.field, value: fresh.value, status: 'needs_verification', reasons: fresh.reasons },
  ], stamp);
  const event = (type: HistoryEvent['type']): HistoryEvent => ({ ts: stamp, card_id: 'synthetic', type });
  const r = offerStateReport({ ledgerBefore: before, ledgerAfter: after, historyBefore: 1,
    historyAfter: [event('published'), event('held'), event('held'), event('expiry_review')],
    plan: { held: [known, changed, status, fresh], expiry_review: [expiry, newExpiry] },
    candidates: [candidate('known-failure', [false, false]), candidate('new-failure', [false]),
      candidate('partial-success', [false, true]), candidate('hold-only', [false], true), candidate('no-fetches', [])],
    fetchFailuresBefore: { 'known-failure': ['different_previous_error'], recovered: ['timeout'] },
  });
  assert.deepEqual(r.holds, { total: 6, new: 4, known: 2, new_no_publish_mode: 1, new_other: 3,
    new_items: [changed, status, fresh, newExpiry].map((h, n) => ({ kind: n === 3 ? 'expiry_review' : 'held', card_id: h.card_id, field: h.field, reasons: h.reasons })) });
  assert.equal(r.would_apply_recorded_as_hold, 2);
  assert.deepEqual(r.fetch_failures, { now: 2, new: 1, known: 1, new_cards: ['new-failure'] });
  assert.deepEqual(r.ledger, { before: 4, after: 5, added: 1, status_changed: 1 });
  assert.deepEqual(r.history, { appended: 3, by_type: { held: 2, expiry_review: 1 } });
});
test('offerStateReport handles a missing plan and no new history', () => {
  const r = offerStateReport({ ledgerBefore: emptyLedger(), ledgerAfter: emptyLedger(), historyBefore: 0, historyAfter: [], plan: null, candidates: [], fetchFailuresBefore: {} });
  assert.equal(r.holds.total, 0); assert.equal(r.holds.new, 0); assert.equal(r.holds.known, 0);
  assert.deepEqual(r.history, { appended: 0, by_type: {} });
  assert.deepEqual(r.fetch_failures, { now: 0, new: 0, known: 0, new_cards: [] });
});

const finding = (id: string, severity: Finding['severity'], detail = 'synthetic'): Finding => ({ card_id: id, type: 'broken_source_url', severity, field: 'sources', detail });
const previous = [finding('url', 'high', 'Failed https://example.invalid/card.'), finding('resolved', 'medium'), finding('low', 'low')];
const current = [finding('url', 'high', 'Failed https://example.invalid/card?ref=synthetic.'), finding('new', 'medium'), finding('low', 'low')];
test('baselineFile selects latest db-audit strictly before today', () => {
  assert.equal(baselineFile(['2026-11-15-db-audit.json', '2026-11-13-db-audit.md', '2026-11-14-url-check.json',
    '2026-11-11-db-audit.json', '2026-11-14-db-audit.json', '2026-11-16-db-audit.json'], '2026-11-15'), '2026-11-14-db-audit.json');
  assert.equal(baselineFile(['2026-11-15-db-audit.json', '2026-11-16-db-audit.json'], '2026-11-15'), null);
});
test('auditStateReport distinguishes weekly and scrubbed keys, known and resolved findings', () => {
  assert.notEqual(findingKey(previous[0]), findingKey(current[0]));
  assert.equal(scrubbedFindingKey(previous[0]), scrubbedFindingKey(current[0]));
  const r = auditStateReport(previous, current, '2026-11-12-db-audit.json');
  assert.deepEqual(r, { baseline: '2026-11-12-db-audit.json', current: 3, previous: 3,
    new_high_medium: 2, new_high_medium_scrubbed: 1, known_high_medium: 1, resolved_high_medium: 1,
    by_severity: { high: { new: 0, known: 1, resolved: 0 }, medium: { new: 1, known: 0, resolved: 1 }, low: { new: 0, known: 1, resolved: 0 } },
    new_items: [{ severity: 'medium', type: 'broken_source_url', card_id: 'new', field: 'sources' }],
  });
});
test('auditStateReport with null baseline suppresses weekly notifications', () => {
  const r = auditStateReport(null, current, null);
  assert.equal(r.baseline, null); assert.equal(r.previous, 0); assert.equal(r.current, 3);
  assert.equal(r.new_high_medium, 0); assert.equal(r.new_high_medium_scrubbed, 0);
  assert.equal(r.known_high_medium, 0); assert.equal(r.resolved_high_medium, 0);
  assert.deepEqual(r.new_items, []);
  assert.deepEqual(r.by_severity, { high: { new: 1, known: 0, resolved: 0 }, medium: { new: 1, known: 0, resolved: 0 }, low: { new: 1, known: 0, resolved: 0 } });
});
test('stripUrlQuery removes queries and fragments while preserving trailing punctuation', () => {
  for (const suffix of ['.', ',', ';', ':', '!', '.,;:!']) {
    assert.equal(stripUrlQuery(`See https://example.invalid/a?token=x#part${suffix}`), `See https://example.invalid/a${suffix}`);
    assert.equal(stripUrlQuery(`See https://example.invalid/a#part${suffix}`), `See https://example.invalid/a${suffix}`);
  }
  assert.equal(stripUrlQuery('(https://example.invalid/a?x=1), "http://example.invalid/b#part"!'), '(https://example.invalid/a), "http://example.invalid/b"!');
  assert.equal(stripUrlQuery('https://example.invalid/a. plain?text#kept'), 'https://example.invalid/a. plain?text#kept');
});
test('state-compare audit CLI exits 0 and prints a comparison table', t => {
  const dir = temp(t), today = '2026-11-15';
  write(dir, '2026-11-11-db-audit.json', JSON.stringify({ findings: [] }));
  write(dir, '2026-11-14-db-audit.json', JSON.stringify({ findings: previous }));
  write(dir, `${today}-db-audit.json`, JSON.stringify({ findings: current }));
  write(dir, '2026-11-16-db-audit.json', JSON.stringify({ findings: [] }));
  const out = path.join(dir, 'comparison.json');
  const r = cli('state-compare', ['audit', '--dir', dir, '--today', today, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /baseline: 2026-11-14-db-audit.json/);
  assert.match(r.stdout, /\| severity \| new \| known \| resolved \|/);
  assert.match(r.stdout, /\| medium \| 1 \| 0 \| 1 \|/);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), auditStateReport(previous, current, '2026-11-14-db-audit.json'));
});

for (const candidatesPresent of [false, true]) {
  test(`state-compare offer CLI reports missing plan and appended history (candidates present: ${candidatesPresent})`, t => {
    const dir = temp(t), before = path.join(dir, 'before'), after = path.join(dir, 'after');
    const event = (type: HistoryEvent['type']): HistoryEvent => ({ ts: stamp, card_id: 'synthetic', type });
    for (const state of [before, after]) {
      write(state, 'ledger.json', JSON.stringify(emptyLedger()));
      write(state, 'daily-state.json', JSON.stringify({ fetch_failures: {} }));
    }
    write(before, 'history.jsonl', `${JSON.stringify(event('published'))}\n`);
    write(after, 'history.jsonl', [event('published'), event('held'), event('expiry_review')].map(e => JSON.stringify(e)).join('\n') + '\n');
    const candidates = path.join(dir, 'candidates.json');
    if (candidatesPresent) write(dir, 'candidates.json', '[]');
    const out = path.join(dir, 'comparison.json');
    const r = cli('state-compare', ['offer', '--before', before, '--after', after,
      '--plan', path.join(dir, 'missing-plan.json'), '--candidates', candidates, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(report.plan_present, false);
    assert.equal(report.candidates_present, candidatesPresent);
    assert.deepEqual(report.history, { appended: 2, by_type: { held: 1, expiry_review: 1 } });
    assert.match(r.stdout, /no apply plan/);
    if (candidatesPresent) assert.doesNotMatch(r.stdout, /no candidates/);
    else assert.match(r.stdout, /\(no candidates — run failed before collect\)/);
  });
}
