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

/**
 * POST /api/my-cards/unsubscribe
 * Body: { email: string }
 * Unsubscribes user: removes from subscribers set, clears marketing_optin.
 * User data is retained for 30 days then auto-deleted.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    // Remove from active subscribers
    await redis.srem("opencard:subscribers", emailHash);

    // Set unsubscribe flag and mark for deletion in 30 days
    await redis.hset(userKey, {
      marketing_optin: false,
      status: "unsubscribed",
      unsubscribed_at: Date.now(),
    });

    // Schedule deletion in 30 days (handled by cron, here we just flag it)
    // A background job can scan for unsubscribed_at > 30 days ago and delete

    return NextResponse.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
