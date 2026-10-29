/**
 * Per-key fixed-window limiter for /api/v1 (per-instance, in-memory).
 * Separate from lib/rate-limit.ts so the existing IP limiter is untouched and
 * no module-level timer keeps test processes alive. Cross-instance store is a KC decision.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function v1RateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
  let entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count++;
  return {
    allowed: entry.count <= max,
    remaining: Math.max(0, max - entry.count),
    resetAt: entry.resetAt,
  };
}

export function resetV1RateLimitForTesting(): void {
  buckets.clear();
}
