import test from 'node:test';
import assert from 'node:assert/strict';
import { creditBalance } from '../lib/credit-balance';
import { computePeriodKey } from '../lib/credit-periods';

test('remaining balances include all periods, preserve cents and isolate card copies and periods', () => {
  const key = (frequency: string) => computePeriodKey(frequency, new Date('2026-09-15T12:00:00Z'));
  const credits = [
    { credit_key: 'm', amount: 12.95, frequency: 'monthly' },
    { credit_key: 'q', amount: 100, frequency: 'quarterly' },
    { credit_key: 'h', amount: 50, frequency: 'semi_annual' },
    { credit_key: 'y', amount: 200, frequency: 'annual' },
    { credit_key: 'night', amount: 500, frequency: 'annual', is_free_night: true },
    { credit_key: 'stay', amount: 100, frequency: 'per_stay' },
    { amount: 1000, frequency: 'annual' },
  ];
  const uses = new Map([
    ['copy1:m:2026-09', { used_amount: 2 }],
    ['copy1:m:2026-08', { used_amount: 12.95 }],
    ['copy1:q:2026-Q3', { used_amount: 100 }],
    ['copy1:h:2026-H2', { used_amount: 60 }],
    ['copy1:y:2026', { used_amount: 30 }],
  ]);
  assert.deepEqual(creditBalance('copy1', credits, uses, key), { totalCents: 36295, remainingCents: 18095 });
  assert.deepEqual(creditBalance('copy2', credits, uses, key), { totalCents: 36295, remainingCents: 36295 });
  assert.equal(creditBalance('empty', [], uses, key).remainingCents, 0);
});

test('the screenshot subtraction is exact in cents', () => {
  const result = creditBalance('card', [{ credit_key: 'sum', amount: 1251.95, frequency: 'annual' }],
    new Map([['card:sum:2026', { used_amount: 795 }]]), () => '2026');
  assert.equal(result.remainingCents, 45695);
});
