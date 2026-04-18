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

/**
 * DELETE /api/my-cards/delete?email=xxx
 * Permanently deletes all user data. GDPR/CCPA compliant.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim())) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    await redis.del(userKey);
    await redis.srem("opencard:subscribers", emailHash);

    return NextResponse.json({ success: true, message: "All data deleted" });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
