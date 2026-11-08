/** Fixture-only single-host store. Each operation locks, reloads, and atomically replaces JSON. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AUDIT_DOC, FakeBackend, createFakeAuditStore, type AuditStore } from './durable-baseline';

/** `faultAfterCasCommit` is a fixture-only fault: the CAS is persisted, then reported as uncertain. */
export function createFileAuditStore(dir: string, runnerId: string, ttlMs = 60000, opts: { faultAfterCasCommit?: boolean } = {}): AuditStore {
  const real = fs.realpathSync(dir), repo = fs.realpathSync(process.cwd());
  if (!fs.statSync(real).isDirectory() || real === repo || real.startsWith(repo + path.sep)) throw new Error('fixture store requires an existing directory outside the repo');
  const file = path.join(real, 'audit-state.json'), lock = path.join(real, 'audit-state.lock');
  const backend = new FakeBackend(), store = createFakeAuditStore(backend, runnerId, ttlMs);
  let lost = false;
  async function operation<T>(fn: () => Promise<T>): Promise<T> {
    if (lost) throw new Error('lease unavailable/lost');
    const start = Date.now();
    let fd: number;
    for (;;) {
      try { fd = fs.openSync(lock, 'wx'); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() - start >= 5000) throw e;
        await new Promise(r => setTimeout(r, 10));
      }
    }
    let tmp: string | undefined;
    const uncertain = (e: unknown): never => {
      lost = true; throw new Error('state transport uncertain; reconcile with a new session', { cause: e });
    };
    try {
      try {
        if (fs.existsSync(file)) {
          if (!fs.lstatSync(file).isFile()) throw new Error('fixture state must be a regular file');
          const state = JSON.parse(fs.readFileSync(file, 'utf8'));
          backend.fence = state.fence; backend.lease = state.lease; backend.docs = new Map(Object.entries(state.docs));
        }
      } catch (e) { uncertain(e); }
      backend.now = Date.now();
      const result = await fn();
      try {
        tmp = path.join(real, `.audit-state-${randomUUID()}.tmp`);
        fs.writeFileSync(tmp, JSON.stringify({ fence: backend.fence, lease: backend.lease, docs: Object.fromEntries(backend.docs) }), { flag: 'wx' });
        fs.renameSync(tmp, file);
      } catch (e) { uncertain(e); }
      return result;
    } finally {
      if (tmp) fs.rmSync(tmp, { force: true });
      fs.closeSync(fd); fs.unlinkSync(lock);
    }
  }
  const nameCheck = (name: string) => { if (name !== AUDIT_DOC) throw new Error('invalid audit doc name'); };
  return {
    lease: {
      acquire: () => operation(() => store.lease.acquire()),
      assert: () => operation(() => store.lease.assert()),
      renew: () => operation(() => store.lease.renew()),
      release: () => lost ? Promise.resolve(false) : operation(() => store.lease.release()),
      fencing: () => store.lease.fencing(),
    },
    read<T>(name: string) { nameCheck(name); return operation(() => store.read<T>(name)); },
    async cas<T>(name: string, version: number, value: T) {
      nameCheck(name);
      const r = await operation(() => store.cas(name, version, value));
      if (opts.faultAfterCasCommit) { lost = true; throw new Error('state transport uncertain; injected fixture fault after commit'); }
      return r;
    },
  };
}
