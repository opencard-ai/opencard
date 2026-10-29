import type { Queryable } from "./db";

export type TaskType = "link_check" | "fee_check" | "welcome_offer_check" | "status_check";

export const RESPONSE_SCHEMAS: Record<TaskType, Record<string, string>> = {
  link_check: { http_status: "integer", final_url: "string", is_official_redirect: "boolean" },
  fee_check: { annual_fee: "number", first_year_waived: "boolean" },
  welcome_offer_check: { bonus_amount: "number", bonus_unit: "string", spending_requirement: "number", time_period_months: "integer" },
  status_check: { status: "string" },
};

export interface PublicTask {
  task_id: string;
  type: TaskType;
  card_id: string;
  field: string;
  instructions_code: string;
  allowed_sources: string[];
  current_value: unknown;
  blind: boolean;
  response_schema: Record<string, string>;
  evidence_required: string[];
  expires_at: string;
}

// Explicit public column list. Never add is_gold or anything from the isolated answers table.
const PUBLIC_COLUMNS =
  "t.task_id, t.type, t.card_id, t.field, t.instructions_code, t.allowed_sources, t.current_value, t.blind, t.expires_at";

function toPublic(r: Record<string, unknown>): PublicTask {
  const type = r.type as TaskType;
  const blind = Boolean(r.blind);
  return {
    task_id: String(r.task_id),
    type,
    card_id: String(r.card_id),
    field: String(r.field),
    instructions_code: String(r.instructions_code),
    allowed_sources: Array.isArray(r.allowed_sources) ? (r.allowed_sources as string[]) : [],
    current_value: blind ? null : r.current_value ?? null,
    blind,
    response_schema: RESPONSE_SCHEMAS[type],
    evidence_required: ["url", "retrieved_at", "excerpt", "content_hash"],
    expires_at: new Date(r.expires_at as string | Date).toISOString(),
  };
}

/** Open, unexpired tasks this agent has not voted on yet. Gold tasks are mixed in indistinguishably. */
export async function pickTasks(q: Queryable, agentId: string, limit: number): Promise<PublicTask[]> {
  if (limit <= 0) return [];
  const { rows } = await q.query<Record<string, unknown>>(
    `SELECT ${PUBLIC_COLUMNS} FROM tasks t
      WHERE t.state = 'open' AND t.expires_at > now()
        AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.task_id = t.task_id AND v.agent_id = $1)
      ORDER BY random() LIMIT $2`,
    [agentId, limit],
  );
  return rows.map(toPublic);
}
