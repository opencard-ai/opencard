/** Independent audit-only Redis adapter. No client or credentials are included. */
import { AUDIT_DOC, type AuditStore, type Versioned } from './durable-baseline';

export interface EvalTransport { eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export function assertAuditStatePrefix(prefix: string, { allowProduction = false }: { allowProduction?: boolean } = {}) {
  if (prefix.includes('offer-state')) throw new Error('offer-state namespace forbidden');
  if (prefix === 'opencard:audit-state:{production}:') {
    if (allowProduction !== true) throw new Error('production requires allowProduction');
  } else if (!/^opencard:audit-state:\{sandbox-[a-z0-9-]{8,64}\}:$/.test(prefix)) throw new Error('invalid audit state prefix');
  return prefix;
}
export function auditStatePrefix(kind: 'sandbox' | 'production', id?: string) {
  if (kind !== 'sandbox' && kind !== 'production') throw new Error('invalid audit state kind');
  return assertAuditStatePrefix(`opencard:audit-state:{${kind === 'sandbox' ? `sandbox-${id}` : kind}}:`, { allowProduction: kind === 'production' });
}
const guard = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[2] then return {'LEASE_LOST'} end
`;
const scripts = {
  acquire: `if redis.call('EXISTS', KEYS[1]) == 1 then return {'BUSY'} end
local fence = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. fence, 'PX', ARGV[2])
return {'OK', tostring(fence)}`,
  assert: guard + `return {'OK'}`,
  renew: guard + `redis.call('PEXPIRE', KEYS[1], ARGV[3]); return {'OK'}`,
  release: guard + `redis.call('DEL', KEYS[1]); return {'OK'}`,
  read: guard + `local raw = redis.call('GET', KEYS[3]); if not raw then return {'ABSENT'} end; return {'OK', raw}`,
  cas: guard + `
local raw = redis.call('GET', KEYS[3])
local version = 0
if raw then
  local ok, old = pcall(cjson.decode, raw)
  if not ok or type(old) ~= 'table' or old.schema ~= 1 then return {'SCHEMA'} end
  version = old.version
end
if version ~= tonumber(ARGV[3]) then return {'CONFLICT'} end
local ok, doc = pcall(cjson.decode, ARGV[4])
if not ok or type(doc) ~= 'table' or doc.schema ~= 1 or doc.version ~= version + 1 or doc.fence ~= tonumber(ARGV[2]) then return {'SCHEMA'} end
redis.call('SET', KEYS[3], ARGV[4]); return {'OK', ARGV[4]}`,
};
export function createRedisAuditState({ enabled, prefix, transport, ttlMs = 60000, runnerId, allowProduction = false }: {
  enabled: boolean; prefix: string; transport: EvalTransport; ttlMs?: number; runnerId: string; allowProduction?: boolean;
}): AuditStore & { prefix: string } {
  if (enabled !== true) throw new Error('audit state must be enabled');
  assertAuditStatePrefix(prefix, { allowProduction });
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('invalid lease ttl');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runnerId)) throw new Error('invalid runner');
  let token: string | undefined, fence: number | undefined, lost = false;
  const keys = [prefix + 'lease', prefix + 'fence'];
  const docKey = (name: string) => { if (name !== AUDIT_DOC) throw new Error('invalid audit doc name'); return prefix + 'doc:' + name; };
  const available = () => { if (!token || lost) throw new Error('lease unavailable/lost'); };
  const call = async (script: string, ks: string[], args: string[]) => {
    if (ks.some(k => !k.startsWith(prefix))) throw new Error('namespace escape');
    let reply: unknown;
    try {
      reply = await transport.eval(script, ks, args);
      if (!Array.isArray(reply) || !reply.length || !reply.every(x => typeof x === 'string')) throw new Error('invalid reply');
    } catch { lost = true; throw new Error('state transport uncertain; lease unusable; reconcile with a new session'); }
    const result = reply as string[];
    if (result[0] === 'LEASE_LOST') lost = true;
    if (!['OK', 'ABSENT'].includes(result[0])) throw new Error(result[0]);
    return result;
  };
  const args = () => [token!, String(fence)];
  const validate = <T>(raw: string): Versioned<T> => {
    const doc = JSON.parse(raw) as Versioned<T>;
    if (!doc || doc.schema !== 1 || !Number.isSafeInteger(doc.version) || doc.version < 1 || !Number.isSafeInteger(doc.fence) || doc.fence < 1) throw new Error('unknown/corrupt state schema');
    return doc;
  };
  return {
    prefix,
    lease: {
      async acquire() {
        if (token || lost) throw new Error('new lease session required');
        const r = await call(scripts.acquire, keys, [runnerId, String(ttlMs)]);
        fence = Number(r[1]);
        if (!Number.isSafeInteger(fence) || fence < 1) { lost = true; throw new Error('state transport uncertain'); }
        token = `${runnerId}:${fence}`; return fence;
      },
      async assert() { available(); await call(scripts.assert, keys, args()); },
      async renew() { available(); await call(scripts.renew, keys, [...args(), String(ttlMs)]); },
      async release() {
        if (lost || !token) return false;
        try { await call(scripts.release, keys, args()); lost = true; return true; }
        catch (e) { if (lost && e instanceof Error && e.message === 'LEASE_LOST') return false; throw e; }
      },
      fencing: () => fence,
    },
    async read<T>(name: string) {
      const key = docKey(name); available();
      const r = await call(scripts.read, [...keys, key], args());
      return r[0] === 'ABSENT' ? null : validate<T>(r[1]);
    },
    async cas<T>(name: string, expectedVersion: number, value: T) {
      const key = docKey(name); available();
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('invalid CAS version');
      const doc = { schema: 1, version: expectedVersion + 1, fence, value };
      const r = await call(scripts.cas, [...keys, key], [...args(), String(expectedVersion), JSON.stringify(doc)]);
      return validate<T>(r[1]);
    },
  };
}
