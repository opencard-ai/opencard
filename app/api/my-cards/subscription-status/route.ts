import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;
    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;

    if (!userData || !userData.created_at) {
      return NextResponse.json({ subscribed: false });
    }

    return NextResponse.json({
      subscribed: true,
      card_count: ((userData.cards as string[]) || []).length,
      created_at: userData.created_at,
    });
  } catch (err) {
    console.error("Subscription status error:", err);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
