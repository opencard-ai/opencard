import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

/**
 * POST /api/my-cards/unsubscribe
 * Body: { email: string } — hash is computed server-side
 *
 * GET /api/my-cards/unsubscribe?hash=xxx
 * Direct unsubscribe link clicked from email (no body needed)
 */
async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

async function decodeEmailFromStorage(encoded: string): Promise<string> {
  try {
    return Buffer.from(encoded, "base64").toString("ascii").split("").reverse().join("");
  } catch { return ""; }
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    await redis.srem("opencard:subscribers", emailHash);
    await redis.hset(userKey, {
      marketing_optin: false,
      status: "unsubscribed",
      unsubscribed_at: Date.now(),
    });

    return NextResponse.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}

/**
 * GET unsubscribe via hash link (from email).
 * We need to find the user by hash. Since we store hash as key prefix,
 * we look up the hash directly.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hash = searchParams.get("hash");

  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  try {
    const userKey = `${USER_PREFIX}${hash}`;
    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;

    if (!userData) {
      return new Response("Subscription not found.", { status: 404 });
    }

    await redis.srem("opencard:subscribers", hash);
    await redis.hset(userKey, {
      marketing_optin: false,
      status: "unsubscribed",
      unsubscribed_at: Date.now(),
    });

    // Return a simple HTML success page
    return new Response(`<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#16a34a">✓ Unsubscribed</h2><p style="color:#666">You've been removed from OpenCard reminders.</p><p style="color:#999;font-size:13px;margin-top:24px">OpenCard · <a href="https://opencardai.com" style="color:#666">opencardai.com</a></p></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Unsubscribe GET error:", err);
    return new Response("Failed to unsubscribe. Please try again.", { status: 500 });
  }
}
