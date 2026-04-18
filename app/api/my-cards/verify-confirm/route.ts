import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";
const PENDING_PREFIX = "opencard:pending:";
const SUBSCRIBERS_SET = "opencard:subscribers";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opencardai.com";

/**
 * GET /api/my-cards/verify-confirm?token=xxx
 * Called when user clicks the verification link.
 * Confirms email and activates subscription.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#dc2626">Invalid link</h2><p style="color:#666">This verification link has expired or is invalid.</p><p style="color:#999;font-size:13px;margin-top:24px">OpenCard · <a href="${BASE_URL}" style="color:#666">opencardai.com</a></p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const pendingKey = `${PENDING_PREFIX}${token}`;
    const pendingData = await redis.get<string>(pendingKey);

    if (!pendingData) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#dc2626">Link expired</h2><p style="color:#666">This verification link has expired (24-hour limit). Please request a new one.</p><p style="color:#999;font-size:13px;margin-top:24px">OpenCard · <a href="${BASE_URL}" style="color:#666">opencardai.com</a></p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const { email_hash, email_for_send, email_hint } = JSON.parse(pendingData);
    const userKey = `${USER_PREFIX}${email_hash}`;

    // Check if already confirmed
    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (existing?.status === "confirmed") {
      // Already confirmed, just redirect to success
      return new Response(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2;url=${BASE_URL}/en/my-cards"></meta></head><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#16a34a">✓ Already verified</h2><p style="color:#666">Your email was already confirmed. Redirecting...</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Create or update user as confirmed
    const userData = existing || {};
    await redis.hset(userKey, {
      ...userData,
      email_hash,
      email_for_send,
      email_hint: email_hint || "",
      status: "confirmed",
      confirmed_at: Date.now(),
      updated_at: Date.now(),
      created_at: (existing?.created_at as number) || Date.now(),
    });

    // Add to active subscribers
    await redis.sadd(SUBSCRIBERS_SET, email_hash);

    // Delete pending token
    await redis.del(pendingKey);

    return new Response(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3;url=${BASE_URL}/en/my-cards"></meta></head><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#16a34a">✓ Email verified!</h2><p style="color:#666;margin-top:12px">Your subscription is now active. You'll receive monthly benefit reminders.</p><p style="color:#999;font-size:13px;margin-top:24px">Redirecting to OpenCard...</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("Verify confirm error:", err);
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;text-align:center"><h2 style="color:#dc2626">Something went wrong</h2><p style="color:#666">Please try again or contact opencard@opencardai.com</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
