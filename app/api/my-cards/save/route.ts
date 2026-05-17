import { NextRequest, NextResponse } from "next/server";

const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

// Validate card_id format: lowercase, hyphen, alphanumeric only
function isValidCardId(cardId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,60}$/.test(cardId);
}

interface UserCardInstance {
  instance_id: string;
  card_id: string;
  nickname?: string;
  last4?: string;
  created_at: number;
  status: "active" | "closed";
}

function normalizeInstances(userData: Record<string, unknown>): UserCardInstance[] {
  const raw = userData.card_instances;
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        instance_id: String(x.instance_id || x.card_id || ""),
        card_id: String(x.card_id || x.instance_id || ""),
        ...(x.nickname ? { nickname: String(x.nickname) } : {}),
        ...(x.last4 ? { last4: String(x.last4).slice(-4) } : {}),
        created_at: Number(x.created_at || Date.now()),
        status: (x.status === "closed" ? "closed" : "active") as "active" | "closed",
      }))
      .filter((x) => isValidCardId(x.card_id) && /^[a-z0-9][a-z0-9-]{0,80}$/.test(x.instance_id));
  }
  const legacyCards = Array.isArray(userData.cards) ? (userData.cards as string[]) : [];
  return legacyCards
    .filter(isValidCardId)
    .map((card_id) => ({ instance_id: card_id, card_id, created_at: Number(userData.created_at || Date.now()), status: "active" }));
}

function makeInstanceId(cardId: string, existing: UserCardInstance[]): string {
  const count = existing.filter((x) => x.card_id === cardId).length + 1;
  const suffix = `${Date.now().toString(36)}-${count}`;
  return `${cardId}-${suffix}`.slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const { email, card_id, nickname, last4 } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!card_id || !isValidCardId(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (!userData || !userData.created_at) {
      return NextResponse.json({ error: "User not subscribed" }, { status: 404 });
    }

    const instances = normalizeInstances(userData);
    const now = Date.now();
    const instance: UserCardInstance = {
      instance_id: makeInstanceId(card_id, instances),
      card_id,
      ...(typeof nickname === "string" && nickname.trim() ? { nickname: nickname.trim().slice(0, 80) } : {}),
      ...(typeof last4 === "string" && /^\d{1,4}$/.test(last4.trim()) ? { last4: last4.trim().slice(-4) } : {}),
      created_at: now,
      status: "active",
    };
    const updatedInstances = [...instances, instance];
    const updatedCards = [...new Set(updatedInstances.map((x) => x.card_id))];

    await redis.hset(userKey, {
      cards: updatedCards,
      card_instances: updatedInstances,
      updated_at: now,
    });

    return NextResponse.json({ success: true, cards: updatedCards, card_instances: updatedInstances, instance });
  } catch (err) {
    console.error("Save card error:", err);
    return NextResponse.json({ error: "Failed to save card" }, { status: 500 });
  }
}
