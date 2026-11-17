import type { Queryable } from "./db";
import { v1Config } from "./config";
import { newId } from "./keys";
import { urlMatchesWhitelist } from "./verify-validate";

export type TaskType = "link_check" | "fee_check" | "welcome_offer_check" | "status_check";
export const RESPONSE_SCHEMAS: Record<TaskType, Record<string, string>> = {
  link_check: { http_status: "integer", final_url: "string", is_official_redirect: "boolean" },
  fee_check: { annual_fee: "number", first_year_waived: "boolean" },
  welcome_offer_check: { bonus_amount: "number", bonus_unit: "string", spending_requirement: "number", time_period_months: "integer" },
  status_check: { status: "string" },
};
export const INSTRUCTIONS: Record<TaskType, string> = {
  link_check: "CHECK_SOURCE_URL_STATUS_AND_REDIRECT",
  fee_check: "READ_ANNUAL_FEE_FROM_PUBLIC_OFFICIAL_PAGE",
  welcome_offer_check: "READ_PUBLIC_WELCOME_OFFER_LOGGED_OUT",
  status_check: "CHECK_PUBLIC_OFFICIAL_APPLICATION_STATUS",
};
export interface PublicTask {
  task_id: string;
  card_id: string;
  field: string;
  type: TaskType;
  instructions_code: string;
  allowed_sources: string[];
  current_value: unknown;
  blind: boolean;
  response_schema: Record<string, string>;
  evidence_required: string[];
  expires_at: string;
}

export interface SourceRule { issuer?: string; pattern: string; fields: string[]; kind: string; dispatchable: boolean }
export function permittedSources(sources: string[], field: string, rules: SourceRule[]): string[] {
  const normalizedField = field.replace(/\[\d+\]/g, "[]");
  return sources.filter((url) => rules.some((r) => r.kind === "official" && r.dispatchable &&
    r.fields.includes(normalizedField) && urlMatchesWhitelist(url, [r.pattern])));
}

/** Run within a transaction. Lock each task before reserving one of its three independent seats.
 * Bernoulli sampling targets the configured gold fraction across dispatches, not each 0–2-task response.
 * Empty selected pools yield fewer tasks; no fallback that silently changes the gold fraction.
 */
export async function pickTasks(q: Queryable, agentId: string, limit: number, random = Math.random, network: string | null = null): Promise<PublicTask[]> {
  const tasks: PublicTask[] = [];
  if (limit <= 0) return tasks;
  const agent = await q.query<{ tier: string }>(`SELECT tier FROM agents WHERE agent_id = $1`, [agentId]);
  const rules = (await q.query<SourceRule>(`SELECT pattern, fields, kind, dispatchable FROM sources_whitelist`)).rows;
  for (let i = 0; i < Math.min(limit, 2); i++) {
    const gold = random() * 100 < v1Config.honeypotPercent();
    const { rows } = await q.query<{
      task_id: string; card_id: string; field: string; type: TaskType; allowed_sources: string[];
      blind: boolean; current_value: unknown; expires_at: Date | string;
    }>(
      `SELECT t.task_id, t.card_id, t.field, t.type, t.allowed_sources, t.blind, t.current_value, t.expires_at
         FROM tasks t WHERE t.state = 'open' AND t.expires_at > now() AND t.is_gold = $2
           AND (t.type <> 'status_check' OR $3)
           AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.task_id = t.task_id AND v.agent_id = $1)
           AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.task_id AND a.agent_id = $1 AND a.expires_at > now())
           AND (SELECT COUNT(*) FROM votes v WHERE v.task_id = t.task_id AND v.outcome <> 'unable') +
               (SELECT COUNT(*) FROM task_assignments a WHERE a.task_id = t.task_id AND a.expires_at > now()
                 AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.task_id = t.task_id AND v.agent_id = a.agent_id)) < 3
         ORDER BY CASE WHEN $5::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM task_assignments a WHERE a.task_id = t.task_id AND a.agent_id <> $1
             AND a.network_group = $5 AND (a.expires_at > now() OR EXISTS
               (SELECT 1 FROM votes v WHERE v.task_id = t.task_id AND v.agent_id = a.agent_id AND v.outcome <> 'unable'))) THEN 1 ELSE 0 END,
           CASE WHEN $4 AND t.type = 'link_check' THEN 0 ELSE 1 END, random()
         FOR UPDATE OF t SKIP LOCKED`,
      [agentId, gold, v1Config.statusCheckEnabled(), agent.rows[0]?.tier === "probation", network],
    );
    for (const r of rows) {
      const allowed = permittedSources(r.allowed_sources, r.field, rules);
      if (!allowed.length) continue;
      const expires = new Date(Math.min(new Date(r.expires_at).getTime(), Date.now() + v1Config.assignmentTtlMinutes() * 60_000)).toISOString();
      await q.query(
        `INSERT INTO task_assignments (assignment_id, task_id, agent_id, expires_at, network_group)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (task_id, agent_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, network_group = EXCLUDED.network_group`,
        [newId("as"), r.task_id, agentId, expires, network],
      );
      tasks.push({ task_id: r.task_id, card_id: r.card_id, field: r.field, type: r.type,
        instructions_code: INSTRUCTIONS[r.type], allowed_sources: allowed, blind: r.blind,
        current_value: r.blind ? null : r.current_value, response_schema: RESPONSE_SCHEMAS[r.type],
        evidence_required: ["url", "retrieved_at", "excerpt", "content_hash"], expires_at: expires });
      break;
    }
  }
  return tasks;
}
