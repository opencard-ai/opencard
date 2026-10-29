import { v1Config } from "@/lib/v1/config";
import { getV1Db } from "@/lib/v1/db";
import { appendLedger, getBalances } from "@/lib/v1/credits";
import { newId } from "@/lib/v1/keys";
import type { TaskType } from "@/lib/v1/tasks";
import { parseSubmission, urlMatchesWhitelist, validateResult } from "@/lib/v1/verify-validate";
import { agentRateLimit, authenticate, internalError, notEnabled, readJsonBody, v1Error, v1Json } from "@/lib/v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class Reject {
  constructor(public status: number, public error: string, public fields?: string[]) {}
}

export async function POST(req: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const db = await getV1Db();
    const agent = await authenticate(req, db);
    if (!agent) return v1Error(401, "unauthorized");
    const rl = agentRateLimit(agent.agent_id);
    const hs = async () => ({ ...(await getBalances(db, agent.agent_id)), tier: agent.tier, rateLimit: rl });
    if (agent.tier === "restricted") return v1Error(403, "agent_restricted", await hs());
    if (!rl.allowed) return v1Error(429, "rate_limited", await hs());

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return v1Error(parsed.status, parsed.error, await hs());
    const sub = parseSubmission(parsed.body);
    if (!sub.ok) return v1Error(422, "invalid_request", await hs(), { fields: sub.errors });
    const s = sub.value;

    const result = await db.transaction(async (tx) => {
      // Same code path for every task: nothing here may branch on whether a task is gold.
      const { rows } = await tx.query<{ type: TaskType; state: string; expires_at: Date | string; redundancy_target: number }>(
        `SELECT type, state, expires_at, redundancy_target FROM tasks WHERE task_id = $1 FOR UPDATE`,
        [s.task_id],
      );
      const task = rows[0];
      if (!task) return new Reject(404, "task_not_found");
      if (new Date(task.expires_at).getTime() <= Date.now()) return new Reject(410, "task_expired");
      if (task.state !== "open") return new Reject(409, "task_closed");

      if (s.evidence) {
        const wl = await tx.query<{ pattern: string }>(`SELECT pattern FROM sources_whitelist`);
        if (!urlMatchesWhitelist(s.evidence.url, wl.rows.map((r) => r.pattern))) return new Reject(422, "evidence_source_not_allowed", ["evidence.url"]);
      }
      if (s.status === "verified") {
        const errs = validateResult(task.type, s.result);
        if (errs.length) return new Reject(422, "invalid_request", errs);
      }

      const dup = await tx.query(`SELECT 1 FROM votes WHERE task_id = $1 AND agent_id = $2`, [s.task_id, agent.agent_id]);
      if (dup.rows.length) return new Reject(409, "already_submitted");

      const voteId = newId("v");
      const stored = s.status === "verified"
        ? { status: s.status, result: s.result, evidence: s.evidence }
        : { status: s.status, reason: s.reason, evidence: s.evidence };
      await tx.query(
        `INSERT INTO votes (vote_id, task_id, agent_id, result, weight, outcome) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [voteId, s.task_id, agent.agent_id, JSON.stringify(stored), agent.score, s.status === "verified" ? "pending" : "unable"],
      );

      let provisional = 0;
      if (s.status === "verified") {
        provisional = v1Config.taskReward();
        if (provisional > 0) await appendLedger(tx, { agentId: agent.agent_id, delta: provisional, reason: "task_reward", refId: voteId, state: "provisional" });
      }
      const cnt = await tx.query<{ n: string | number }>(
        `SELECT COUNT(*) AS n FROM votes WHERE task_id = $1 AND outcome <> 'unable'`,
        [s.task_id],
      );
      const received = Number(cnt.rows[0]?.n ?? 0);
      const target = Number(task.redundancy_target);
      // Quorum only flips state; settlement/consensus is out of Phase 0-1 scope.
      if (received >= target) await tx.query(`UPDATE tasks SET state = 'quorum' WHERE task_id = $1 AND state = 'open'`, [s.task_id]);
      return { provisional, received, target };
    });

    if (result instanceof Reject) {
      return v1Error(result.status, result.error, await hs(), result.fields ? { fields: result.fields } : {});
    }
    return v1Json(
      {
        task_id: s.task_id,
        state: "pending_consensus",
        provisional_credits: result.provisional,
        votes_received: result.received,
        votes_required: result.target,
      },
      202,
      await hs(),
    );
  } catch (err) {
    return internalError(err);
  }
}
