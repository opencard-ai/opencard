import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { assessCandidate, expiryReport } from '../scripts/offer-watch/gate';
import { buildCandidate } from '../scripts/offer-watch/collect';
import { newHolds } from '../scripts/offer-watch/daily-core';
import { loadLedger } from '../scripts/offer-watch/state';

const repo = process.cwd();
const tsxCli = createRequire(path.join(repo, 'package.json')).resolve('tsx/cli');
const runTs = (cwd: string, script: string, args: string[]) => spawnSync(process.execPath, [tsxCli, path.join(repo, script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });

const MS = 'https://www.morganstanley.com/what-we-do/wealth-management/cashplus';
const AMEX = 'https://apply.americanexpress.com/amex-morgan-stanley-credit-cards/?page_url=38';
const card = { card_id: 'amex-morgan-stanley-platinum', name: 'Amex Morgan Stanley Platinum', annual_fee: 895, welcome_offer: { bonus_points: 150000, spending_requirement: 12000, time_period_months: 6, description: 'old', point_program: 'Amex Membership Rewards', estimated_value: 2550, is_elevated: true, elevated_until: '2026-07-08' }, sources: [] };

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-no-publish-'));
  fs.mkdirSync(path.join(dir, 'data/cards'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts/offer-watch'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'scripts/offer-watch/official-domains.json'), path.join(dir, 'scripts/offer-watch/official-domains.json'));
  fs.writeFileSync(path.join(dir, `data/cards/${card.card_id}.json`), `${JSON.stringify(card, null, 2)}\n`);
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q'); git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  const now = Date.now(), checked = new Date(now - 60000).toISOString();
  const conf = (url: string, n: number, values: Record<string, unknown>) => ({ url, fetch_id: `${url}#${n}`, checked_at: checked, ok: true, official_domain: true, values });
  const full = { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000, 'welcome_offer.time_period_months': 6, annual_fee: 895 };
  const cand = buildCandidate({ card_id: card.card_id, sources: [] }, [conf(MS, 1, { 'welcome_offer.bonus_points': 80000 }), conf(MS, 2, { 'welcome_offer.bonus_points': 80000 }), conf(AMEX, 1, full), conf(AMEX, 2, full)], checked);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(now));
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify({ results: [assessCandidate(cand, card, false, now)], expiry: expiryReport([card], today) }));
  const state = path.join(dir, 'state'); fs.mkdirSync(state);
  return { dir, today, state, ledger: path.join(state, 'ledger.json'), history: path.join(state, 'history.jsonl') };
}

test('apply --record-holds never edits cards and records would-apply changes as no_publish_mode holds', () => {
  const f = fixtureRepo();
  const cardFile = path.join(f.dir, `data/cards/${card.card_id}.json`);
  const before = fs.readFileSync(cardFile, 'utf8');
  // Sanity: the same report WOULD be applied in dry-run.
  const dry = runTs(f.dir, 'scripts/offer-watch/apply.ts', ['--report', 'review.json', '--today', f.today, '--out', 'dry.json']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'dry.json'), 'utf8')).applied.length, 1);

  const r = runTs(f.dir, 'scripts/offer-watch/apply.ts', ['--report', 'review.json', '--today', f.today, '--record-holds', '--out', 'plan.json', '--ledger', f.ledger, '--history', f.history]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(cardFile, 'utf8'), before);
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', 'data/cards'], { cwd: f.dir, encoding: 'utf8' }), '');
  const plan = JSON.parse(fs.readFileSync(path.join(f.dir, 'plan.json'), 'utf8'));
  assert.equal(plan.mode, 'record-holds');
  assert.equal(plan.applied.length, 0);
  assert.equal(plan.validation, 'not_run');
  assert.equal(plan.would_apply.length, 1);
  assert.ok(plan.held.some((h: any) => h.field === 'welcome_offer.bonus_points' && h.value === 80000 && h.reasons[0] === 'no_publish_mode'));
  const ledger = loadLedger(f.ledger);
  const entries = Object.values(ledger.entries) as any[];
  assert.ok(entries.length > 0 && entries.every(e => e.status === 'needs_verification'));
  const hist = fs.readFileSync(f.history, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.ok(hist.some(e => e.type === 'held' && e.reasons?.includes('no_publish_mode')));
  assert.ok(!hist.some(e => ['applied', 'published'].includes(e.type)));
  // Dedupe: the same holds against the updated ledger are not "new" again.
  assert.deepEqual(newHolds(plan, ledger).filter(h => h.kind === 'held'), []);
  assert.ok(!fs.existsSync(path.join(f.dir, 'artifacts/offer-watch/ledger.json')), 'default ledger path untouched');
});

test('apply rejects --apply with --record-holds, and --record-holds without --out', () => {
  const f = fixtureRepo();
  assert.notEqual(runTs(f.dir, 'scripts/offer-watch/apply.ts', ['--report', 'review.json', '--apply', '--record-holds', '--out', 'x.json']).status, 0);
  assert.notEqual(runTs(f.dir, 'scripts/offer-watch/apply.ts', ['--report', 'review.json', '--record-holds']).status, 0);
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', 'data/cards'], { cwd: f.dir, encoding: 'utf8' }), '');
});

