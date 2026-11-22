/** Privileged pipeline boundary: url-check/weekly/db-audit/card-adaptor/scraper can submit
 * field-level signals here. Never writes card JSON and never accepts gold answers. */
import type { Queryable } from "../v1/db";
import { v1Config } from "../v1/config";
import { newId } from "../v1/keys";
import { INSTRUCTIONS, permittedSources, type SourceRule, type TaskType } from "../v1/tasks";
import { validateResult } from "../v1/verify-validate";

const FIELDS: Record<TaskType, RegExp> = {
  link_check: /^sources\[(?:\d*)\]\.url$/,
  fee_check: /^annual_fee$/,
  welcome_offer_check: /^welcome_offer$/,
  status_check: /^status$/,
};
const ORIGINS = ["url-check", "weekly", "db-audit", "card-adaptor", "scraper", "manual"];
export interface TaskSignal {
  card_id: string; field: string; type: TaskType; origin: string; allowed_sources: string[];
  blind: boolean; current_value: unknown;
}
export async function ingestTask(q: Queryable, signal: TaskSignal): Promise<boolean> {
  if (!signal || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(signal.card_id) ||
      !Object.hasOwn(FIELDS, signal.type) || !FIELDS[signal.type].test(signal.field) ||
      !ORIGINS.includes(signal.origin) || typeof signal.blind !== "boolean" ||
      !Array.isArray(signal.allowed_sources) || !signal.allowed_sources.every((s) => typeof s === "string")) throw new Error("invalid task signal");
  if (signal.type === "status_check" && !v1Config.statusCheckEnabled()) return false;
  if (signal.current_value != null && signal.type !== "link_check" &&
      (typeof signal.current_value !== "object" || validateResult(signal.type, signal.current_value as Record<string, unknown>).length)) throw new Error("invalid current value");
  const rules = (await q.query<SourceRule>(`SELECT pattern, fields, kind, dispatchable FROM sources_whitelist`)).rows;
  const allowed = permittedSources(signal.allowed_sources, signal.field, rules);
  if (!allowed.length) return false;
  const out = await q.query(
    `INSERT INTO tasks (task_id, card_id, field, type, instructions_code, allowed_sources, current_value, blind, origin, expires_at)
     SELECT $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,now() + make_interval(mins => $10)
     WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE card_id = $2 AND field = $3 AND state IN ('open','quorum') AND NOT is_gold AND expires_at > now())
     RETURNING task_id`,
    [newId("t"), signal.card_id, signal.field, signal.type, INSTRUCTIONS[signal.type], JSON.stringify(allowed),
      signal.current_value == null ? null : JSON.stringify(signal.current_value), signal.blind, signal.origin, v1Config.taskTtlMinutes()],
  );
  return out.rows.length > 0;
}
