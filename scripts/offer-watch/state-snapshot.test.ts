import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { exportSnapshot, importSnapshot, validateBundle, readSandboxFixtures, restoreSnapshotToSandbox, snapshotDocuments, writePrivateSnapshot } from './state-snapshot';
import { createRedisOfferState } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import { syntheticSnapshotBundle as bundle } from './state-snapshot.fixtures';
const PREFIX = 'opencard:offer-state:{sandbox-restored01}:';
const session = (db: ReturnType<typeof mockRedis>, runnerId = 'restore-runner') => createRedisOfferState({ enabled: true, prefix: PREFIX, transport: db.transport, ttlMs: 1000, runnerId });
test('encrypted offline snapshot roundtrip, authenticated digest, no plaintext or key leakage', () => {
  const key = randomBytes(32), input = bundle(), encoded = exportSnapshot(input, key), decoded = importSnapshot(encoded, key);
  assert.deepEqual(decoded.bundle, input); assert.match(decoded.digest, /^[0-9a-f]{64}$/); assert.ok(!encoded.includes(Buffer.from('synthetic_failure'))); assert.ok(!encoded.includes(key));
});
for (const field of ['ciphertext', 'tag', 'digest', 'schema', 'fixtureOnly']) test(`snapshot tamper ${field} refuses before adapter calls`, async () => {
  const key = randomBytes(32), value = JSON.parse(exportSnapshot(bundle(), key).toString());
  if (field === 'schema') value.schema = 999; else if (field === 'fixtureOnly') value.fixtureOnly = false; else value[field] = field === 'digest' ? '0'.repeat(64) : Buffer.from('tampered').toString('base64');
  let calls = 0; await assert.rejects(restoreSnapshotToSandbox({ importIntoNewNamespace: async () => { calls++; return 'forbidden'; } }, Buffer.from(JSON.stringify(value)), key, true)); assert.equal(calls, 0);
});
test('wrong key, oversized payload, unknown schema, malformed ledger/history/daily/journal all refuse', () => {
  assert.throws(() => importSnapshot(exportSnapshot(bundle(), randomBytes(32)), randomBytes(32)));
  assert.throws(() => importSnapshot(Buffer.alloc(4 * 1024 * 1024 + 1), randomBytes(32)));
  for (const input of [{ ...bundle(), schema: 2 }, { ...bundle(), ledger: { version: 2 } }, { ...bundle(), history: [{ type: 'unknown' }] }, { ...bundle(), daily: { fetch_failures: { card: 'not-array' } } }, { ...bundle(), claims: {} }, { ...bundle(), journals: [{ version: 999 }] }]) assert.throws(() => validateBundle(input));
});
test('fixture reader requires explicit sandbox marker, fixed filenames, no symlinks; private output never overwrites', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-state-fixture-'));
  try {
    assert.throws(() => readSandboxFixtures(root)); const input = bundle();
    fs.writeFileSync(path.join(root, 'offer-state.sandbox.json'), JSON.stringify({ schema: 1, sandbox: true, fixtureId: input.fixtureId }));
    for (const [name, data] of [['ledger.json', JSON.stringify(input.ledger)], ['daily-state.json', JSON.stringify(input.daily)], ['history.jsonl', input.history.map(e => JSON.stringify(e)).join('\n')], ['journals.json', JSON.stringify(input.journals)], ['claims.json', JSON.stringify(input.claims)]] as const) fs.writeFileSync(path.join(root, name), data);
    assert.deepEqual(readSandboxFixtures(root), input); const encoded = exportSnapshot(input, randomBytes(32));
    const output = path.join(root, 'snapshot.enc.json'); writePrivateSnapshot(output, encoded); assert.equal(fs.statSync(output).mode & 0o077, 0); assert.throws(() => writePrivateSnapshot(output, encoded));
    fs.renameSync(path.join(root, 'ledger.json'), path.join(root, 'ledger-hidden.json')); fs.symlinkSync(path.join(root, 'ledger-hidden.json'), path.join(root, 'ledger.json')); assert.throws(() => readSandboxFixtures(root));
  } finally { fs.rmSync(root, { recursive: true }); }
});
test('restore into new namespace atomically installs operational/journal/claims; repeat same snapshot does not overwrite', async () => {
  const db = mockRedis(), state = session(db); await state.lease.acquire(); const key = randomBytes(32), encoded = exportSnapshot(bundle(), key);
  assert.equal(await restoreSnapshotToSandbox(state, encoded, key, true), 'imported');
  const operational = await state.read<{ history: unknown[] }>('operational'); assert.equal(operational?.version, 1); assert.equal(operational?.value.history.length, 1);
  const journal = await state.journal().load('offer-2026-11-06-morning'); assert.equal(journal?.mergeSha, 'c'.repeat(40));
  await assert.rejects(async () => { await state.journal().claim(['fixture-fp'], 'another-run'); });
  await state.cas('operational', 1, { fixture: 'post-import-update' });
  assert.equal(await restoreSnapshotToSandbox(state, encoded, key, true), 'already-imported'); assert.equal((await state.read('operational'))?.version, 2);
});
test('partial import reservation + failure: ordinary writes blocked; new fenced session resumes same digest only', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const key = randomBytes(32), encoded = exportSnapshot(bundle(), key);
  db.fail('finishImport'); await assert.rejects(restoreSnapshotToSandbox(a, encoded, key, true)); assert.equal(db.get(`${PREFIX}doc:operational`), undefined);
  db.advance(1001); const b = session(db, 'second-runner'); await b.lease.acquire(); await assert.rejects(b.cas('operational', 0, 'not-allowed'));
  const changed = bundle(); changed.fixtureId = 'different-fixture'; await assert.rejects(restoreSnapshotToSandbox(b, exportSnapshot(changed, key), key, true));
  assert.equal(await restoreSnapshotToSandbox(b, encoded, key, true), 'imported');
});
test('lost import response after atomic install: new session recognizes complete receipt without replay', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const key = randomBytes(32), encoded = exportSnapshot(bundle(), key);
  db.fail('finishImport', true); await assert.rejects(restoreSnapshotToSandbox(a, encoded, key, true)); db.advance(1001);
  const b = session(db, 'second-runner'); await b.lease.acquire(); assert.equal(await restoreSnapshotToSandbox(b, encoded, key, true), 'already-imported'); assert.equal((await b.read('operational'))?.version, 1);
});
test('existing normal namespace and missing new-namespace confirmation refuse restore', async () => {
  const db = mockRedis(), state = session(db); await state.lease.acquire(); await state.cas('operational', 0, { fixture: 'existing' }); const key = randomBytes(32), encoded = exportSnapshot(bundle(), key);
  await assert.rejects(restoreSnapshotToSandbox(state, encoded, key, false)); await assert.rejects(restoreSnapshotToSandbox(state, encoded, key, true)); assert.equal((await state.read('operational'))?.version, 1);
});
test('all snapshot documents are bounded versioned metadata/state, unknown remote schema refused', async () => {
  assert.equal(Object.keys(snapshotDocuments(bundle())).length, 3); const db = mockRedis(), state = session(db); await state.lease.acquire(); db.set(`${PREFIX}doc:operational`, JSON.stringify({ schema: 999, version: 1 })); await assert.rejects(state.read('operational'));
});

test('partial server-side import write remains invisible and same digest/new fence safely resumes', async () => {
  const db = mockRedis(), a = session(db); await a.lease.acquire(); const key = randomBytes(32), encoded = exportSnapshot(bundle(), key);
  db.partialImportFailure(); await assert.rejects(restoreSnapshotToSandbox(a, encoded, key, true));
  db.advance(1001); const b = session(db, 'resume-partial'); await b.lease.acquire();
  await assert.rejects(b.read('operational')); // pending manifest hides any partially staged data.
  assert.equal(await restoreSnapshotToSandbox(b, encoded, key, true), 'imported'); assert.equal((await b.read('operational'))?.version, 1);
});
