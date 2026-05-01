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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

async function hashEmail(email: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

function field(card_id: string, anniversary_year: number): string {
  return `${card_id}:${anniversary_year}`;
}

function isValidYear(y: unknown): y is number {
  return typeof y === "number" && Number.isInteger(y) && y >= 2000 && y <= 2100;
}

/** POST: log an FNA redemption. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, card_id, anniversary_year, redeemed_value, note } = body ?? {};

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!card_id || !ID_RE.test(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }
    if (!isValidYear(anniversary_year)) {
      return NextResponse.json({ error: "anniversary_year must be int in [2000, 2100]" }, { status: 400 });
    }
    if (
      redeemed_value !== undefined &&
      redeemed_value !== null &&
      (typeof redeemed_value !== "number" || redeemed_value < 0 || redeemed_value > 100000)
    ) {
      return NextResponse.json({ error: "redeemed_value must be number in [0, 100000]" }, { status: 400 });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return NextResponse.json({ error: "note must be ≤ 500 chars" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const redis = getRedis();
    const user = await redis.hgetall(`${USER_PREFIX}${emailHash}`) as Record<string, unknown> | null;
    if (!user || !user.created_at) {
      return NextResponse.json({ error: "User not subscribed" }, { status: 404 });
    }

    const fnaKey = `${USER_PREFIX}${emailHash}:fna_uses`;
    const value = JSON.stringify({
      used_at: new Date().toISOString(),
      ...(typeof redeemed_value === "number" ? { redeemed_value } : {}),
      ...(note ? { note } : {}),
    });
    await redis.hset(fnaKey, { [field(card_id, anniversary_year)]: value });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("fna-use POST error:", err);
    return NextResponse.json({ error: "Failed to record FNA use" }, { status: 500 });
  }
}

/** DELETE: undo an FNA log. */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, card_id, anniversary_year } = body ?? {};

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!card_id || !ID_RE.test(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }
    if (!isValidYear(anniversary_year)) {
      return NextResponse.json({ error: "anniversary_year must be int in [2000, 2100]" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const redis = getRedis();
    const fnaKey = `${USER_PREFIX}${emailHash}:fna_uses`;
    await redis.hdel(fnaKey, field(card_id, anniversary_year));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("fna-use DELETE error:", err);
    return NextResponse.json({ error: "Failed to undo FNA use" }, { status: 500 });
  }
}
