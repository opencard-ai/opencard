import type { Queryable } from "./db";
import { newId } from "./keys";

/** balance = confirmed entries; pending = provisional entries (spec 7.3: provisional is not spendable). */
export async function getBalances(q: Queryable, agentId: string): Promise<{ balance: number; pending: number }> {
  const { rows } = await q.query<{ balance: string | number | null; pending: string | number | null }>(
    `SELECT COALESCE(SUM(delta) FILTER (WHERE state = 'confirmed'), 0) AS balance,
            COALESCE(SUM(delta) FILTER (WHERE state = 'provisional'), 0) AS pending
       FROM credit_ledger WHERE agent_id = $1`,
    [agentId],
  );
  return { balance: Number(rows[0]?.balance ?? 0), pending: Number(rows[0]?.pending ?? 0) };
}

export async function appendLedger(
  q: Queryable,
  e: { agentId: string; delta: number; reason: "probation_grant" | "query_cost" | "task_reward" | "clawback"; refId: string | null; state: "provisional" | "confirmed" },
): Promise<void> {
  await q.query(
    `INSERT INTO credit_ledger (entry_id, agent_id, delta, reason, ref_id, state) VALUES ($1, $2, $3, $4, $5, $6)`,
    [newId("cl"), e.agentId, e.delta, e.reason, e.refId, e.state],
  );
}
