import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFindings, findingKey, normalizeFindingKey, type Finding } from '../scripts/audit/finding-key';

import { renderWeeklySummary } from '../scripts/audit/weekly-summary';

const summary = (previous: Finding[] | null, current: Finding[]) =>
  renderWeeklySummary(previous, current, '2026-11-16', '2026-11-09', 'synthetic-audit');

const finding = (detail: string, overrides: Partial<Finding> = {}): Finding => ({
  card_id: 'synthetic-card', type: 'expired_offer_still_current', severity: 'high',
  field: 'welcome_offer.expiry', detail, ...overrides,
});

for (const { type, field, severity, before, after, stable } of [
  { type: 'expired_offer_still_current', field: 'welcome_offer.expiry', severity: 'high',
    before: 'expiry 2026-10-01 (12 days ago); still current',
    after: 'expiry 2026-10-01 (19 days ago); still current', stable: 'expiry 2026-10-01; still current' },
  { type: 'past_next_review', field: 'next_review', severity: 'low',
    before: 'next_review 2026-10-01 (12 days ago)', after: 'next_review 2026-10-01 (19 days ago)',
    stable: 'next_review 2026-10-01' },
  { type: 'stale_last_verified', field: 'last_verified', severity: 'medium',
    before: 'last_verified 2026-01-01 (200 days)', after: 'last_verified 2026-01-01 (207 days)',
    stable: 'last_verified 2026-01-01' },
] as const) {
  test(`${type}: old baseline objects and legacy key strings normalize to the current key`, () => {
    // Baselines contain full historical findings, with unmodified elapsed-day text.
    const baseline: Finding[] = JSON.parse(JSON.stringify([finding(before, { type, field, severity })]));
    const current = finding(after, { type, field, severity });
    const expected = `${type}|synthetic-card|${field}|${stable}`;
    assert.equal(findingKey(baseline[0]), expected);
    assert.equal(findingKey(current), expected);
    assert.equal(normalizeFindingKey(`${type}|synthetic-card|${field}|${before}`), expected);
    assert.equal(normalizeFindingKey(expected), expected, 'normalization is idempotent');
    const previousKeys = new Set(baseline.map(findingKey));
    assert.equal(previousKeys.has(findingKey(current)), true, 'day-count changes are KNOWN');
    assert.deepEqual(classifyFindings(baseline, [current]), { new: [], escalated: [] });
    assert.equal(summary(baseline, [current]), 'NO_REPLY');
    assert.equal(baseline[0].detail, before);
    assert.equal(current.detail, after, 'human-readable detail stays unchanged');
  });
}

test('stale_last_verified low-to-medium escalation stays known and notifies once as escalated', () => {
  const previous = finding('last_verified 2025-11-21 (360 days)', {
    type: 'stale_last_verified', field: 'last_verified', severity: 'low',
  });
  const current: Finding = { ...previous, severity: 'medium', detail: 'last_verified 2025-11-21 (367 days)' };
  assert.equal(findingKey(previous), findingKey(current));
  assert.deepEqual(classifyFindings([previous], [current]), {
    new: [], escalated: [{ previous, current, from: 'low', to: 'medium' }],
  });
  const message = summary([previous], [current]);
  assert.notEqual(message, 'NO_REPLY', 'escalations alone must notify');
  assert.match(message, /升級 1 項問題 \(→高 0、→中 1\)/);
  assert.match(message, /【升級】/);
  assert.match(message, /低→中/);
  assert.match(message, /資料久未驗證/);
  assert.doesNotMatch(message, /stale_last_verified/);
  assert.doesNotMatch(message, /新增/);
  const nextWeek = { ...current, detail: 'last_verified 2025-11-21 (374 days)' };
  assert.deepEqual(classifyFindings([current], [nextWeek]), { new: [], escalated: [] });
  assert.equal(summary([current], [nextWeek]), 'NO_REPLY');
  assert.equal(current.severity, 'medium');
  assert.equal(current.detail, 'last_verified 2025-11-21 (367 days)');
});

