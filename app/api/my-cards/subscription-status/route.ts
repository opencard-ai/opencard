import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `${USER_PREFIX}${normalizedEmail}`;
    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;

    if (!userData || !userData.created_at) {
      return NextResponse.json({ subscribed: false });
    }

    return NextResponse.json({
      subscribed: true,
      email: normalizedEmail,
      card_count: ((userData.cards as string[]) || []).length,
      created_at: userData.created_at,
    });
  } catch (err) {
    console.error("Subscription status error:", err);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
