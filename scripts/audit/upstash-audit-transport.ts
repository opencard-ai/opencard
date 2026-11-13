/** Opt-in Upstash SDK wiring for the independent audit-only state adapter (sandbox only).
 * - Never used unless OPENCARD_AUDIT_DURABLE=sandbox-redis:<id> is set explicitly.
 * - Production prefix is refused here (no allowProduction path is exposed).
 * - No retries (an ambiguous write must surface as "uncertain", never be replayed).
 * - Raw replies (no automatic JSON deserialization) so the adapter validates string arrays itself.
 * - Credentials come only from the caller-provided env object and are never logged. */
import { Redis } from '@upstash/redis';
import { createRedisAuditState, auditStatePrefix, type EvalTransport } from './audit-state';
import type { AuditStore } from './durable-baseline';

type RedisCtor = new (cfg: Record<string, unknown>) => { eval(script: string, keys: string[], args: string[]): Promise<unknown> };
const UPSTASH = /^https:\/\/[a-z0-9-]{1,63}\.upstash\.io$/;
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;

export function validateAuditRedisUrl(url: unknown, { allowLoopback = false } = {}) {
  if (typeof url !== 'string' || !(UPSTASH.test(url) || (allowLoopback === true && LOOPBACK.test(url)))) throw new Error('invalid audit redis url');
  return url;
}
export function createUpstashEvalTransport({ url, token, allowLoopback = false, RedisClass = Redis as unknown as RedisCtor }: {
  url: unknown; token: unknown; allowLoopback?: boolean; RedisClass?: RedisCtor;
}): EvalTransport {
  validateAuditRedisUrl(url, { allowLoopback });
  if (typeof token !== 'string' || token.length < 8 || /\s/.test(token)) throw new Error('invalid audit redis token');
  const client = new RedisClass({ url, token, automaticDeserialization: false, retry: { retries: 0, backoff: () => 0 }, enableTelemetry: false, latencyLogging: false, enableAutoPipelining: false });
  // NOTE: @upstash/redis treats `retry: false` as one extra attempt; `retries: 0` is the only single-shot setting.
  // Never surface SDK error text (could echo request data); the adapter maps any throw to "uncertain".
  return { eval: async (script, keys, args) => { try { return await client.eval(script, keys, args); } catch { throw new Error('transport error'); } } };
}
export function parseSandboxSpec(spec: string) {
  const m = /^sandbox-redis:([a-z0-9-]{8,64})$/.exec(spec);
  if (!m) throw new Error('invalid sandbox-redis spec');
  return auditStatePrefix('sandbox', m[1]);
}
/** Build an audit-only sandbox store from explicit env. Any production-looking request is refused. */
export function sandboxAuditStoreFromEnv(env: NodeJS.ProcessEnv, runnerId: string, opts: { allowLoopback?: boolean; RedisClass?: RedisCtor } = {}): AuditStore & { prefix: string } {
  const spec = env.OPENCARD_AUDIT_DURABLE ?? '';
  if (/production/i.test(spec)) throw new Error('production audit state is not enabled');
  const prefix = parseSandboxSpec(spec);
  const transport = createUpstashEvalTransport({ url: env.OPENCARD_AUDIT_REDIS_URL, token: env.OPENCARD_AUDIT_REDIS_TOKEN, ...opts });
  return createRedisAuditState({ enabled: true, prefix, transport, runnerId });
}
