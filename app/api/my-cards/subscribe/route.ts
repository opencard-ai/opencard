import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

export async function POST(req: NextRequest) {
  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const userKey = `${USER_PREFIX}${normalizedEmail}`;
    
    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;
    
    const userData = {
      email: normalizedEmail,
      cards: cards && Array.isArray(cards) ? cards : ((existing?.cards as string[]) || []),
      marketing_optin: Boolean(marketing_optin),
      created_at: (existing?.created_at as number) || Date.now(),
      updated_at: Date.now(),
    };

    await redis.hset(userKey, userData);
    await redis.sadd("opencard:subscribers", normalizedEmail);

    return NextResponse.json({ success: true, message: "Subscribed successfully" });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `${USER_PREFIX}${normalizedEmail}`;

    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (!existing || !(existing.created_at as number)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: Date.now() };
    if (cards !== undefined) updates.cards = cards;
    if (marketing_optin !== undefined) updates.marketing_optin = marketing_optin;

    await redis.hset(userKey, updates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
