/** Opt-in, sandbox-namespaced durable state. No env loading, timers or network at import. */
import { Redis } from '@upstash/redis';
import { assertSandboxPrefix } from './state-namespace';
export { assertSandboxPrefix } from './state-namespace';
import { createHash, randomUUID } from 'node:crypto';
import { validateJournalMetadata, type OfferJournal, type OfferJournalStore } from './publish-journal';
export interface EvalTransport { eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export interface LeaseGuard { assert(): Promise<void> }
export interface Versioned<T> { schema: 1; version: number; fence: number; value: T }
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
// Official Upstash EVAL is atomic. All accessed keys are declared, no dynamic key discovery.
// No allow-key-locking flag is required; the documented default is a global script lock.
const guard = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[2] then return {'LEASE_LOST'} end
`;
export const STATE_SCRIPTS = {
  acquire: `-- offer-state/acquire-v1
if redis.call('GET', KEYS[1]) then return {'BUSY'} end
local n = redis.call('INCR', KEYS[2])
local token = ARGV[1] .. ':' .. tostring(n)
redis.call('SET', KEYS[1], token, 'PX', ARGV[2])
return {'OK', tostring(n), token}`,
  assert: `-- offer-state/assert-v1\n${guard}\nreturn {'OK'}`,
  renew: `-- offer-state/renew-v1\n${guard}\nredis.call('PEXPIRE', KEYS[1], ARGV[3]); return {'OK'}`,
  release: `-- offer-state/release-v1\n${guard}\nredis.call('DEL', KEYS[1]); return {'OK'}`,
  read: `-- offer-state/read-v1\n${guard}
local mode = redis.call('GET', KEYS[4]); if mode and string.sub(mode, 1, 7) == 'import:' then return {'IMPORT_PENDING'} end
local v = redis.call('GET', KEYS[3]); if not v then return {'ABSENT'} end
return {'OK', v}`,
  cas: `-- offer-state/cas-v1\n${guard}
local mode = redis.call('GET', KEYS[4])
if mode and string.sub(mode, 1, 7) == 'import:' then return {'IMPORT_PENDING'} end
local old = redis.call('GET', KEYS[3]); local version = 0
if old then local parsed = cjson.decode(old); if parsed.schema ~= 1 then return {'SCHEMA'} end; version = parsed.version end
if version ~= tonumber(ARGV[3]) then return {'CONFLICT'} end
local next = cjson.decode(ARGV[4])
if next.schema ~= 1 or next.version ~= version + 1 or next.fence ~= tonumber(ARGV[2]) then return {'SCHEMA'} end
redis.call('SET', KEYS[3], ARGV[4]); if not mode then redis.call('SET', KEYS[4], 'normal') end
return {'OK'}`,
  claim: `-- offer-state/claim-v1\n${guard}
local mode = redis.call('GET', KEYS[3]); if mode and string.sub(mode, 1, 7) == 'import:' then return {'IMPORT_PENDING'} end
for i = 4, #KEYS do local owner = redis.call('GET', KEYS[i]); if owner then local claim = cjson.decode(owner); if claim.schema ~= 1 or claim.value ~= ARGV[3] then return {'CLAIMED'} end end end
local claim = cjson.encode({schema=1,version=1,fence=tonumber(ARGV[2]),value=ARGV[3]})
for i = 4, #KEYS do redis.call('SET', KEYS[i], claim) end
if not mode then redis.call('SET', KEYS[3], 'normal') end
return {'OK'}`,
  releaseClaims: `-- offer-state/release-claims-v1\n${guard}
for i = 3, #KEYS do local raw = redis.call('GET', KEYS[i]); if raw and cjson.decode(raw).value ~= ARGV[3] then return {'CLAIMED'} end end
for i = 3, #KEYS do redis.call('DEL', KEYS[i]) end
return {'OK'}`,
  reserveImport: `-- offer-state/reserve-import-v1\n${guard}
local mode = redis.call('GET', KEYS[3]); local pending = 'import:' .. ARGV[3]
if mode == 'restored:' .. ARGV[3] then return {'COMPLETE'} end
if mode and mode ~= pending then return {'NOT_EMPTY'} end
if not mode then redis.call('SET', KEYS[3], pending) end
return {'OK'}`,
  finishImport: `-- offer-state/finish-import-v1\n${guard}
local mode = redis.call('GET', KEYS[3])
if mode == 'restored:' .. ARGV[3] then return {'COMPLETE'} end
if mode ~= 'import:' .. ARGV[3] then return {'NOT_RESERVED'} end
-- Validate ALL documents and destinations before the first data write (Lua errors do not roll back writes).
for i = 4, #KEYS do
 local doc = cjson.decode(ARGV[i]); if doc.schema ~= 1 or doc.version ~= 1 or doc.fence ~= tonumber(ARGV[2]) or doc.importDigest ~= ARGV[3] then return {'SCHEMA'} end
 local old = redis.call('GET', KEYS[i]); if old then local prev = cjson.decode(old); if prev.schema ~= 1 or prev.version ~= 1 or prev.importDigest ~= ARGV[3] or prev.valueDigest ~= doc.valueDigest then return {'NOT_EMPTY'} end end
end
for i = 4, #KEYS do if redis.call('EXISTS', KEYS[i]) == 0 then redis.call('SET', KEYS[i], ARGV[i]) end end
redis.call('SET', KEYS[3], 'restored:' .. ARGV[3]); return {'OK'}`,
} as const;
export function createRedisOfferState(options: { enabled?: boolean; prefix: string; transport: EvalTransport; ttlMs?: number; runnerId?: string }) {
  if (options.enabled !== true) throw new Error('Redis state disabled');
  assertSandboxPrefix(options.prefix);
  const ttlMs = options.ttlMs ?? 60000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('lease TTL out of bounds');
  const runner = options.runnerId ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runner)) throw new Error('invalid runner identity');
  const prefix = options.prefix, leaseKey = `${prefix}lease`, fenceKey = `${prefix}fence`, modeKey = `${prefix}mode`;
  let token: string | undefined, fence: number | undefined, lost = false;
  const invoke = async (script: string, keys: string[], args: string[]) => {
    if (!keys.every(k => k.startsWith(prefix))) throw new Error('namespace escape');
    try {
      const reply = await options.transport.eval(script, keys, args);
      if (!Array.isArray(reply) || !reply.every(v => typeof v === 'string')) throw new Error();
      if (reply[0] === 'LEASE_LOST') lost = true;
      return reply as string[];
    } catch { lost = true; throw new Error('state transport uncertain; lease unusable; reconcile with a new session'); }
  };
  const args = () => { if (!token || !fence || lost) throw new Error('lease unavailable/lost'); return [token, String(fence)]; };
  const success = (reply: string[]) => { if (reply[0] !== 'OK') throw new Error(`state refused: ${reply[0]}`); };
  const docKey = (name: string) => { if (!/^(operational|journal-[0-9a-f]{64})$/.test(name)) throw new Error('document not allowed'); return `${prefix}doc:${name}`; };
  const api = {
    prefix, ttlMs,
    lease: {
      acquire: async () => {
        if (token || lost) throw new Error('new lease session required');
        const r = await invoke(STATE_SCRIPTS.acquire, [leaseKey, fenceKey], [runner, String(ttlMs)]); success(r);
        fence = Number(r[1]); token = r[2];
        if (!Number.isSafeInteger(fence) || fence < 1 || token !== `${runner}:${fence}`) { lost = true; throw new Error('invalid fencing receipt'); }
        return fence;
      },
      assert: async () => success(await invoke(STATE_SCRIPTS.assert, [leaseKey, fenceKey], args())),
      renew: async () => success(await invoke(STATE_SCRIPTS.renew, [leaseKey, fenceKey], [...args(), String(ttlMs)])),
      release: async () => { if (lost || !token) return false; const r = await invoke(STATE_SCRIPTS.release, [leaseKey, fenceKey], args()); lost = true; return r[0] === 'OK'; },
      fencing: () => fence,
    },
    read: async <T>(name: string): Promise<Versioned<T> | null> => {
      const r = await invoke(STATE_SCRIPTS.read, [leaseKey, fenceKey, docKey(name), modeKey], args());
      if (r[0] === 'ABSENT') return null; success(r);
      const doc = JSON.parse(r[1]) as Versioned<T>;
      if (doc.schema !== 1 || !Number.isSafeInteger(doc.version) || doc.version < 1 || !Number.isSafeInteger(doc.fence) || doc.fence < 1) throw new Error('unknown/corrupt state schema');
      return doc;
    },
    cas: async <T>(name: string, expectedVersion: number, value: T) => {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('invalid CAS version');
      const auth = args(), doc: Versioned<T> = { schema: 1, version: expectedVersion + 1, fence: Number(auth[1]), value };
      const body = JSON.stringify(doc); if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('state document too large');
      success(await invoke(STATE_SCRIPTS.cas, [leaseKey, fenceKey, docKey(name), modeKey], [...auth, String(expectedVersion), body]));
      return doc;
    },
    importIntoNewNamespace: async (digest: string, documents: Record<string, unknown>, confirmNewSandbox: boolean) => {
      if (confirmNewSandbox !== true || !/^[0-9a-f]{64}$/.test(digest) || !Object.hasOwn(documents, 'operational')) throw new Error('validated snapshot and explicit new sandbox confirmation required');
      const names = Object.keys(documents).sort();
      if (names.length > 301) throw new Error('import size bound');
      const keys = names.map(name => /^claim-[0-9a-f]{64}$/.test(name) ? `${prefix}claim:${name.slice(6)}` : docKey(name)), auth = args();
      const encoded = names.map(name => JSON.stringify({ schema: 1, version: 1, fence: Number(auth[1]), importDigest: digest, valueDigest: hash(JSON.stringify(documents[name])), value: documents[name] }));
      if (encoded.reduce((size, body) => size + Buffer.byteLength(body), 0) > 2 * 1024 * 1024) throw new Error('import too large');
      const reservation = await invoke(STATE_SCRIPTS.reserveImport, [leaseKey, fenceKey, modeKey], [...auth, digest]);
      if (reservation[0] === 'COMPLETE') return 'already-imported'; success(reservation);
      const r = await invoke(STATE_SCRIPTS.finishImport, [leaseKey, fenceKey, modeKey, ...keys], [...args(), digest, ...encoded]);
      if (r[0] !== 'COMPLETE') success(r);
      return r[0] === 'COMPLETE' ? 'already-imported' : 'imported';
    },
    journal(): OfferJournalStore {
      const versions = new Map<string, number>();
      return {
        load: async runId => { const doc = await api.read<OfferJournal>(`journal-${hash(runId)}`); const value = doc ? validateJournalMetadata(doc.value, runId) : null; versions.set(runId, doc?.version ?? 0); return value; },
        claim: async (fingerprints, runId) => {
          if (!fingerprints.length || fingerprints.length > 100 || !/^[A-Za-z0-9_-]{1,100}$/.test(runId)) throw new Error('claim input invalid');
          success(await invoke(STATE_SCRIPTS.claim, [leaseKey, fenceKey, modeKey, ...fingerprints.map(fp => `${prefix}claim:${hash(fp)}`)], [...args(), runId]));
        },
        releaseClaims: async (fingerprints, runId) => {
          success(await invoke(STATE_SCRIPTS.releaseClaims, [leaseKey, fenceKey, ...fingerprints.map(fp => `${prefix}claim:${hash(fp)}`)], [...args(), runId]));
        },
        save: async journal => {
          validateJournalMetadata(journal);
          const version = versions.get(journal.runId); if (version === undefined) throw new Error('load journal before CAS');
          const saved = await api.cas(`journal-${hash(journal.runId)}`, version, journal); versions.set(journal.runId, saved.version);
        },
      };
    },
  };
  return api;
}
/** Credentials are explicit caller inputs. No fromEnv, no existing website Redis credentials reused. */
export function createUpstashOfferState(options: { enabled?: boolean; prefix: string; url: string; token: string; ttlMs?: number; runnerId?: string }) {
  if (options.enabled !== true) throw new Error('Redis state disabled');
  assertSandboxPrefix(options.prefix);
  if (!/^https:\/\/[a-z0-9-]+\.upstash\.io\/?$/.test(options.url) || !options.token) throw new Error('explicit Upstash endpoint and restricted credential required');
  const redis = new Redis({ url: options.url, token: options.token, retry: false, automaticDeserialization: false, enableAutoPipelining: false, signal: () => AbortSignal.timeout(10000) });
  return createRedisOfferState({ ...options, transport: { eval: (script, keys, args) => redis.eval(script, keys, args) } });
}
