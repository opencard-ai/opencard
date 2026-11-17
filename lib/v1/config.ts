/** TODO(beta): all policy defaults below are PLACEHOLDERS, not measured statistics.
 * Resolve spec §§0/12 TBDs after closed-beta observation. This is the single policy module. */
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
  maxExcerptChars: () => intEnv("V1_MAX_EXCERPT_CHARS", 300, 50, 20000),
  honeypotPercent: () => intEnv("V1_HONEYPOT_PERCENT", 15, 10, 20),
  numericTolerance: () => intEnv("V1_NUMERIC_TOLERANCE", 0, 0, 10000),
  confidencePercent: () => intEnv("V1_CONFIDENCE_PERCENT", 50, 50, 100),
  freeQuota: () => intEnv("V1_FREE_QUOTA", 0, 0, 0), // TODO: quota/reset policy; disabled for beta.
  taskTtlMinutes: () => intEnv("V1_TASK_TTL_MIN", 1440, 1, 525600),
  goldTtlMinutes: () => intEnv("V1_GOLD_TTL_MIN", 1440, 1, 525600),
  evidenceMaxAgeMs: 7 * 24 * 3600_000,
  evidenceClockSkewMs: 5 * 60_000,
  initialScore: 0.5, // probation's low score IS its frozen votes.weight
  statusCheckEnabled: () => process.env.V1_STATUS_CHECK_ENABLED === "true",
  /** How long a task handed out by GET /cards stays answerable by that agent. */
  assignmentTtlMinutes: () => intEnv("V1_ASSIGNMENT_TTL_MIN", 60, 1, 7 * 24 * 60),
  maxBodyBytes: 16 * 1024,
  /** Spec 12.4 leaves 402 vs 403 open; default to 402 as written in spec 7.2. */
  insufficientCreditsStatus: () => (process.env.V1_INSUFFICIENT_CREDITS_STATUS === "403" ? 403 : 402),
};

/** Placeholder tier/reputation policy; trusted promotion remains manual pending beta evidence. */
export const DEFAULT_TIER_CONFIG = {
  standard_min_gold: 3,
  standard_min_accuracy: 0.8,
  restrict_min_gold: 2,
  restrict_below_accuracy: 0.5,
  score_gold_pass: 0.05,
  score_gold_fail: -0.1,
  score_agree: 0.02,
  score_disagree: -0.05,
};
export type TierConfig = typeof DEFAULT_TIER_CONFIG;
