import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPaidToFreeNoEvidence, checkPointsCollapse, checkSourcePageDiscontinued,
  detectElevatedSignals, detectFreeNightSignals, extractCardData } from '../scripts/auto-update-cards/extract';
import type { Card } from '../scripts/auto-update-cards/cards-loader';

test('paid-to-free guard blocks absent evidence and permits documented fee removal', () => {
  assert.equal(checkPaidToFreeNoEvidence(95, 0, '', 'annual fee applies').blocked, true);
  for (const evidence of ['$0 annual fee', 'No Annual Fee', 'discontinued']) {
    assert.equal(checkPaidToFreeNoEvidence(95, 0, evidence, '').blocked, false);
    assert.equal(checkPaidToFreeNoEvidence(95, 0, '', evidence.toLowerCase()).blocked, false);
  }
  for (const value of [null, undefined, 95]) assert.equal(checkPaidToFreeNoEvidence(95, value, '', '').blocked, false);
});

test('points-collapse guard checks 80%/5000 boundaries and cashback exemption', () => {
  assert.equal(checkPointsCollapse(20000, 4000, 'Rewards').blocked, true);
  assert.equal(checkPointsCollapse(20000, 4001, 'Rewards').blocked, false);
  assert.equal(checkPointsCollapse(100000, 5000, 'Rewards').blocked, false);
  assert.equal(checkPointsCollapse(75000, 750, 'Rewards').blocked, true);
  assert.equal(checkPointsCollapse(75000, 750, 'Cash Back').blocked, false);
  for (const missing of [null, undefined, 0]) assert.equal(checkPointsCollapse(75000, missing, 'Rewards').blocked, false);
});

test('legacy source guard requires discontinued marker near the card name', () => {
  assert.equal(checkSourcePageDiscontinued('Fixture Rewards', 'fixture rewards 旧版').blocked, true);
  assert.equal(checkSourcePageDiscontinued('Fixture Rewards', 'discontinued fixture rewards').blocked, true);
  assert.equal(checkSourcePageDiscontinued('Fixture Rewards', `fixture rewards ${'x'.repeat(250)} discontinued`).blocked, false);
  assert.equal(checkSourcePageDiscontinued('Fixture Rewards', 'discontinued unrelated card').blocked, false);
});

test('offer signal scanner captures expiry hints without interpreting freshness', () => {
  for (const date of ['5/31/2026', '5-31-26', 'May 31, 2026']) {
    const signal = detectElevatedSignals(`<p>Limited-time offer ends ${date}</p>`);
    assert.equal(signal.matched, true);
    assert.equal(signal.expiry_hint, date);
  }
  assert.equal(detectElevatedSignals('Regular offer with no stated end date').expiry_hint, null);
  assert.equal(detectElevatedSignals('offer ends 1/1/2000').matched, false);
  assert.equal(detectElevatedSignals('offer ends 1/1/2000').expiry_hint, '1/1/2000');
});

test('FNA scanner rejects implausible counts/caps and distinguishes anniversary context', () => {
  assert.deepEqual(detectFreeNightSignals('Earn 5 Free Night Awards valid at properties up to 50K points. Annual free night.'),
    { matched: true, count_hint: 5, cap_hint: 50000, has_anniversary_fna: true });
  for (const count of [0, 50, 100]) assert.equal(detectFreeNightSignals(`${count} Free Night Awards`).matched, false);
  assert.equal(detectFreeNightSignals('1 Free Night Award up to 999 points each').cap_hint, null);
  assert.equal(detectFreeNightSignals('1 Free Night Award up to 200001 points each').cap_hint, null);
});

test('extraction stubs API responses: evidence penalties, expiry undo, hard blocks, and truncated retries', async (t) => {
  const cwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), 'auto-extraction-'));
  const key = process.env.MINIMAX_API_KEY;
  process.chdir(dir);
  process.env.MINIMAX_API_KEY = 'test-only-dummy';
  t.after(() => {
    process.chdir(cwd);
    if (key === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = key;
    rmSync(dir, { recursive: true, force: true });
  });
  const card = { card_id: 'fixture', name: 'Fixture Rewards', issuer: 'Fixture', annual_fee: 95,
    welcome_offer: { bonus_points: 75000, point_program: 'Rewards' } } as Card;
  const quote = 'This is the verified offer text for the fixture card.';
  const base = { annual_fee: 95, welcome_offer: { bonus_points: null, is_elevated: true,
    elevated_until: '2026-11-13', free_nights: 1, free_night_value_cap: 50000 },
    confidence: 1, source_quote: quote };
  let replies: string[] = [];
  const budgets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    budgets.push(JSON.parse(String(init.body)).max_tokens);
    assert.ok(replies.length, 'unexpected extra API request');
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }));
  });
  t.mock.method(console, 'warn', () => {});
  const extract = () => extractCardData(card, `<p>${quote}</p>`, 'https://example.invalid');
  replies = [JSON.stringify(base)];
  const result = await extract();
  assert.equal(result.source_quote_in_html, true);
  assert.equal(result.welcome_offer?.is_elevated, false);
  assert.equal(result.welcome_offer?.elevated_until, null);
  assert.equal(result.welcome_offer?.free_nights, null);
  assert.equal(result.welcome_offer?.free_night_value_cap, null);

  replies = [JSON.stringify({ ...base, source_quote: 'invented quote', welcome_offer: { bonus_points: 123000 } })];
  const unsupported = await extract();
  assert.equal(unsupported.confidence, 0.25);
  assert.equal(unsupported.welcome_offer?.bonus_points, null);

  replies = [JSON.stringify({ ...base, annual_fee: 0 })];
  await assert.rejects(extract(), /paid_to_free_no_evidence/);
  replies = ['{"incomplete":', JSON.stringify(base)];
  budgets.length = 0;
  assert.equal((await extract()).annual_fee, 95);
  assert.deepEqual(budgets, [16384, 24576]);
  replies = ['{"incomplete":', '{"still_incomplete":'];
  await assert.rejects(extract(), /truncated at both 16K and 24K/);
  replies = ['{invalid}'];
  budgets.length = 0;
  await assert.rejects(extract(), /invalid JSON/);
  assert.deepEqual(budgets, [16384]);
});
