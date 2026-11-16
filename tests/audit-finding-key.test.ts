import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingKey, normalizeFindingKey, type Finding } from '../scripts/audit/finding-key';

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
    const fresh = [current].filter(f => (f.severity === 'high' || f.severity === 'medium') && !previousKeys.has(findingKey(f)));
    assert.deepEqual(fresh, [], 'weekly-style filtering must not notify again');
    assert.equal(baseline[0].detail, before);
    assert.equal(current.detail, after, 'human-readable detail stays unchanged');
  });
}

test('stale_last_verified low-to-medium escalation stays known in weekly filtering', () => {
  const previous = finding('last_verified 2025-11-21 (360 days)', {
    type: 'stale_last_verified', field: 'last_verified', severity: 'low',
  });
  const current: Finding = { ...previous, severity: 'medium', detail: 'last_verified 2025-11-21 (367 days)' };
  assert.equal(findingKey(previous), findingKey(current));
  const previousKeys = new Set([previous].map(findingKey));
  const fresh = [current].filter(f => (f.severity === 'high' || f.severity === 'medium') && !previousKeys.has(findingKey(f)));
  assert.deepEqual(fresh, [], 'weekly-style filtering must not re-notify a severity escalation');
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
