/** Phase 0-1 knobs. Every value marked TBD in the spec is env-configurable with a conservative default. */
function intEnv(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return def;
  return n;
}

export const v1Config = {
  /** Closed beta: the whole /api/v1 surface 404s unless explicitly enabled. */
  enabled: () => process.env.V1_API_ENABLED === "true",
  /** Comma-separated invite codes required by POST /api/v1/agents. Empty = registration closed. */
  inviteCodes: () =>
    (process.env.V1_INVITE_CODES || "").split(",").map((s) => s.trim()).filter(Boolean),
  probationGrant: () => intEnv("V1_PROBATION_GRANT", 20, 0, 10000),
  taskReward: () => intEnv("V1_TASK_REWARD", 1, 0, 100),
  queryCost: 1,
  maxTasksAttached: () => intEnv("V1_MAX_TASKS_ATTACHED", 2, 0, 2),
  rateLimitPerMinute: () => intEnv("V1_RATE_LIMIT_PER_MIN", 60, 1, 10000),
  registerRateLimitPerHour: () => intEnv("V1_REGISTER_LIMIT_PER_HOUR", 5, 1, 1000),
  maxExcerptChars: () => intEnv("V1_MAX_EXCERPT_CHARS", 1000, 50, 20000),
  maxBodyBytes: 16 * 1024,
  /** Spec 12.4 leaves 402 vs 403 open; default to 402 as written in spec 7.2. */
  insufficientCreditsStatus: () => (process.env.V1_INSUFFICIENT_CREDITS_STATUS === "403" ? 403 : 402),
};
