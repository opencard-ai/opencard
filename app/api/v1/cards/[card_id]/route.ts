import { getCardById } from "@/lib/cards";
import { v1Config } from "@/lib/v1/config";
import { getV1Db } from "@/lib/v1/db";
import { appendLedger, getBalances } from "@/lib/v1/credits";
import { newId } from "@/lib/v1/keys";
import { v1CardView } from "@/lib/v1/card-view";
import { pickTasks } from "@/lib/v1/tasks";
import { agentRateLimit, authenticate, internalError, notEnabled, v1Error, v1Json } from "@/lib/v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ card_id: string }> }) {
  const off = notEnabled();
  if (off) return off;
  const { card_id } = await params;
  try {
    const db = await getV1Db();
    const agent = await authenticate(req, db);
    if (!agent) return v1Error(401, "unauthorized");
    const rl = agentRateLimit(agent.agent_id);
    if (agent.tier === "restricted") {
      const b = await getBalances(db, agent.agent_id);
      return v1Error(403, "agent_restricted", { ...b, tier: agent.tier, rateLimit: rl });
    }
    if (!rl.allowed) {
      const b = await getBalances(db, agent.agent_id);
      return v1Error(429, "rate_limited", { ...b, tier: agent.tier, rateLimit: rl });
    }
    const card = /^[a-z0-9][a-z0-9-]{0,80}$/.test(card_id) ? getCardById(card_id) : null;
    if (!card) {
      const b = await getBalances(db, agent.agent_id);
      return v1Error(404, "card_not_found", { ...b, tier: agent.tier, rateLimit: rl });
    }

    const cost = v1Config.queryCost;
    const out = await db.transaction(async (tx) => {
      // Serialize spending per agent so concurrent requests cannot overdraw.
      await tx.query(`SELECT agent_id FROM agents WHERE agent_id = $1 FOR UPDATE`, [agent.agent_id]);
      const before = await getBalances(tx, agent.agent_id);
      const tasks = await pickTasks(tx, agent.agent_id, v1Config.maxTasksAttached());
      if (before.balance < cost) return { paid: false as const, before, tasks };
      await appendLedger(tx, { agentId: agent.agent_id, delta: -cost, reason: "query_cost", refId: newId("req"), state: "confirmed" });
      return { paid: true as const, after: { balance: before.balance - cost, pending: before.pending }, tasks };
    });

    if (!out.paid) {
      const origin = new URL(req.url).origin;
      return v1Json(
        {
          error: "insufficient_credits",
          required_credits: cost,
          verification_tasks: out.tasks,
          alternatives: { public_html: `${origin}/en/cards/${card.card_id}`, free_quota_reset_at: null },
        },
        v1Config.insufficientCreditsStatus(),
        { ...out.before, tier: agent.tier, tasksAttached: out.tasks.length, rateLimit: rl },
      );
    }
    return v1Json(
      { card: v1CardView(card), verification_tasks: out.tasks },
      200,
      { ...out.after, tier: agent.tier, tasksAttached: out.tasks.length, rateLimit: rl },
    );
  } catch (err) {
    return internalError(err);
  }
}
