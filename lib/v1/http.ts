import { v1Config } from "./config";
import { DbUnavailableError, type Queryable } from "./db";
import { hashesEqual, hashApiKey, isWellFormedKey, keyLookup } from "./keys";
import { v1RateLimit } from "./rate-limit";

export interface AuthedAgent {
  agent_id: string;
  agent_name: string;
  tier: string;
  score: number;
  gold_accuracy: number | null;
  tasks_completed: number;
}

export interface HeaderState {
  balance?: number;
  pending?: number;
  tier?: string;
  tasksAttached?: number;
  rateLimit?: { remaining: number; resetAt: number };
}

export function v1Headers(s: HeaderState): Headers {
  const h = new Headers();
  h.set("Cache-Control", "no-store");
  h.set("X-Credits-Cost", String(v1Config.queryCost));
  h.set("X-Credits-Balance", String(s.balance ?? 0));
  h.set("X-Credits-Pending", String(s.pending ?? 0));
  h.set("X-Reputation-Tier", s.tier ?? "none");
  h.set("X-Tasks-Attached", String(s.tasksAttached ?? 0));
  if (s.rateLimit) {
    h.set("X-RateLimit-Remaining", String(s.rateLimit.remaining));
    h.set("X-RateLimit-Reset", new Date(s.rateLimit.resetAt).toISOString());
  }
  return h;
}

export function v1Json(body: unknown, status: number, s: HeaderState = {}): Response {
  return Response.json(body, { status, headers: v1Headers(s) });
}

export function v1Error(status: number, error: string, s: HeaderState = {}, extra: Record<string, unknown> = {}): Response {
  return v1Json({ error, ...extra }, status, s);
}

export function notEnabled(): Response | null {
  return v1Config.enabled() ? null : v1Error(404, "not_found");
}

/** Logs only the error class/code, never messages (pg messages can contain row values). */
export function internalError(err: unknown): Response {
  if (err instanceof DbUnavailableError) return v1Error(503, "service_unavailable");
  const name = err instanceof Error ? err.name : "unknown";
  const code = (err as { code?: unknown } | null)?.code;
  console.error(`[api/v1] internal error: ${name}${typeof code === "string" ? ` code=${code}` : ""}`);
  return v1Error(500, "internal_error");
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function authenticate(req: Request, q: Queryable): Promise<AuthedAgent | null> {
  const header = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m || !isWellFormedKey(m[1])) return null;
  const key = m[1];
  const { rows } = await q.query<AuthedAgent & { api_key_hash: string }>(
    `SELECT agent_id, agent_name, tier, score, gold_accuracy, tasks_completed, api_key_hash
       FROM agents WHERE api_key_prefix = $1`,
    [keyLookup(key)],
  );
  const row = rows[0];
  if (!row || !hashesEqual(row.api_key_hash, hashApiKey(key))) return null;
  return {
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    tier: row.tier,
    score: Number(row.score),
    gold_accuracy: row.gold_accuracy === null ? null : Number(row.gold_accuracy),
    tasks_completed: Number(row.tasks_completed),
  };
}

export function agentRateLimit(agentId: string) {
  return v1RateLimit(`agent:${agentId}`, v1Config.rateLimitPerMinute(), 60_000);
}

export async function readJsonBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > v1Config.maxBodyBytes) return { ok: false, status: 413, error: "payload_too_large" };
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > v1Config.maxBodyBytes) return { ok: false, status: 413, error: "payload_too_large" };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
