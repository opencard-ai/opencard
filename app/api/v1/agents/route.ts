import { createHash } from "node:crypto";
import { v1Config } from "@/lib/v1/config";
import { getV1Db } from "@/lib/v1/db";
import { appendLedger } from "@/lib/v1/credits";
import { generateApiKey, hashesEqual, newId } from "@/lib/v1/keys";
import { clientIp, internalError, notEnabled, readJsonBody, v1Error, v1Json } from "@/lib/v1/http";
import { v1RateLimit } from "@/lib/v1/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function inviteOk(code: string | null): boolean {
  if (!code) return false;
  const h = sha(code);
  return v1Config.inviteCodes().some((c) => hashesEqual(sha(c), h));
}

export async function POST(req: Request) {
  const off = notEnabled();
  if (off) return off;
  const rl = v1RateLimit(`register:${clientIp(req)}`, v1Config.registerRateLimitPerHour(), 3600_000);
  if (!rl.allowed) return v1Error(429, "rate_limited", { rateLimit: rl });
  if (!inviteOk(req.headers.get("x-invite-code"))) return v1Error(403, "invite_required", { rateLimit: rl });

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return v1Error(parsed.status, parsed.error, { rateLimit: rl });
  const b = parsed.body as Record<string, unknown> | null;
  const name = b && typeof b === "object" ? b.agent_name : undefined;
  const email = b && typeof b === "object" ? b.contact_email : undefined;
  const errors: string[] = [];
  if (typeof name !== "string" || !/^[A-Za-z0-9 ._-]{1,80}$/.test(name)) errors.push("agent_name");
  if (email !== undefined && (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.push("contact_email");
  if (errors.length) return v1Error(422, "invalid_request", { rateLimit: rl }, { fields: errors });

  try {
    const db = await getV1Db();
    const key = generateApiKey();
    const agentId = newId("ag");
    const grant = v1Config.probationGrant();
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO agents (agent_id, api_key_prefix, api_key_hash, agent_name, contact_email) VALUES ($1, $2, $3, $4, $5)`,
        [agentId, key.lookup, key.hash, name, (email as string | undefined) ?? null],
      );
      if (grant > 0) await appendLedger(tx, { agentId, delta: grant, reason: "probation_grant", refId: agentId, state: "confirmed" });
    });
    // The plaintext key is returned exactly once, here, and never stored or logged.
    return v1Json(
      { agent_id: agentId, api_key: key.plaintext, tier: "probation", credits: { balance: grant, pending: 0 }, note: "Store this api_key now; it cannot be retrieved again." },
      201,
      { balance: grant, pending: 0, tier: "probation", rateLimit: rl },
    );
  } catch (err) {
    return internalError(err);
  }
}
