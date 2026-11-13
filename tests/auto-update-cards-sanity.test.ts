import test from 'node:test';
import assert from 'node:assert/strict';
import { diffCard, type DiffResult } from '../scripts/auto-update-cards/diff';
import { classifyRisk } from '../scripts/auto-update-cards/classify';
import { buildQueue } from '../scripts/auto-update-cards/bucket';
import { CONFIG } from '../scripts/auto-update-cards/config';
import type { Card } from '../scripts/auto-update-cards/cards-loader';
import type { ExtractedData } from '../scripts/auto-update-cards/extract';

const card: Card = {
  card_id: 'fixture', name: 'Fixture Rewards', issuer: 'Fixture', network: 'Visa',
  annual_fee: 100, foreign_transaction_fee: 0, credit_required: 'good', earning_rates: [],
  welcome_offer: { bonus_points: 100000, spending_requirement: 4000, description: 'Original offer',
    is_elevated: true, normal_bonus_points: 60000, elevated_until: '2026-11-13',
    free_nights: 3, free_night_value_cap: 50000 },
};

test('diff preserves curated fields when extraction has no signal, but accepts explicit zero/false', () => {
  const before = structuredClone(card);
  const empty: ExtractedData = { annual_fee: null, welcome_offer: null, earning_rates: null,
    confidence: 0.9, source_quote: '', source_quote_in_html: false };
  assert.equal(diffCard(card, empty), null);
  assert.equal(diffCard(card, { ...empty, welcome_offer: {
    bonus_points: null, spending_requirement: null, time_period_months: null,
    description: null, point_program: null, is_elevated: null,
    normal_bonus_points: 0, elevated_until: '', free_nights: -1, free_night_value_cap: 0,
  } }), null);
  const diff = diffCard(card, { ...empty, annual_fee: 0, welcome_offer: {
    bonus_points: 0, spending_requirement: 0, time_period_months: 0,
    description: null, point_program: null, is_elevated: false, free_nights: 0,
  } });
  assert.deepEqual(diff?.changes.map(({ field, to }) => [field, to]), [
    ['annual_fee', 0], ['welcome_offer.bonus_points', 0],
    ['welcome_offer.spending_requirement', 0], ['welcome_offer.time_period_months', 0],
    ['welcome_offer.is_elevated', false], ['welcome_offer.free_nights', 0],
  ]);
  assert.deepEqual(card, before);
});

test('risk thresholds include exact boundaries and use the highest risk in any order', () => {
  const cases: [string, number, number, string][] = [
    ['annual_fee', 100, 130, 'MED'], ['annual_fee', 100, 131, 'HIGH'],
    ['annual_fee', 100, 70, 'MED'], ['annual_fee', 100, 69, 'HIGH'],
    ['annual_fee', 0, 95, 'HIGH'], ['annual_fee', 95, 0, 'HIGH'],
    ['welcome_offer.bonus_points', 100000, 125000, 'LOW'],
    ['welcome_offer.bonus_points', 100000, 126000, 'MED'],
    ['welcome_offer.bonus_points', 100000, 50000, 'MED'],
    ['welcome_offer.bonus_points', 100000, 49000, 'HIGH'],
    ['welcome_offer.bonus_points', 75000, 750, 'HIGH'],
    ['welcome_offer.bonus_points', 0, 1000, 'HIGH'],
    ['welcome_offer.spending_requirement', 4000, 5000, 'LOW'],
    ['welcome_offer.spending_requirement', 4000, 5001, 'MED'],
    ['welcome_offer.spending_requirement', 4000, 8000, 'MED'],
    ['welcome_offer.spending_requirement', 4000, 8001, 'HIGH'],
    ['welcome_offer.free_nights', 3, 4, 'MED'], ['welcome_offer.free_nights', 3, 5, 'HIGH'],
    ['welcome_offer.free_nights', 3, 0, 'HIGH'],
  ];
  for (const [field, from, to, expected] of cases) {
    const diff: DiffResult = { card_id: card.card_id, confidence: 1, source_url: '', scraped_at: '',
      changes: [{ field, from, to }] };
    assert.equal(classifyRisk(diff), expected, `${field}: ${from} -> ${to}`);
    const low = { field: 'welcome_offer.description', from: 'old', to: 'new' };
    assert.equal(classifyRisk({ ...diff, changes: [low, ...diff.changes] }), expected);
    assert.equal(classifyRisk({ ...diff, changes: [...diff.changes, low] }), expected);
  }
});

test('queue prioritizes featured then deduplicated RSS then stale dates, excluding ineligible cards', () => {
  const make = (id: string, extra: Partial<Card> = {}): Card => ({ ...card, card_id: id, name: `${id} Rewards Card`, ...extra });
  const cards = [make('recent', { last_updated: '2026-11-13' }), make('featured', { featured: true }),
    make('old', { last_updated: '2026-01-01' }), make('undated'), make('rss'),
    make('discontinued', { status: 'discontinued', featured: true }),
    make('manual', { status: 'needs_manual_review', featured: true })];
  const before = structuredClone(cards);
  const items = ['featured', 'rss', 'rss', 'discontinued', 'manual'].map(id => ({
    title: `${id} Rewards Card offer`, url: 'https://example.invalid', pubDate: '', categories: [],
  }));
  assert.deepEqual(buildQueue(cards, items, 5).map(c => c.card_id), ['featured', 'rss', 'undated', 'old', 'recent']);
  assert.deepEqual(buildQueue(cards, items, 1).map(c => c.card_id), ['featured']);
  assert.deepEqual(buildQueue(cards, items, -1), []);
  assert.deepEqual(buildQueue(cards, items, 0), []);
  assert.deepEqual(cards, before);
});

test('featured queue respects the configured cap before stale fill', () => {
  const cards = Array.from({ length: CONFIG.FEATURED_PRIORITY + 2 }, (_, i) => ({
    ...card, card_id: `featured-${i}`, featured: true, last_updated: i === CONFIG.FEATURED_PRIORITY + 1 ? '2000-01-01' : '2026-01-01',
  }));
  const queue = buildQueue(cards, [], CONFIG.FEATURED_PRIORITY + 1);
  assert.deepEqual(queue.slice(0, CONFIG.FEATURED_PRIORITY), cards.slice(0, CONFIG.FEATURED_PRIORITY));
  assert.equal(queue.at(-1)?.card_id, `featured-${CONFIG.FEATURED_PRIORITY + 1}`);
});
