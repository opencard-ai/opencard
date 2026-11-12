/** Shared operational I/O for the real sandbox stages. No default backend/fallback. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { privateFileJournal, type OfferJournalStore } from './publish-journal';
import { readSandboxFixtures, validateBundle, type OperationalState } from './state-snapshot';
import type { createRedisOfferState } from './redis-state';
import type { CardRecord } from './gate';
export interface OfferStateIO {
  backend: 'file-fixture' | 'redis-sandbox';
  leaseTtlMs?: number;
  publicationRoot: string;
  artifactRoot: string;
  cardBytes(file: string): Buffer;
  lease: { acquire(): Promise<unknown>; assert(): Promise<void>; renew(): Promise<void>; release(): Promise<unknown> };
  journal: OfferJournalStore;
  read(): Promise<{ version: number; value: OperationalState }>;
  cas(version: number, value: OperationalState): Promise<void>;
  cards(): Map<string, CardRecord>;
  putCards(cards: Map<string, CardRecord>): Promise<void>;
  artifact(name: string, value: unknown): Promise<void>;
}
export const checkedOperational = (value: OperationalState): OperationalState => {
  const v = validateBundle({ ...value, fixtureOnly: true, fixtureId: 'stage-schema-check', journals: [], claims: {} });
  return { schema: 1, ledger: v.ledger, history: v.history, daily: v.daily };
};
function scratch(root: string, artifacts: string, cards: Map<string, CardRecord>, lease: OfferStateIO['lease']) {
  if (!path.isAbsolute(root)) throw new Error('explicit private scratch root required');
  const relative = path.relative(fs.realpathSync(process.cwd()), path.resolve(root));
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('scratch must be outside repository');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink() || (fs.statSync(root).mode & 0o077)) throw new Error('private scratch directory required');
  const realRoot = fs.realpathSync(root);
  const repo = fs.realpathSync(process.cwd());
  if (realRoot === repo || realRoot.startsWith(`${repo}${path.sep}`)) throw new Error('real scratch root must be outside repo');
  if (!path.isAbsolute(artifacts)) throw new Error('explicit external private artifact root required');
  const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
  if (overlaps(path.resolve(artifacts), realRoot) || overlaps(path.resolve(artifacts), repo)) throw new Error('artifacts must be outside publisher/repository tree');
  fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  const artifactRoot = fs.realpathSync(artifacts);
  if (fs.lstatSync(artifacts).isSymbolicLink() || (fs.statSync(artifacts).mode & 0o077) || overlaps(artifactRoot, realRoot) || overlaps(artifactRoot, repo)) throw new Error('artifacts must be private and outside publisher/repository tree');
  const directory = (...parts: string[]) => {
    let dir = root;
    for (const part of parts) { dir = path.join(dir, part); if (fs.existsSync(dir)) { if (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory()) throw new Error('scratch directory symlink/non-directory prohibited'); } else fs.mkdirSync(dir, { mode: 0o700 }); }
    return dir;
  };
  let current = structuredClone(cards), initialized = false;
  return {
    publicationRoot: realRoot, artifactRoot,
    cardBytes: (file: string) => { if (!/^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error('card byte path invalid'); return fs.readFileSync(path.join(realRoot, file)); },
    cards: () => initialized ? new Map([...current.keys()].map(id => [id, JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards', `${id}.json`), 'utf8')) as CardRecord])) : structuredClone(current),
    putCards: async (next: Map<string, CardRecord>) => {
      await lease.assert();
      const dir = directory('data', 'cards');
      for (const [id, card] of next) {
        if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('invalid scratch card ID');
        const file = path.join(dir, `${id}.json`);
        if (fs.existsSync(file)) {
          if (fs.lstatSync(file).isSymbolicLink()) throw new Error('scratch card symlink prohibited');
          // Apply passes the whole map: do not reserialize semantically unchanged cards.
          if (isDeepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), card)) continue;
        }
        fs.writeFileSync(file, JSON.stringify(card), { mode: 0o600 });
      }
      current = structuredClone(next); initialized = true;
    },
    artifact: async (name: string, value: unknown) => {
      await lease.assert(); if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('artifact name invalid');
      const dir = artifactRoot;
      const file = path.join(dir, name); if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('scratch artifact symlink prohibited');
      fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
    },
  };
}
export function fileFixtureState(options: { root: string; scratch: string; artifacts: string; cards: Map<string, CardRecord> }): OfferStateIO {
  const real = fs.realpathSync(options.root), repo = fs.realpathSync(process.cwd());
  if (real === repo || real.startsWith(`${repo}${path.sep}`)) throw new Error('fixture state must be outside repo');
  const seed = readSandboxFixtures(options.root); // Explicit legacy fixture files; never defaults to ~/.openclaw.
  if (seed.journals.length || Object.keys(seed.claims).length) throw new Error('file fixture restore with journals/claims is unsupported; use explicit validated new-namespace import, never discard publication dedupe');
  if ((fs.statSync(options.root).mode & 0o077) || fs.lstatSync(options.root).isSymbolicLink()) throw new Error('private fixture state directory required');
  const owner = randomUUID(), lock = path.join(options.root, '.state-lease'), file = path.join(options.root, 'operational-state.json');
  let held = false;
  const assert = async () => { if (!held || fs.readFileSync(lock, 'utf8') !== owner) throw new Error('file fixture lease lost'); };
  const lease = {
    acquire: async () => { if (held) throw new Error('already acquired'); fs.writeFileSync(lock, owner, { flag: 'wx', mode: 0o600 }); held = true; },
    assert, renew: assert,
    release: async () => { if (!held) return; await assert(); fs.unlinkSync(lock); held = false; },
  };
  const read = async () => {
    await assert();
    if (!fs.existsSync(file)) return { version: 0, value: checkedOperational({ schema: 1, ledger: seed.ledger, history: seed.history, daily: seed.daily }) };
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')); if (doc.schema !== 1 || !Number.isSafeInteger(doc.version)) throw new Error('file state schema invalid');
    return { version: doc.version as number, value: checkedOperational(doc.value) };
  };
  return {
    backend: 'file-fixture', lease, journal: privateFileJournal(path.join(options.root, 'journal')),
    read,
    cas: async (expected, value) => {
      const existing = await read(); if (existing.version !== expected) throw new Error('file state CAS conflict');
      const next = checkedOperational(value), temp = `${file}.${owner}.tmp`;
      try { fs.writeFileSync(temp, JSON.stringify({ schema: 1, version: expected + 1, value: next }), { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file); }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
      // Legacy mirror files are compatibility outputs, NOT the authoritative state after initialization.
      fs.writeFileSync(path.join(options.root, 'ledger.json'), JSON.stringify(next.ledger), { mode: 0o600 });
      fs.writeFileSync(path.join(options.root, 'history.jsonl'), next.history.map(e => JSON.stringify(e)).join('\n') + (next.history.length ? '\n' : ''), { mode: 0o600 });
      fs.writeFileSync(path.join(options.root, 'daily-state.json'), JSON.stringify(next.daily), { mode: 0o600 });
    },
    ...scratch(options.scratch, options.artifacts, options.cards, lease),
  };
}
export function redisSandboxState(options: { enabled?: boolean; state?: ReturnType<typeof createRedisOfferState>; scratch: string; artifacts: string; cards: Map<string, CardRecord>; seed: OperationalState }): OfferStateIO {
  if (options.enabled !== true || !options.state) throw new Error('explicit injected sandbox Redis adapter required; NO file fallback');
  const state = options.state, seed = checkedOperational(options.seed);
  return {
    backend: 'redis-sandbox', leaseTtlMs: state.ttlMs, lease: state.lease, journal: state.journal(),
    read: async () => { const doc = await state.read<OperationalState>('operational'); return { version: doc?.version ?? 0, value: doc ? checkedOperational(doc.value) : structuredClone(seed) }; },
    cas: async (version, value) => { await state.cas('operational', version, checkedOperational(value)); },
    ...scratch(options.scratch, options.artifacts, options.cards, state.lease),
  };
}
export async function updateOperational(io: OfferStateIO, transform: (value: OperationalState) => OperationalState) {
  const doc = await io.read(); const next = checkedOperational(transform(doc.value)); await io.cas(doc.version, next); return next;
}
