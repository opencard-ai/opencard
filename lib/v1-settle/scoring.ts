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

export interface SettleSummary {
  gold_pass: number; gold_fail: number; agreed: number; disagreed: number; expired_votes: number;
  suggestions: number; settled_tasks: number; expired_tasks: number; disputed_tasks: number;
}

type VoteRow = { vote_id: string; agent_id: string; weight: string | number; result: { result?: Record<string, unknown> } };

/** Gold grading for one task (own transaction). */
async function gradeGoldTask(db: V1Db, taskId: string, cfg: TierConfig, sum: SettleSummary) {
  await db.transaction(async (tx) => {
    const t = await tx.query<{ type: TaskType; gold_answer: Record<string, unknown> }>(
      `SELECT t.type, g.gold_answer FROM tasks t JOIN task_gold_answers g ON g.task_id = t.task_id WHERE t.task_id = $1 FOR UPDATE OF t`,
      [taskId],
    );
    if (!t.rows[0]) return;
    const votes = await tx.query<VoteRow>(
      `SELECT vote_id, agent_id, weight, result FROM votes WHERE task_id = $1 AND outcome = 'pending' ORDER BY submitted_at FOR UPDATE`,
      [taskId],
    );
    for (const v of votes.rows) {
      const ok = matchesGold(t.rows[0].type, v.result.result ?? {}, t.rows[0].gold_answer);
      await tx.query(`UPDATE votes SET outcome = $2 WHERE vote_id = $1`, [v.vote_id, ok ? "gold_pass" : "gold_fail"]);
      await settleReward(tx, v.vote_id, v.agent_id, ok);
      await updateAgent(tx, v.agent_id, ok ? cfg.score_gold_pass : cfg.score_gold_fail, cfg);
      ok ? sum.gold_pass++ : sum.gold_fail++;
    }
    // Gold tasks at quorum close without a suggestion (their answer is already known).
    const closed = await tx.query(`UPDATE tasks SET state = 'settled' WHERE task_id = $1 AND state = 'quorum' RETURNING 1`, [taskId]);
    sum.settled_tasks += closed.rows.length;
  });
}

/** Overdue open task (own transaction): pending votes resolve as 'expired', provisional rewards are reversed. */
async function expireTask(db: V1Db, taskId: string, sum: SettleSummary) {
  await db.transaction(async (tx) => {
    const t = await tx.query(`SELECT 1 FROM tasks WHERE task_id = $1 AND state = 'open' AND expires_at <= now() FOR UPDATE`, [taskId]);
    if (!t.rows.length) return;
    const votes = await tx.query<VoteRow>(`SELECT vote_id, agent_id FROM votes WHERE task_id = $1 AND outcome = 'pending' FOR UPDATE`, [taskId]);
    for (const v of votes.rows) {
      await tx.query(`UPDATE votes SET outcome = 'expired' WHERE vote_id = $1`, [v.vote_id]);
      await settleReward(tx, v.vote_id, v.agent_id, false); // no consensus reached -> no reward
      sum.expired_votes++;
    }
    await tx.query(`UPDATE tasks SET state = 'expired' WHERE task_id = $1`, [taskId]);
    sum.expired_tasks++;
  });
}

/** Reputation-weighted majority for one non-gold task at quorum (own transaction). */
async function settleConsensusTask(db: V1Db, taskId: string, cfg: TierConfig, sum: SettleSummary) {
  await db.transaction(async (tx) => {
    const tr = await tx.query<{ task_id: string; card_id: string; field: string; type: TaskType; current_value: unknown }>(
      `SELECT task_id, card_id, field, type, current_value FROM tasks WHERE task_id = $1 AND NOT is_gold AND state = 'quorum' FOR UPDATE`,
      [taskId],
    );
    const t = tr.rows[0];
    if (!t) return;
    const votes = await tx.query<VoteRow>(
      `SELECT vote_id, agent_id, weight, result FROM votes WHERE task_id = $1 AND outcome = 'pending' FOR UPDATE`,
      [taskId],
    );
    const buckets = new Map<string, { w: number; n: number; sample: Record<string, unknown> }>();
    for (const v of votes.rows) {
      const k = canonical(t.type, v.result.result ?? {});
      const b = buckets.get(k) ?? { w: 0, n: 0, sample: v.result.result ?? {} };
      b.w += Number(v.weight); b.n++; buckets.set(k, b);
    }
    const total = [...buckets.values()].reduce((a, b) => a + b.w, 0);
    const ranked = [...buckets.entries()].sort((a, b) => b[1].w - a[1].w);
    const top = ranked[0];
    if (!top || total <= 0 || top[1].w <= total / 2 || (ranked[1] && ranked[1][1].w === top[1].w)) {
      await tx.query(`UPDATE tasks SET state = 'disputed' WHERE task_id = $1`, [taskId]);
      sum.disputed_tasks++;
      return;
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
    await tx.query(`UPDATE tasks SET state = 'settled' WHERE task_id = $1`, [taskId]);
    sum.settled_tasks++;
  });
}

/** Settles task by task, each in its own transaction, so one bad task never blocks or rolls back the rest. */
export async function settle(db: V1Db): Promise<SettleSummary> {
  const sum: SettleSummary = { gold_pass: 0, gold_fail: 0, agreed: 0, disagreed: 0, expired_votes: 0, suggestions: 0, settled_tasks: 0, expired_tasks: 0, disputed_tasks: 0 };
  const cfg = await loadTierConfig(db);
  const ids = async (sql: string) => (await db.query<{ task_id: string }>(sql)).rows.map((r) => r.task_id);
  // 1) Gold: grade every pending vote (including on overdue gold tasks), and close gold tasks at quorum.
  for (const id of await ids(`SELECT DISTINCT t.task_id FROM tasks t JOIN votes v ON v.task_id = t.task_id
                               WHERE t.is_gold AND (v.outcome = 'pending' OR t.state = 'quorum')`)) await gradeGoldTask(db, id, cfg, sum);
  // 2) Expire overdue open tasks.
  for (const id of await ids(`SELECT task_id FROM tasks WHERE state = 'open' AND expires_at <= now()`)) await expireTask(db, id, sum);
  // 3) Consensus on non-gold tasks at quorum.
  for (const id of await ids(`SELECT task_id FROM tasks WHERE NOT is_gold AND state = 'quorum'`)) await settleConsensusTask(db, id, cfg, sum);
  return sum;
}