test('daily refuses unsafe flag combinations before doing anything', () => {
  const f = fixtureRepo();
  const cases = [['--dry-run', '--no-publish', '--state-dir', f.state], ['--state-dir', f.state], ['--no-publish', '--state-dir', path.join(f.dir, 'missing')], ['--no-publish', '--state-dir'],
    ['--no-publish'], ['--no-publish', '--state-dir', 'artifacts/offer-watch'], ['--no-publish', '--state-dir', path.join(f.dir, 'artifacts/offer-watch/')]];
  for (const args of cases) {
    const r = runTs(f.dir, 'scripts/offer-watch/daily.ts', [...args, '--skip-pull']);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
  }
  assert.ok(!fs.existsSync(path.join(f.dir, 'artifacts')), 'no artifacts/lock created');
});

test('daily never reaches publish in --no-publish mode (static guard)', () => {
  const src = fs.readFileSync(path.join(repo, 'scripts/offer-watch/daily.ts'), 'utf8');
  const publishLine = src.split('\n').find(l => l.includes("'scripts/offer-watch/publish.ts'"))!;
  assert.match(publishLine, /!dryRun && !noPublish/);
  assert.match(src, /noPublish \? \['--record-holds'\]/);
  // Content-hash guard taken right before apply and checked right after.
  const i = src.indexOf('const cardsBefore'), j = src.indexOf("run('apply'"), k = src.indexOf('cardsHash() !== cardsBefore');
  assert.ok(i > 0 && i < j && j < k, 'hash snapshot before apply, comparison after');
});

test('daily --no-publish without --state-dir is refused, also under GitHub Actions', () => {
  const f = fixtureRepo();
  const r = spawnSync(process.execPath, [tsxCli, path.join(repo, 'scripts/offer-watch/daily.ts'), '--no-publish', '--skip-pull'], { cwd: f.dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', NODE_NO_WARNINGS: '1' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /requires --state-dir.*\[GitHub Actions\]/);
});

test('a no_publish_mode hold is applied once publish mode (--apply) runs with the same ledger', () => {
  const f = fixtureRepo();
  // apply --apply runs scripts/validate-all.ts via npx tsx in the cwd: give the fixture a passing stub + local tsx.
  fs.writeFileSync(path.join(f.dir, 'scripts/validate-all.ts'), 'process.exit(0);\n');
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(f.dir, 'node_modules'));
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-am', 'noop', '--allow-empty'], { cwd: f.dir });
  const common = ['--report', 'review.json', '--today', f.today, '--ledger', f.ledger, '--history', f.history];
  assert.equal(runTs(f.dir, 'scripts/offer-watch/apply.ts', [...common, '--record-holds', '--out', 'hold.json']).status, 0);
  const key = JSON.parse(fs.readFileSync(path.join(f.dir, 'hold.json'), 'utf8')).held.find((h: any) => h.reasons[0] === 'no_publish_mode').fingerprint;
  assert.equal(loadLedger(f.ledger).entries[key].status, 'needs_verification');
  // Switch to publish mode: the ledger does not gate apply, so the held change is applied now.
  const r = runTs(f.dir, 'scripts/offer-watch/apply.ts', [...common, '--apply', '--out', 'apply.json']);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(fs.readFileSync(path.join(f.dir, 'apply.json'), 'utf8'));
  assert.equal(plan.mode, 'apply'); assert.equal(plan.validation, 'passed');
  assert.ok(plan.applied[0].changes.some((c: any) => c.fingerprint === key));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, `data/cards/${card.card_id}.json`), 'utf8')).welcome_offer.bonus_points, 80000);
  assert.equal(loadLedger(f.ledger).entries[key].status, 'applied_pending_publish');
  assert.ok(fs.readFileSync(f.history, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).some(e => e.type === 'applied'));
});

test('daily refuses symlink aliases of the default ledger dir and symlinked state files', () => {
  const f = fixtureRepo();
  fs.mkdirSync(path.join(f.dir, 'artifacts/offer-watch'), { recursive: true });
  fs.symlinkSync(path.join(f.dir, 'artifacts/offer-watch'), path.join(f.dir, 'alias'));
  const a = runTs(f.dir, 'scripts/offer-watch/daily.ts', ['--no-publish', '--state-dir', 'alias', '--skip-pull']);
  assert.equal(a.status, 2, a.stderr);
  fs.writeFileSync(path.join(f.dir, 'artifacts/offer-watch/ledger.json'), '{}');
  fs.symlinkSync(path.join(f.dir, 'artifacts/offer-watch/ledger.json'), path.join(f.state, 'ledger.json'));
  const b = runTs(f.dir, 'scripts/offer-watch/daily.ts', ['--no-publish', '--state-dir', f.state, '--skip-pull']);
  assert.equal(b.status, 2, b.stderr);
  assert.match(b.stderr, /must not be a symlink/);
  assert.equal(fs.readFileSync(path.join(f.dir, 'artifacts/offer-watch/ledger.json'), 'utf8'), '{}');
});
