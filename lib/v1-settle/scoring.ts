/**
 * Offline settlement for Verify-to-Access (spec 5.x step 6). NOT imported by any /api/v1 route:
 * this is the only code that reads task_gold_answers, and it runs from scripts/v1-settle.ts with a
 * privileged DB role. Consensus output goes only to consensus_suggestions; data/cards is never written.
 */
import type { Queryable, V1Db } from "../v1/db";
import { appendLedger } from "../v1/credits";
import { newId } from "../v1/keys";
import type { TaskType } from "../v1/tasks";

export interface TierConfig {
  standard_min_gold: number;
  standard_min_accuracy: number;
  restrict_min_gold: number;
  restrict_below_accuracy: number;
  score_gold_pass: number;
  score_gold_fail: number;
  score_agree: number;
  score_disagree: number;
}
export const DEFAULT_TIER_CONFIG: TierConfig = {
  standard_min_gold: 3,
  standard_min_accuracy: 0.8,
  restrict_min_gold: 2,
  restrict_below_accuracy: 0.5,
  score_gold_pass: 0.05,
  score_gold_fail: -0.1,
  score_agree: 0.02,
  score_disagree: -0.05,
};

/** link_check: scheme-insensitive host+path; query/fragment stripped; trailing slash ignored. */
export function normalizeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    const p = u.pathname.replace(/\/+$/, "");
    return `${u.host.toLowerCase()}${p}`;
  } catch {
    return null;
  }
}

/** Canonical comparable form of a result for a task type. Unknown keys are dropped. */
export function canonical(type: TaskType, r: Record<string, unknown>): string {
  switch (type) {
    case "link_check":
      return JSON.stringify([r.http_status, normalizeLinkUrl(r.final_url), r.is_official_redirect]);
    case "fee_check":
      return JSON.stringify([r.annual_fee, r.first_year_waived]);
    case "welcome_offer_check":
      return JSON.stringify([r.bonus_amount, r.bonus_unit, r.spending_requirement, r.time_period_months]);
    case "status_check":
      return JSON.stringify([r.status]);
  }
}

const SCHEMA_KEYS: Record<TaskType, string[]> = {
  link_check: ["http_status", "final_url", "is_official_redirect"],
  fee_check: ["annual_fee", "first_year_waived"],
  welcome_offer_check: ["bonus_amount", "bonus_unit", "spending_requirement", "time_period_months"],
  status_check: ["status"],
};

/**
 * Gold grading compares ONLY the schema keys present in the gold answer (e.g. a fee_check gold with just
 * annual_fee ignores first_year_waived). Extra keys in gold outside the response schema are ignored.
 * A gold answer with no gradable keys never passes.
 */
export function matchesGold(type: TaskType, result: Record<string, unknown>, gold: Record<string, unknown>): boolean {
  const keys = SCHEMA_KEYS[type].filter((k) => k in gold);
  if (!keys.length) return false;
  return keys.every((k) =>
    type === "link_check" && k === "final_url"
      ? normalizeLinkUrl(result[k]) !== null && normalizeLinkUrl(result[k]) === normalizeLinkUrl(gold[k])
      : result[k] === gold[k],
  );
}

async function loadTierConfig(q: Queryable): Promise<TierConfig> {
  const { rows } = await q.query<{ value: Partial<TierConfig> }>(`SELECT value FROM v1_scoring_config WHERE key = 'tiers'`);
  return { ...DEFAULT_TIER_CONFIG, ...(rows[0]?.value ?? {}) };
}

async function settleReward(tx: Queryable, voteId: string, agentId: string, ok: boolean) {
  const { rows } = await tx.query<{ entry_id: string; delta: number }>(
    `SELECT entry_id, delta FROM credit_ledger WHERE ref_id = $1 AND reason = 'task_reward' AND state = 'provisional'`,
    [voteId],
  );
  for (const r of rows) {
    await tx.query(`UPDATE credit_ledger SET state = 'confirmed' WHERE entry_id = $1`, [r.entry_id]);
    if (!ok) await appendLedger(tx, { agentId, delta: -Number(r.delta), reason: "clawback", refId: voteId, state: "confirmed" });
  }
}

async function updateAgent(tx: Queryable, agentId: string, scoreDelta: number, cfg: TierConfig) {
  await tx.query(
    `UPDATE agents SET score = GREATEST(0, score + $2), tasks_completed = tasks_completed + 1 WHERE agent_id = $1`,
    [agentId, scoreDelta],
  );
  const { rows } = await tx.query<{ pass: string | number; graded: string | number; tier: string }>(
    `SELECT COUNT(*) FILTER (WHERE v.outcome = 'gold_pass') AS pass,
            COUNT(*) FILTER (WHERE v.outcome IN ('gold_pass','gold_fail')) AS graded,
            (SELECT tier FROM agents WHERE agent_id = $1) AS tier
       FROM votes v WHERE v.agent_id = $1`,
    [agentId],
  );
  const pass = Number(rows[0].pass), graded = Number(rows[0].graded);
  const acc = graded ? pass / graded : null;
  let tier = rows[0].tier;
  if (acc !== null && graded >= cfg.restrict_min_gold && acc < cfg.restrict_below_accuracy) tier = "restricted";
  else if (tier === "probation" && acc !== null && graded >= cfg.standard_min_gold && acc >= cfg.standard_min_accuracy) tier = "standard";
  await tx.query(`UPDATE agents SET gold_accuracy = $2, tier = $3 WHERE agent_id = $1`, [agentId, acc, tier]);
}

