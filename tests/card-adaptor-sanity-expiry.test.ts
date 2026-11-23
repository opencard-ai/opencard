import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const cli = fileURLToPath(new URL('../scripts/card-adaptor/index.ts', import.meta.url));
const loader = createRequire(import.meta.url).resolve('tsx');
const offer = { bonus_points: 60000, spending_requirement: 4000, time_period_months: 3,
  description: 'Earn rewards with this card.', is_elevated: true, estimated_value: 900 };

// Exercise the public CLI against a miniature filesystem. Config, card, run artifacts,
// and the frozen-clock preload all live in a fresh temporary directory per test.
function fixture(t: TestContext, candidate: Record<string, unknown> = { welcome_offer: offer }) {
  const root = mkdtempSync(path.join(tmpdir(), 'card-adaptor-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = path.join(root, 'run');
  const configDir = path.join(root, 'scripts/card-adaptor/cards');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(path.join(run, 'sources'), { recursive: true });
  const put = (relative: string, value: unknown) => writeFileSync(path.join(root, relative), JSON.stringify(value));
  const get = (relative: string) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
  const original = JSON.stringify({ card_id: 'fixture', annual_fee: 95, welcome_offer: offer, untouched: 'keep' });
  writeFileSync(path.join(root, 'card.json'), original);
  put('scripts/card-adaptor/cards/fixture.json', {
    cardId: 'fixture', cardPath: path.join(root, 'card.json'), mode: 'offer', candidate,
    citations: { welcome_offer: ['issuer'], annual_fee: ['issuer'] },
    sources: [{ id: 'issuer', type: 'issuer', url: 'https://example.invalid', required: true }],
  });
  put('run/run.json', { card_id: 'fixture', run_id: 'fixture-run', mode: 'offer', artifacts: [] });
  put('run/manifest.json', { sources: [{ source_type: 'issuer' }], errors: [] });
  const preload = path.join(root, 'preload.mjs');
  writeFileSync(preload, `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(value) { super(arguments.length ? value : '2026-11-13T00:30:00Z'); }
      static now() { return RealDate.parse('2026-11-13T00:30:00Z'); }
    };
    globalThis.fetch = () => { throw new Error('Network forbidden in test'); };
    childProcess.execFileSync = () => { throw new Error('External commands forbidden in test'); };
    syncBuiltinESMExports();
  `);
  const command = (name: string, extra: string[] = [], timezone = 'UTC', expectedStatus = 0) => {
    // File descriptors also work in environments that restrict synchronous pipes.
    const stdoutFile = path.join(root, 'stdout.txt');
    const stderrFile = path.join(root, 'stderr.txt');
    const stdoutFd = openSync(stdoutFile, 'w');
    const stderrFd = openSync(stderrFile, 'w');
    let result;
    try {
      result = spawnSync(process.execPath, ['--import', loader, '--import', preload, cli, name, '--run', run, ...extra], {
        cwd: root,
        // Do not forward API keys, NODE_OPTIONS, or other ambient credentials.
        env: { PATH: process.env.PATH, TZ: timezone, TSX_DISABLE_CACHE: '1' },
        stdio: ['ignore', stdoutFd, stderrFd], timeout: 20000,
      });
    } finally {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    }
    assert.ifError(result.error);
    const stdout = readFileSync(stdoutFile, 'utf8');
    const stderr = readFileSync(stderrFile, 'utf8');
    assert.equal(result.status, expectedStatus, `${name}: ${stderr}\n${stdout}`);
    return { stdout, stderr };
  };
  return { root, run, put, get, command, original,
    assertPreserved: () => assert.equal(readFileSync(path.join(root, 'card.json'), 'utf8'), original) };
}

for (const field of ['expires', 'elevated_until']) {
  test(`expired ${field} is downgraded, blocked by QA, and cannot overwrite the original card`, (t) => {
    const f = fixture(t, { welcome_offer: { ...offer, [field]: '2026-11-12', notes: ['Existing note'] } });
    f.command('normalize');
    const normalized = f.get('run/candidate.json');
    assert.deepEqual(normalized.guardrails.expired_welcome_offer_fields, [field]);
    assert.equal(normalized.candidate.welcome_offer.is_elevated, false);
    assert.equal(normalized.candidate.welcome_offer.estimated_value, null);
    assert.equal(normalized.candidate.welcome_offer.confidence, 'low');
    assert.equal(normalized.candidate.welcome_offer.offer_status, 'expired_review_required');
    assert.equal(normalized.candidate.welcome_offer.notes[0], 'Existing note');
    f.command('normalize');
    assert.deepEqual(f.get('run/candidate.json'), normalized, 'normalization is repeatable');
    f.command('qa');
    assert.equal(f.get('run/qa-report.json').verdict, 'blocked');
    assert.match(f.get('run/qa-report.json').blocking_issues.join(';'), new RegExp(`expired date field\\(s\\): ${field}`));
    f.command('apply-plan');
    assert.equal(f.get('run/apply-plan.json').can_apply, false);
    assert.equal(f.get('run/apply-plan.json').recommendation, 'blocked');
    const failure = f.command('apply', ['--write'], 'UTC', 1);
    assert.match(failure.stderr, /Refusing to apply/);
    f.assertPreserved();
    assert.equal(f.get('run/run.json').status, undefined);
  });
}

for (const date of ['2026-11-13', '2026-11-14', '2028-02-29']) {
  test(`expiry ${date} remains current at the frozen UTC boundary in a western timezone`, (t) => {
    const f = fixture(t, { welcome_offer: { ...offer, expires: date, elevated_until: date } });
    f.command('normalize', [], 'America/Los_Angeles');
    const candidate = f.get('run/candidate.json');
    assert.deepEqual(candidate.guardrails.expired_welcome_offer_fields, []);
    assert.equal(candidate.candidate.welcome_offer.is_elevated, true);
    f.command('qa', [], 'America/Los_Angeles');
    assert.equal(f.get('run/qa-report.json').verdict, 'pass');
    f.assertPreserved();
  });
}

for (const [date, warning] of [
  ['11/12/2026', 'expired on'], ['11/13/2026', '0 day(s)'], ['11/20/2026', '7-day warning'],
  ['11/21/2026', '14-day warning'], ['11/27/2026', '14-day warning'], ['11/28/2026', null],
] as const) {
  test(`description expiry warning boundary: ${date}`, (t) => {
    const f = fixture(t, { welcome_offer: { ...offer, description: `Offer ends ${date}.` } });
    f.command('normalize');
    f.command('qa');
    const qa = f.get('run/qa-report.json');
    assert.equal(qa.verdict, warning ? 'needs_review' : 'pass');
    if (warning) assert.ok(qa.warnings.some((value: string) => value.includes(warning)));
    else assert.deepEqual(qa.warnings, []);
    // Description-only past expiry is currently a warning, unlike structured expiry.
    assert.deepEqual(qa.blocking_issues, []);
    f.assertPreserved();
  });
}

test('QA rejects missing candidate, citations, issuer source, and required snapshots before apply', (t) => {
  const f = fixture(t, {});
  f.command('normalize');
  f.put('run/manifest.json', { sources: [], errors: [{ required: true }] });
  f.command('qa');
  assert.deepEqual(f.get('run/qa-report.json').blocking_issues, [
    'issuer source missing', 'welcome_offer candidate missing', 'required source missing or empty',
  ]);
  f.put('run/candidate.json', { candidate: { welcome_offer: offer }, citations: {} });
  f.command('qa');
  assert.ok(f.get('run/qa-report.json').blocking_issues.includes('welcome_offer citation missing'));
  f.command('apply-plan');
  f.command('apply', ['--write'], 'UTC', 1);
  f.assertPreserved();
});

test('structured expiry uses UTC while description warnings currently use the local calendar day', (t) => {
  const f = fixture(t, { welcome_offer: { ...offer, expires: '2026-11-12', description: 'Offer ends 11/12/2026.' } });
  f.command('normalize', [], 'America/Los_Angeles');
  f.command('qa', [], 'America/Los_Angeles');
  const qa = f.get('run/qa-report.json');
  assert.equal(qa.verdict, 'blocked');
  assert.match(qa.blocking_issues.join(';'), /expired date field/);
  assert.ok(qa.warnings.some((warning: string) => warning.includes('expires in 0 day(s)')));
  f.assertPreserved();
});

test('missing, null, and non-date expiry values currently provide no expiry signal', (t) => {
  const f = fixture(t, { welcome_offer: { ...offer, expires: null, elevated_until: 'not-a-date' } });
  f.command('normalize');
  assert.deepEqual(f.get('run/candidate.json').guardrails.expired_welcome_offer_fields, []);
  f.command('qa');
  assert.equal(f.get('run/qa-report.json').verdict, 'pass');
  f.put('run/candidate.json', { candidate: { welcome_offer: offer }, citations: { welcome_offer: ['issuer'] } });
  f.command('qa');
  assert.equal(f.get('run/qa-report.json').verdict, 'pass');
  f.assertPreserved();
});

test('missing QA blocks a stable-field patch and leaves the card intact', (t) => {
  const f = fixture(t, { annual_fee: 100 });
  f.command('normalize');
  f.command('apply-plan');
  const plan = f.get('run/apply-plan.json');
  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.safety_issues, ['qa-report.json missing; run qa first']);
  assert.deepEqual(plan.changed_fields, ['annual_fee']);
  f.command('apply', ['--write'], 'UTC', 1);
  f.assertPreserved();
});

test('manual welcome-offer changes require matching run approval and recheck approval before writing', (t) => {
  const f = fixture(t, { welcome_offer: { ...offer, bonus_points: 80000 } });
  f.command('normalize');
  f.command('qa');
  f.command('apply-plan');
  assert.equal(f.get('run/apply-plan.json').can_apply, false);
  assert.deepEqual(f.get('run/apply-plan.json').unresolved_manual_fields, ['welcome_offer']);
  f.put('run/approval.json', { status: 'approved', reviewer: 'Fixture Reviewer', run_id: 'different-run', approved_fields: ['welcome_offer'] });
  f.command('apply-plan');
  assert.equal(f.get('run/apply-plan.json').can_apply, false);
  assert.match(f.get('run/apply-plan.json').approval.issues.join(';'), /run_id mismatch/);
  f.put('run/approval.json', { status: 'approved', reviewer: 'Fixture Reviewer', run_id: 'fixture-run', approved_fields: ['welcome_offer'] });
  f.command('apply-plan');
  assert.equal(f.get('run/apply-plan.json').can_apply, true);
  f.command('apply');
  f.assertPreserved();
  // Revoke approval after creating an otherwise applicable plan.
  f.put('run/approval.json', { status: 'rejected', run_id: 'fixture-run', approved_fields: [] });
  const refused = f.command('apply', ['--write'], 'UTC', 1);
  assert.match(refused.stderr, /invalid approval.json/);
  f.assertPreserved();
});

test('live issuer drift flags stale candidate even when production diff is empty', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.run, 'sources/issuer-issuer.md'), 'Earn 80000 bonus points after you spend $5000 in the first 6 months.');
  f.command('normalize');
  f.command('qa');
  const qa = f.get('run/qa-report.json');
  assert.equal(qa.verdict, 'needs_review');
  assert.equal(qa.live_source_check.drifted, true);
  assert.deepEqual(qa.live_source_check.drift_fields, [
    'welcome_offer.bonus_points', 'welcome_offer.spending_requirement', 'welcome_offer.time_period_months',
  ]);
  f.command('apply-plan');
  const plan = f.get('run/apply-plan.json');
  assert.equal(plan.recommendation, 'source_drift_detected');
  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.changed_fields, []);
  f.assertPreserved();
});

test('diff ignores nested verification dates and fields outside the production patch policy', (t) => {
  const f = fixture(t, { welcome_offer: { ...offer, last_verified: 'AUTO_DATE' },
    name: 'Must not patch', annual_fee: 95 });
  f.command('normalize');
  f.command('qa');
  f.command('apply-plan');
  assert.deepEqual(f.get('run/apply-plan.json').changed_fields, []);
  assert.equal(f.get('run/apply-plan.json').can_apply, false);
  assert.deepEqual(f.get('run/proposed-patch.json').patch, {});
  f.assertPreserved();
});