test('card, type and field remain part of the key', () => {
  const base = finding('expiry 2026-10-01 (12 days ago); still current');
  for (const detail of [base.detail, 'expiry 2026-10-01 (19 days ago); still current']) {
    for (const change of [{ card_id: 'another-fake-card' }, { type: 'another-type' }, { field: 'another-field' }, { field: undefined }]) {
      assert.notEqual(findingKey(base), findingKey({ ...base, detail, ...change }));
    }
  }
  assert.equal(findingKey({ ...base, field: undefined }), findingKey({ ...base, field: '' }));
});

test('different non-day-count evidence remains distinct within the same card, type and field', () => {
  for (const [type, field, a, b] of [
    ['broken_source_url', 'sources', 'Failed https://example.invalid/first', 'Failed https://example.invalid/second'],
    ['duplicate_credit', 'credits', 'duplicate dining credit', 'duplicate travel credit'],
    ['expired_offer_still_current', 'welcome_offer.expiry', 'expiry 2026-10-01 (12 days ago); still current', 'expiry 2026-10-02 (19 days ago); still current'],
    ['expired_offer_still_current', 'welcome_offer.expiry', 'expiry 2026-10-01 (12 days ago); reason one', 'expiry 2026-10-01 (19 days ago); reason two'],
  ]) {
    assert.notEqual(findingKey(finding(a, { type, field })), findingKey(finding(b, { type, field })));
  }
});

test('normalization preserves other numeric evidence, parentheses, URL queries and detail separators', () => {
  const detail = '  Failed\nhttps://example.invalid/a?ref=12#part | (HTTP 404); 12 days ago; (12 months); (12 day); amount=200  ';
  assert.equal(findingKey(finding(detail)),
    'expired_offer_still_current|synthetic-card|welcome_offer.expiry|Failed https://example.invalid/a?ref=12#part | (HTTP 404); 12 days ago; (12 months); (12 day); amount=200');
  assert.equal(findingKey(finding('(12 days ago) check (200 days)')), findingKey(finding('check')));
});


for (const from of ['low', 'medium', 'high'] as const) {
  for (const to of ['low', 'medium', 'high'] as const) {
    test(`severity ${from} → ${to}: only rises notify as escalated`, () => {
      const previous = finding('synthetic evidence (12 days ago)', { severity: from });
      const current = finding('synthetic evidence (19 days ago)', { severity: to });
      const rises = (from === 'low' && to !== 'low') || (from === 'medium' && to === 'high');
      assert.equal(findingKey(previous), findingKey(current));
      assert.deepEqual(classifyFindings([previous], [current]), {
        new: [], escalated: rises ? [{ previous, current, from, to }] : [],
      });
      const message = summary([previous], [current]);
      assert.equal(message !== 'NO_REPLY', rises);
      if (rises) {
        const zh = { low: '低', medium: '中', high: '高' };
        assert.ok(message.includes(`${zh[from]}→${zh[to]}`));
        assert.equal(summary([current], [current]), 'NO_REPLY', 'raised baseline suppresses the second notification');
      }
    });
  }
}

test('a brand-new key is new, never escalated; only new high/medium findings notify', () => {
  for (const severity of ['low', 'medium', 'high'] as const) {
    const previous = finding('old evidence');
    const current = finding('new evidence', { severity });
    assert.deepEqual(classifyFindings([previous], [current]), { new: [current], escalated: [] });
    const message = summary([previous], [current]);
    assert.equal(message !== 'NO_REPLY', severity !== 'low');
    if (severity !== 'low') {
      assert.match(message, /新增 1 項問題/);
      assert.doesNotMatch(message, /升級/);
    }
  }
});

