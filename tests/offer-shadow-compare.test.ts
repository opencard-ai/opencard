import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCandidates, comparePlans, renderMarkdown } from '../scripts/offer-watch/shadow-compare-core';

const ok = (values: Record<string, unknown>) => ({ ok: true, values });
const fail = { ok: false, error: 'http_403', values: {} };

test('shadow compare classifies match, differ, fetch gap and one-sided cards', () => {
  const cloud = [
    { card_id: 'a', fields: { 'welcome_offer.bonus_points': 60000 }, evidence: { confirmations: [ok({}), ok({})] } },
    { card_id: 'b', fields: { annual_fee: 95 }, evidence: { confirmations: [ok({}), ok({})] } },
    { card_id: 'c', fields: {}, evidence: { confirmations: [fail, fail] } },
    { card_id: 'd', fields: {}, evidence: { confirmations: [ok({})] } },
  ];
  const mac = [
    { card_id: 'a', fields: { 'welcome_offer.bonus_points': 60000 }, evidence: { confirmations: [ok({}), ok({})] } },
    { card_id: 'b', fields: { annual_fee: 150 }, evidence: { confirmations: [ok({}), ok({})] } },
    { card_id: 'c', fields: { annual_fee: 0 }, evidence: { confirmations: [ok({}), ok({})] } },
    { card_id: 'e', fields: {}, evidence: { confirmations: [] } },
  ];
  const r = compareCandidates(cloud, mac);
  assert.deepEqual([r.match, r.values_differ, r.fetch_gap, r.cloud_only, r.mac_only], [1, 1, 1, 1, 1]);
  assert.deepEqual(r.diffs.find(d => d.card_id === 'b')?.differing_fields, ['annual_fee']);
  assert.match(renderMarkdown(r), /\| c \| fetch_gap \| 0\/2 \| 2\/2 \|/);
});

test('plan compare keys applied, held and expiry decisions', () => {
  const cloud = { applied: [{ card_id: 'a', changes: [{ field: 'annual_fee', new_value: 95 }] }], held: [{ card_id: 'b', field: 'x', value: 1 }] };
  const mac = { applied: [], held: [{ card_id: 'b', field: 'x', value: 1 }], expiry_review: [{ card_id: 'z', field: 'welcome_offer.expiry' }] };
  const p = comparePlans(cloud, mac);
  assert.equal(p.both, 1);
  assert.deepEqual(p.only_cloud, ['applied|a|annual_fee|95']);
  assert.deepEqual(p.only_mac, ['expiry_review|z|welcome_offer.expiry']);
});

test('absent field differs from explicit null', () => {
  const r = compareCandidates([{ card_id: 'a', fields: { 'welcome_offer.statement_credit': null }, evidence: { confirmations: [ok({})] } }], [{ card_id: 'a', fields: {}, evidence: { confirmations: [ok({})] } }]);
  assert.equal(r.values_differ, 1);
});
