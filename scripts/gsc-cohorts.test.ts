import test from 'node:test';
import assert from 'node:assert/strict';
import sitemap from '../app/sitemap';
import { GUIDES } from '../lib/guides';
import { classifyPolicy, classifyCohort, compareCohorts, normalizeUrl, cardIdsFromRecords } from './gsc-cohorts';
const origin = 'https://opencardai.com';
const retained = `${origin}/en/cards/chase-sapphire-reserve`;
const fresh = `${origin}/en/guides/new-guide`;
const excluded = `${origin}/es/cards/amex-blue-cash-everyday`;
const context = {
  indexableUrls: new Set([...sitemap().map(item => normalizeUrl(item.url)), fresh]),
  cardIds: new Set(['chase-sapphire-reserve', 'amex-blue-cash-everyday']),
  guideSlugs: new Set(GUIDES.map(guide => guide.slug)),
};
const baseline = { capturedAt: '2026-09-13T00:00:00Z', indexableUrls: [...context.indexableUrls].filter(url => url !== fresh) };
const row = (url: string, impressions: number, clicks: number, position: number) => ({ url, impressions, clicks, position, ctr: 0 });
test('current sitemap policy retains English core but excludes intentional translations and non-core cards', () => {
  assert.equal(classifyPolicy(retained, context), 'indexable');
  assert.equal(classifyPolicy(`${retained}/?campaign=test#details`, context), 'indexable');
  assert.equal(classifyPolicy(excluded, context), 'noindex');
  assert.equal(classifyPolicy(`${origin}/en/cards/amex-blue-cash-everyday`, context), 'noindex');
  assert.equal(classifyPolicy(`${origin}/zh/guides/${GUIDES[0].slug}`, context), 'noindex');
  assert.equal(classifyPolicy(`${origin}/en/guides/${GUIDES[0].slug}`, context), 'indexable');
  assert.equal(classifyPolicy(`${origin}/es/benefit-expiration-tracker`, context), 'noindex');
  assert.equal(classifyPolicy(`${origin}/en/cards/missing-product`, context), 'unknown');
  assert.equal(classifyPolicy('https://other.example/en/cards/chase-sapphire-reserve', context), 'unknown');
});
test('new classification uses saved indexable membership, not presence or absence of traffic', () => {
  assert.equal(classifyCohort(retained, context, baseline), 'retained');
  assert.equal(classifyCohort(fresh, context, baseline), 'new');
  assert.equal(classifyCohort(excluded, context, baseline), 'excluded');
  assert.equal(classifyCohort(`${origin}/removed`, context, baseline), 'unknown');
});
test('same membership applied to both periods; weighted position and CTR; absent rows remain zero', () => {
  const cohorts = compareCohorts(
    [row(retained, 100, 10, 10), row(`${origin}/en`, 300, 0, 30), row(excluded, 25, 0, 4)],
    [row(retained, 80, 4, 15), row(fresh, 20, 2, 8)], context, baseline,
  );
  assert.equal(cohorts.retained.current.impressions, 400);
  assert.equal(cohorts.retained.current.position, 25);
  assert.equal(cohorts.retained.current.ctr, 2.5);
  assert.equal(cohorts.retained.previous.impressions, 80);
  assert.equal(cohorts.new.previous.impressions, 20);
  assert.equal(cohorts.new.current.impressions, 0);
  assert.equal(cohorts.new.current.position, 0);
  assert.equal(cohorts.excluded.current.impressions, 25);
});

test('card identity comes from card_id even when a source filename differs', () => {
  const legacyFile = { filename: 'legacy-product.json', card_id: 'canonical-product' };
  const registry = { ...context, cardIds: cardIdsFromRecords([legacyFile]) };
  assert.equal(classifyPolicy(`${origin}/en/cards/canonical-product`, registry), 'noindex');
  assert.equal(classifyPolicy(`${origin}/en/cards/legacy-product`, registry), 'unknown');
});
