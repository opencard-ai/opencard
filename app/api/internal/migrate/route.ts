import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";
const SUBSCRIBERS_SET = "opencard:subscribers";
const CRON_SECRET = process.env.CRON_SECRET!;

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${CRON_SECRET}`;
}

async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

async function encodeEmailForSend(email: string): Promise<string> {
  const reversed = email.toLowerCase().trim().split("").reverse().join("");
  return Buffer.from(reversed).toString("base64");
}

/**
 * POST /api/internal/migrate
 * One-time migration to convert plaintext subscriber emails to hashed format.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subscribers = await redis.smembers(SUBSCRIBERS_SET) as unknown as string[];
    console.log("[migrate] Subscribers in set:", subscribers.length);

    let migrated = 0;
    let alreadyHashed = 0;
    let removed = 0;

    for (const item of subscribers) {
      // Check if already a SHA-256 hash (64 hex chars)
      const isHash = /^[a-f0-9]{64}$/.test(item);

      if (isHash) {
        alreadyHashed++;
        continue;
      }

      // Plaintext email — migrate
      const emailHash = await hashEmail(item);
      const emailForSend = await encodeEmailForSend(item);
      const oldKey = `${USER_PREFIX}${item}`;
      const newKey = `${USER_PREFIX}${emailHash}`;

      const userData = await redis.hgetall(oldKey) as Record<string, unknown> | null;

      if (userData && userData.created_at) {
        // Update new key with email_for_send
        await redis.hset(newKey, {
          ...userData,
          email_hash: emailHash,
          email_for_send: emailForSend,
          migrated_at: Date.now(),
        });
        // Delete old key
        await redis.del(oldKey);
        // Update set
        await redis.srem(SUBSCRIBERS_SET, item);
        await redis.sadd(SUBSCRIBERS_SET, emailHash);
        migrated++;
        console.log(`[migrate] ${item} → ${emailHash.substring(0, 16)}...`);
      } else {
        // No user data — remove from set
        await redis.srem(SUBSCRIBERS_SET, item);
        removed++;
        console.log(`[migrate] Removed (no data): ${item}`);
      }
    }

    const remaining = await redis.smembers(SUBSCRIBERS_SET) as unknown as string[];
    return NextResponse.json({
      success: true,
      migrated,
      alreadyHashed,
      removed,
      totalSubscribers: remaining.length,
    });
  } catch (err) {
    console.error("[migrate] Error:", err);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
