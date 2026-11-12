/** Test-only atomic EVAL model: no server, SDK request, env or socket. Not a Lua interpreter. */
import { STATE_SCRIPTS, type EvalTransport } from './redis-state';
export function mockRedis() {
  const values = new Map<string, string>(), deadlines = new Map<string, number>();
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  let now = 0, failMidImport = false;
  let failNext: { operation: keyof typeof STATE_SCRIPTS; after: boolean } | undefined;
  const get = (key: string) => { if (deadlines.has(key) && deadlines.get(key)! <= now) { values.delete(key); deadlines.delete(key); } return values.get(key); };
  const set = (key: string, value: string) => { values.set(key, value); deadlines.delete(key); };
  const del = (key: string) => { values.delete(key); deadlines.delete(key); };
  const execute = (operation: keyof typeof STATE_SCRIPTS, k: string[], a: string[]): string[] => {
    if (operation === 'acquire') {
      if (get(k[0])) return ['BUSY'];
      const fence = Number(get(k[1]) ?? 0) + 1; set(k[1], String(fence)); set(k[0], `${a[0]}:${fence}`); deadlines.set(k[0], now + Number(a[1])); return ['OK', String(fence), `${a[0]}:${fence}`];
    }
    if (get(k[0]) !== a[0] || get(k[1]) !== a[1]) return ['LEASE_LOST'];
    if (operation === 'assert') return ['OK'];
    if (operation === 'renew') { deadlines.set(k[0], now + Number(a[2])); return ['OK']; }
    if (operation === 'release') { del(k[0]); return ['OK']; }
    if (operation === 'read') { if (get(k[3])?.startsWith('import:')) return ['IMPORT_PENDING']; const v = get(k[2]); return v === undefined ? ['ABSENT'] : ['OK', v]; }
    if (operation === 'cas') {
      const mode = get(k[3]); if (mode?.startsWith('import:')) return ['IMPORT_PENDING'];
      const old = get(k[2]), parsed = old ? JSON.parse(old) : { version: 0, schema: 1 };
      if (parsed.schema !== 1) return ['SCHEMA']; if (parsed.version !== Number(a[2])) return ['CONFLICT'];
      const next = JSON.parse(a[3]); if (next.schema !== 1 || next.version !== parsed.version + 1 || next.fence !== Number(a[1])) return ['SCHEMA'];
      set(k[2], a[3]); if (!mode) set(k[3], 'normal'); return ['OK'];
    }
    if (operation === 'claim') {
      const mode = get(k[2]); if (mode?.startsWith('import:')) return ['IMPORT_PENDING'];
      for (const key of k.slice(3)) { const old = get(key); if (old && (JSON.parse(old).schema !== 1 || JSON.parse(old).value !== a[2])) return ['CLAIMED']; }
      for (const key of k.slice(3)) set(key, JSON.stringify({ schema: 1, version: 1, fence: Number(a[1]), value: a[2] }));
      if (!mode) set(k[2], 'normal'); return ['OK'];
    }
    if (operation === 'releaseClaims') {
      for (const key of k.slice(2)) { const old = get(key); if (old && JSON.parse(old).value !== a[2]) return ['CLAIMED']; }
      k.slice(2).forEach(del); return ['OK'];
    }
    if (operation === 'reserveImport') {
      const mode = get(k[2]); if (mode === `restored:${a[2]}`) return ['COMPLETE'];
      if (mode && mode !== `import:${a[2]}`) return ['NOT_EMPTY'];
      if (!mode) set(k[2], `import:${a[2]}`); return ['OK'];
    }
    if (operation === 'finishImport') {
      const mode = get(k[2]); if (mode === `restored:${a[2]}`) return ['COMPLETE']; if (mode !== `import:${a[2]}`) return ['NOT_RESERVED'];
      for (let i = 3; i < k.length; i++) { const doc = JSON.parse(a[i]); if (doc.schema !== 1 || doc.version !== 1 || doc.fence !== Number(a[1]) || doc.importDigest !== a[2]) return ['SCHEMA']; const raw = get(k[i]); if (raw) { const old = JSON.parse(raw); if (old.schema !== 1 || old.version !== 1 || old.importDigest !== a[2] || old.valueDigest !== doc.valueDigest) return ['NOT_EMPTY']; } }
      for (let i = 3; i < k.length; i++) { if (get(k[i]) === undefined) set(k[i], a[i]); if (failMidImport) { failMidImport = false; throw new Error('fixture partial Lua write'); } } set(k[2], `restored:${a[2]}`); return ['OK'];
    }
    throw new Error('unhandled atomic mock');
  };
  const transport: EvalTransport = { eval: async (script, keys, args) => {
    calls.push({ script, keys, args });
    const operation = (Object.keys(STATE_SCRIPTS) as Array<keyof typeof STATE_SCRIPTS>).find(key => STATE_SCRIPTS[key] === script);
    if (!operation) throw new Error('unknown script');
    const failure = failNext?.operation === operation ? failNext : undefined; if (failure) failNext = undefined;
    if (failure && !failure.after) throw new Error('fixture timeout before EVAL');
    const result = execute(operation, keys, args); if (failure?.after) throw new Error('fixture timeout after EVAL'); return result;
  } };
  return { transport, calls, values, get, set, partialImportFailure: () => { failMidImport = true; }, advance: (ms: number) => { now += ms; }, fail: (operation: keyof typeof STATE_SCRIPTS, after = false) => { failNext = { operation, after }; } };
}
