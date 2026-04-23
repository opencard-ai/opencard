import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

// Lazy initialization to avoid module load errors
function getRedis() {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Missing UPSTASH_KV_REST_API_URL or UPSTASH_KV_REST_API_TOKEN");
  }
  return new Redis({ url, token });
}

const USER_PREFIX = "opencard:user:";

async function hashEmail(email: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  let redis;
  try {
    redis = getRedis();
  } catch (err: any) {
    console.error("Redis init failed:", err.message);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  
  try {
    const { email, card_id, month, year } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!card_id) {
      return NextResponse.json({ error: "card_id required" }, { status: 400 });
    }
    if (month === undefined || !year) {
      return NextResponse.json({ error: "month and year required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email.toLowerCase().trim());
    const openDatesKey = `${USER_PREFIX}${emailHash}:open_dates`;
    
    const existing = await redis.get(openDatesKey); // Remove <string> type hint
    console.log("POST: existing raw value=", existing, "type=", typeof existing);
    const dates = existing ? existing : {}; // Directly use existing object
    
    dates[card_id] = { month: Number(month), year: Number(year), updated_at: Date.now() };
    
    await redis.set(openDatesKey, JSON.stringify(dates));

    return NextResponse.json({ success: true, card_id, month, year });
  } catch (err: any) {
    console.error("set-open-date error:", err);
    return NextResponse.json({ error: err.message || "Failed to set open date" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  let redis;
  try {
    redis = getRedis();
  } catch (err: any) {
    console.error("Redis init failed:", err.message);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email.toLowerCase().trim());
    const openDatesKey = `${USER_PREFIX}${emailHash}:open_dates`;
    
    const existing = await redis.get(openDatesKey); // Remove <string> type hint
    console.log("GET: existing raw value=", existing, "type=", typeof existing);
    const dates = existing ? existing : {}; // Directly use existing object

    return NextResponse.json({ open_dates: dates });
  } catch (err: any) {
    console.error("get-open-dates error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch open dates" }, { status: 500 });
  }
}