test('duplicate baseline keys use the highest severity and each current match is compared independently', () => {
  const low = finding('synthetic', { severity: 'low' });
  const medium = { ...low, severity: 'medium' as const };
  const high = { ...low, severity: 'high' as const };
  for (const previous of [[low, medium], [medium, low]]) {
    assert.deepEqual(classifyFindings(previous, [low, medium, high, high]), {
      new: [], escalated: [high, high].map(current => ({ previous: medium, current, from: 'medium', to: 'high' })),
    });
  }
  assert.deepEqual(classifyFindings([low, high, medium], [high]), { new: [], escalated: [] });
});

test('weekly summary shows both counts and preserves the 1800-character cap', () => {
  const previous = finding('synthetic', { severity: 'low' });
  const raised = { ...previous, severity: 'high' as const };
  const fresh = finding('new evidence', { card_id: 'fake-new' });
  const message = summary([previous], [raised, fresh]);
  assert.match(message, /新增 1 項問題/);
  assert.match(message, /升級 1 項問題 \(→高 1、→中 0\)/);
  assert.match(message, /低→高/);
  const manyPrevious = Array.from({ length: 40 }, (_, i) => ({ ...previous, card_id: `fake-${i}`, detail: 'synthetic '.repeat(20) }));
  const manyCurrent = manyPrevious.map((f, i) => ({ ...f, type: `synthetic-type-${i}`, severity: 'high' as const }));
  const truncated = summary(manyPrevious, manyCurrent);
  assert.ok(truncated.length <= 1800);
  assert.match(truncated, /（已截斷）完整報告：synthetic-audit\/2026-11-16-db-audit.md$/);
});

test('weekly summary preserves new findings before a capped batch of day-count escalations', () => {
  const previous = Array.from({ length: 40 }, (_, i) => finding('last_verified 2025-11-21 (360 days)', {
    card_id: `stale-card-${i}`, type: 'stale_last_verified', field: 'last_verified', severity: 'low',
  }));
  const raised = previous.map(f => ({ ...f, severity: 'medium' as const, detail: 'last_verified 2025-11-21 (367 days)' }));
  const fresh = finding('new high evidence', { card_id: 'new-high-card' });
  const freshMedium = finding('new medium evidence', { card_id: 'new-medium-card', type: 'missing_sources', severity: 'medium' });
  const message = summary(previous, [...raised, freshMedium, fresh]);
  assert.ok(message.length <= 1800);
  assert.match(message, /new-high-card/);
  assert.match(message, /升級 40 項問題 \(→高 0、→中 40\)/);
  assert.ok(message.indexOf('new-high-card') < message.indexOf('new-medium-card'));
  assert.ok(message.indexOf('new-medium-card') < message.indexOf('【升級】'));
  const escalationBlock = message.split('【升級】')[1].split('完整報告：')[0];
  assert.equal(escalationBlock.match(/^• stale-card-\d+（低→中）：資料久未驗證：/gm)?.length, 5);
  assert.match(escalationBlock, /^• …另 35 項$/m);
  assert.doesNotMatch(escalationBlock, /stale-card-5（/);
});

test('weekly summary prioritizes high escalations within the five-item cap', () => {
  const previous = Array.from({ length: 7 }, (_, i) => finding('synthetic evidence', {
    card_id: `mixed-card-${i}`, severity: 'low',
  }));
  const current = previous.map((f, i) => ({ ...f, severity: i === 6 ? 'high' as const : 'medium' as const }));
  const message = summary(previous, current);
  assert.match(message, /升級 7 項問題 \(→高 1、→中 6\)/);
  assert.match(message, /【升級】\n• mixed-card-6（低→高）/);
  assert.equal(message.match(/^• mixed-card-/gm)?.length, 5);
  assert.match(message, /^• …另 2 項$/m);
});

test('a null baseline suppresses new findings and escalations', () => {
  assert.equal(summary(null, [finding('synthetic')]), 'NO_REPLY');
});
