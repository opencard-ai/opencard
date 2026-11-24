import { normalizeCardInstances, cardProductIds } from "@/lib/card-instances";
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

function isValidCardId(cardId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,60}$/.test(cardId);
}

export async function POST(req: NextRequest) {
  try {
    const { email, card_id, instance_id } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (instance_id ? (typeof instance_id !== "string" || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(instance_id)) : (!card_id || !isValidCardId(card_id))) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (!userData || !userData.created_at) {
      return NextResponse.json({ error: "User not subscribed" }, { status: 404 });
    }

    const instances = normalizeCardInstances(userData.card_instances, userData.cards);
    const updatedInstances = instances.filter(row => instance_id ? row.instance_id !== instance_id : row.card_id !== card_id);
    const updatedCards = cardProductIds(updatedInstances);

    await redis.hset(userKey, {
      cards: updatedCards,
      card_instances: updatedInstances,
      updated_at: Date.now(),
    });

    return NextResponse.json({ success: true, cards: updatedCards, card_instances: updatedInstances });
  } catch (err) {
    console.error("Remove card error:", err);
    return NextResponse.json({ error: "Failed to remove card" }, { status: 500 });
  }
}
