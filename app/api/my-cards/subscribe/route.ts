import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";
const RATE_LIMIT_PREFIX = "opencard:ratelimit:";

// Simple rate limiting: max 10 subscribe attempts per IP per hour
async function rateLimit(req: NextRequest): Promise<{ allowed: boolean; remaining: number }> {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const key = `${RATE_LIMIT_PREFIX}subscribe:${ip}`;
  try {
    const count = await redis.get<number>(key);
    if (count !== null && count >= 10) {
      return { allowed: false, remaining: 0 };
    }
    await redis.incr(key);
    if (count === null) {
      await redis.expire(key, 3600); // 1 hour TTL
    }
    const remaining = count !== null ? Math.max(0, 9 - count) : 9;
    return { allowed: true, remaining };
  } catch {
    return { allowed: true, remaining: 9 }; // Fail open
  }
}

// Simple SHA-256 hash
async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

export async function POST(req: NextRequest) {
  // Rate limit check
  const { allowed } = await rateLimit(req);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const userKey = `${USER_PREFIX}${emailHash}`;

    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;

    // If already subscribed (confirmed), update silently
    // If pending, keep pending state
    const userData = {
      email_hash: emailHash, // hashed, never store plaintext
      email_hint: normalizedEmail.substring(0, 3) + "***" + normalizedEmail.split("@")[1], // for display only
      cards: cards && Array.isArray(cards) ? cards : ((existing?.cards as string[]) || []),
      marketing_optin: Boolean(marketing_optin),
      created_at: (existing?.created_at as number) || Date.now(),
      updated_at: Date.now(),
      status: "confirmed", // Skip double opt-in for now, can enable later
    };

    await redis.hset(userKey, userData);
    await redis.sadd("opencard:subscribers", emailHash);

    return NextResponse.json({ success: true, message: "Subscribed successfully" });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const userKey = `${USER_PREFIX}${emailHash}`;

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
