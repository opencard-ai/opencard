import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

function getRedis() {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Missing Upstash env");
  return new Redis({ url, token });
}

const USER_PREFIX = "opencard:user:";

async function hashEmail(email: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const PERIOD_RE = /^(\d{4}(-\d{2}|-Q[1-4]|-H[12])?|CMY-\d{4})$/;

function field(card_id: string, credit_key: string, period_key: string): string {
  return `${card_id}:${credit_key}:${period_key}`;
}

/** POST: upsert a credit use entry. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, card_id, credit_key, period_key, used_amount, note } = body ?? {};

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!card_id || !ID_RE.test(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }
    if (!credit_key || !ID_RE.test(credit_key)) {
      return NextResponse.json({ error: "Invalid credit_key" }, { status: 400 });
    }
    if (!period_key || !PERIOD_RE.test(period_key)) {
      return NextResponse.json({ error: "Invalid period_key" }, { status: 400 });
    }
    if (typeof used_amount !== "number" || used_amount < 0 || used_amount > 100000) {
      return NextResponse.json({ error: "used_amount must be number in [0, 100000]" }, { status: 400 });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return NextResponse.json({ error: "note must be ≤ 500 chars" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const redis = getRedis();

    // Require user to exist (subscribed + verified path created the hash).
    const user = await redis.hgetall(`${USER_PREFIX}${emailHash}`) as Record<string, unknown> | null;
    if (!user || !user.created_at) {
      return NextResponse.json({ error: "User not subscribed" }, { status: 404 });
    }

    const usesKey = `${USER_PREFIX}${emailHash}:credit_uses`;
    const value = JSON.stringify({
      used_amount,
      used_at: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
    await redis.hset(usesKey, { [field(card_id, credit_key, period_key)]: value });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("credit-use POST error:", err);
    return NextResponse.json({ error: "Failed to record credit use" }, { status: 500 });
  }
}

/** DELETE: undo a credit use entry. */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, card_id, credit_key, period_key } = body ?? {};

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!card_id || !ID_RE.test(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }
    if (!credit_key || !ID_RE.test(credit_key)) {
      return NextResponse.json({ error: "Invalid credit_key" }, { status: 400 });
    }
    if (!period_key || !PERIOD_RE.test(period_key)) {
      return NextResponse.json({ error: "Invalid period_key" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const redis = getRedis();
    const usesKey = `${USER_PREFIX}${emailHash}:credit_uses`;
    await redis.hdel(usesKey, field(card_id, credit_key, period_key));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("credit-use DELETE error:", err);
    return NextResponse.json({ error: "Failed to undo credit use" }, { status: 500 });
  }
}