export interface SettleSummary { gold_pass: number; gold_fail: number; agreed: number; disagreed: number; suggestions: number; settled_tasks: number }

export async function settle(db: V1Db): Promise<SettleSummary> {
  const sum: SettleSummary = { gold_pass: 0, gold_fail: 0, agreed: 0, disagreed: 0, suggestions: 0, settled_tasks: 0 };
  return db.transaction(async (tx) => {
    const cfg = await loadTierConfig(tx);
    // 1) Gold grading: every pending verified vote on a gold task, immediately.
    const gold = await tx.query<{ vote_id: string; agent_id: string; type: TaskType; result: { result: Record<string, unknown> }; gold_answer: Record<string, unknown> }>(
      `SELECT v.vote_id, v.agent_id, t.type, v.result, g.gold_answer
         FROM votes v JOIN tasks t ON t.task_id = v.task_id JOIN task_gold_answers g ON g.task_id = t.task_id
        WHERE v.outcome = 'pending' AND t.is_gold ORDER BY v.submitted_at FOR UPDATE OF v`,
    );
    for (const v of gold.rows) {
      const ok = matchesGold(v.type, v.result.result ?? {}, v.gold_answer);
      await tx.query(`UPDATE votes SET outcome = $2 WHERE vote_id = $1`, [v.vote_id, ok ? "gold_pass" : "gold_fail"]);
      await settleReward(tx, v.vote_id, v.agent_id, ok);
      await updateAgent(tx, v.agent_id, ok ? cfg.score_gold_pass : cfg.score_gold_fail, cfg);
      ok ? sum.gold_pass++ : sum.gold_fail++;
    }
    // Gold tasks that reached quorum are closed without a suggestion (their answer is already known).
    const g2 = await tx.query(`UPDATE tasks SET state = 'settled' WHERE is_gold AND state = 'quorum' RETURNING task_id`);
    sum.settled_tasks += g2.rows.length;

    // 2) Consensus: reputation-weighted majority on non-gold tasks at quorum.
    const tasks = await tx.query<{ task_id: string; card_id: string; field: string; type: TaskType; current_value: unknown }>(
      `SELECT task_id, card_id, field, type, current_value FROM tasks WHERE NOT is_gold AND state = 'quorum' FOR UPDATE`,
    );
    for (const t of tasks.rows) {
      const votes = await tx.query<{ vote_id: string; agent_id: string; weight: string | number; result: { result: Record<string, unknown> } }>(
        `SELECT vote_id, agent_id, weight, result FROM votes WHERE task_id = $1 AND outcome = 'pending'`,
        [t.task_id],
      );
      const buckets = new Map<string, { w: number; n: number; sample: Record<string, unknown> }>();
      for (const v of votes.rows) {
        const k = canonical(t.type, v.result.result ?? {});
        const b = buckets.get(k) ?? { w: 0, n: 0, sample: v.result.result };
        b.w += Number(v.weight); b.n++; buckets.set(k, b);
      }
      const total = [...buckets.values()].reduce((a, b) => a + b.w, 0);
      const ranked = [...buckets.entries()].sort((a, b) => b[1].w - a[1].w);
      const top = ranked[0];
      if (!top || total <= 0 || top[1].w <= total / 2 || (ranked[1] && ranked[1][1].w === top[1].w)) {
        await tx.query(`UPDATE tasks SET state = 'disputed' WHERE task_id = $1`, [t.task_id]);
        continue;
      }
      for (const v of votes.rows) {
        const ok = canonical(t.type, v.result.result ?? {}) === top[0];
        await tx.query(`UPDATE votes SET outcome = $2 WHERE vote_id = $1`, [v.vote_id, ok ? "agreed" : "disagreed"]);
        await settleReward(tx, v.vote_id, v.agent_id, ok);
        await updateAgent(tx, v.agent_id, ok ? cfg.score_agree : cfg.score_disagree, cfg);
        ok ? sum.agreed++ : sum.disagreed++;
      }
      const current = t.current_value && typeof t.current_value === "object" ? canonical(t.type, t.current_value as Record<string, unknown>) : null;
      if (current !== top[0]) {
        await tx.query(
          `INSERT INTO consensus_suggestions (suggestion_id, task_id, card_id, field, current_value, suggested_value, support)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
          [newId("cs"), t.task_id, t.card_id, t.field, t.current_value == null ? null : JSON.stringify(t.current_value),
            JSON.stringify(top[1].sample), JSON.stringify({ votes: top[1].n, weight: top[1].w, total_weight: total })],
        );
        sum.suggestions++;
      }
      await tx.query(`UPDATE tasks SET state = 'settled' WHERE task_id = $1`, [t.task_id]);
      sum.settled_tasks++;
    }
    return sum;
  });
}
