import { getV1Db } from "@/lib/v1/db";
import { getBalances } from "@/lib/v1/credits";
import { agentRateLimit, authenticate, internalError, notEnabled, v1Error, v1Json } from "@/lib/v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const db = await getV1Db();
    const agent = await authenticate(req, db);
    if (!agent) return v1Error(401, "unauthorized");
    const rl = agentRateLimit(agent.agent_id);
    const { balance, pending } = await getBalances(db, agent.agent_id);
    const hs = { balance, pending, tier: agent.tier, rateLimit: rl };
    if (!rl.allowed) return v1Error(429, "rate_limited", hs);
    return v1Json(
      {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        tier: agent.tier,
        credits: { balance, pending },
        reputation: { score: agent.score, gold_accuracy: agent.gold_accuracy, tasks_completed: agent.tasks_completed },
      },
      200,
      hs,
    );
  } catch (err) {
    return internalError(err);
  }
}
