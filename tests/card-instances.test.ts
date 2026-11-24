import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as instances from '../lib/card-instances';
import * as aliases from '../lib/card-aliases';

const product = 'amex-hilton-honors-aspire';

test('legacy migration preserves every copy, metadata, existing IDs and sidecar keys', () => {
  const rows = instances.normalizeCardInstances([
    { card_id: product, nickname: 'First', open_date: '2020-04', created_at: 1 },
    { card_id: product, nickname: 'Travel', last4: '1234' },
    { card_id: product, instance_id: `${product}-copy-2`, status: 'closed' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.instance_id)).size, 3);
  assert.equal(rows[0].instance_id, product);
  assert.equal(rows[0].nickname, 'First');
  assert.equal(rows[0].open_date, '2020-04');
  assert.equal(rows[0].created_at, 1);
  assert.equal(rows[1].nickname, 'Travel');
  assert.equal(rows[1].last4, '1234');
  assert.equal(rows[2].instance_id, `${product}-copy-2`);
  assert.equal(rows[2].status, 'closed');
  assert.deepEqual(instances.normalizeCardInstances(JSON.parse(JSON.stringify(rows))), rows);
  const legacy = [product, product];
  assert.deepEqual(instances.normalizeCardInstances(legacy).map(x => x.instance_id), instances.normalizeCardInstances(legacy).map(x => x.instance_id));
  assert.equal(instances.normalizeCardInstances([product]).length, 1, 'never invent a lost copy');
  assert.deepEqual(instances.normalizeCardInstances([], [product]), [], 'explicit empty instance list is authoritative');
});

test('normalization drops extra fields and bounds nickname and last4', () => {
  const [row] = instances.normalizeCardInstances([{
    card_id: product, nickname: 'N'.repeat(81), last4: '123456',
    extra: 'untrusted', created_at: 0,
  }]);
  assert.deepEqual(row, {
    instance_id: product, card_id: product, nickname: 'N'.repeat(80),
    last4: '3456', created_at: 0, status: 'active',
  });
});

test('invalid timestamps fall back to the current time', () => {
  for (const created_at of [undefined, null, NaN, Infinity, -Infinity, 'invalid', '123']) {
    const before = Date.now();
    const [row] = instances.normalizeCardInstances([{ card_id: product, created_at }]);
    assert(Number.isFinite(row.created_at));
    assert(row.created_at >= before && row.created_at <= Date.now());
  }
});

test('guest add, persist/reload and picker edits keep duplicate instances', () => {
  let rows = instances.addCardInstance([], product);
  rows[0].nickname = 'keep me';
  rows = instances.addCardInstance(rows, product);
  assert.equal(new Set(rows.map(row => row.instance_id)).size, 2);
  rows = instances.normalizeCardInstances(JSON.parse(JSON.stringify(rows)));
  assert.equal(rows.length, 2);
  const selected = instances.selectCardProducts(rows, [product, 'amex-platinum']);
  assert.deepEqual(selected.slice(0, 2), rows);
  assert.deepEqual(instances.selectCardProducts(selected, [product]), rows);
  assert.deepEqual(instances.cardProductIds(rows), [product], 'only the catalog projection deduplicates');
});

// Execute route handlers against an isolated in-memory fixture. No network or
// production stores are accessed. This also checks the actual wire payloads.
async function route(path: string, user: Record<string, unknown>) {
  class Redis {
    async hgetall() { return structuredClone(user); }
    async hset(_key: string, update: Record<string, unknown>) { Object.assign(user, structuredClone(update)); }
    async get() { return null; }
    async incr() { return 1; }
    async expire() { return 1; }
  }
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init?: {status: number}) => ({ body, status: init?.status ?? 200 }) } },
    '@upstash/redis': { Redis }, '@/lib/card-instances': instances,
    '@/lib/card-aliases': aliases, 'node:crypto': crypto,
    '@/lib/email': { sendEmail: () => { throw new Error('Unexpected email'); } },
  };
  const compiled = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`(async()=>{${compiled};return exports;})()`, {
    exports: {}, require: (name: string) => { assert(name in modules, name); return modules[name]; },
    process: { env: {} }, Buffer, console, Date, URL,
  });
}
const request = (body: unknown) => ({ json: async () => body, headers: { get: () => null } });

test('cloud add/load/sync/remove targets instances and preserves legacy rows and metadata', async () => {
  const user: Record<string, unknown> = {
    created_at: 1, status: 'confirmed', cards: [product, product],
  };
  const save = await route('app/api/my-cards/save/route.ts', user);
  const get = await route('app/api/my-cards/route.ts', user);
  const subscribe = await route('app/api/my-cards/subscribe/route.ts', user);
  const remove = await route('app/api/my-cards/remove/route.ts', user);
  const load = async () => (await get.GET({ url: 'https://example.invalid/api/my-cards?email=fixture@example.invalid' })).body.card_instances as instances.UserCardInstance[];
  const before = await load();
  assert.equal(before.length, 2);
  assert.notEqual(before[0].instance_id, before[1].instance_id);
  assert.deepEqual((await load()).map(x => x.instance_id), before.map(x => x.instance_id));
  before[0].nickname = 'preserve';
  before[0].open_date = {month: 4, year: 2020};
  user.card_instances = before;
  assert.equal((await save.POST(request({ email: 'fixture@example.invalid', card_id: product }))).status, 200);
  assert.equal((await load()).length, 3);
  const payload = { email: 'fixture@example.invalid', cards: [product, 'amex-platinum'] };
  await subscribe.PUT(request(payload));
  let rows = await load();
  assert.equal(rows.filter(row => row.card_id === product).length, 3, 'old product-only clients must retain all copies');
  assert.equal(rows[0].nickname, 'preserve');
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].open_date)), {month: 4, year: 2020});
  await subscribe.POST(request({ ...payload, card_instances: rows }));
  rows = await load();
  const keep = rows[0].instance_id;
  await remove.POST(request({ email: payload.email, instance_id: rows[1].instance_id }));
  rows = await load();
  assert(rows.some(row => row.instance_id === keep));
  assert.equal(rows.filter(row => row.card_id === product).length, 2);
  await remove.POST(request({email: payload.email, card_id: product}));
  assert.deepEqual((await load()).map(row => row.card_id), ['amex-platinum']);
});
