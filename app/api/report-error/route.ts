import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

function getRedis() {
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Missing Upstash env");
  return new Redis({ url, token });
}

const REPORTS_LIST = "opencard:user_reports:v1";
const REPORT_KEY = (id: string) => `opencard:user_reports:v1:${id}`;
const RATE_LIMIT_PREFIX = "opencard:ratelimit:report-error:";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

async function rateLimit(req: NextRequest): Promise<boolean> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  try {
    const redis = getRedis();
    const count = await redis.get<number>(key);
    if (count !== null && count >= 10) return false;
    await redis.incr(key);
    if (count === null) await redis.expire(key, 3600);
    return true;
  } catch {
    return true;
  }
}

/**
 * POST /api/report-error
 * Body: { card_id, lang, message, email? }
 * Stores a free-text user report on a specific card. Reviewed by a human
 * later; no automatic action on the catalog. Rate-limited to 10/hr per IP.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(req))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }

    const body = await req.json();
    const { card_id, lang, message, email } = body ?? {};

    if (!card_id || typeof card_id !== "string" || !ID_RE.test(card_id)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || message.trim().length < 5 || message.length > 2000) {
      return NextResponse.json({ error: "Message must be 5-2000 chars" }, { status: 400 });
    }
    if (lang && (typeof lang !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(lang))) {
      return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
    }
    if (email !== undefined && email !== null && email !== "") {
      if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 200) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
    }

    const id = newId();
    const record = {
      id,
      card_id,
      message: message.trim(),
      email: email && typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined,
      lang: lang || "en",
      user_agent: req.headers.get("user-agent")?.slice(0, 200) || undefined,
      ip_hint: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || undefined,
      created_at: new Date().toISOString(),
      status: "open" as const,
    };

    const redis = getRedis();
    await redis.set(REPORT_KEY(id), JSON.stringify(record));
    await redis.lpush(REPORTS_LIST, id);

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("report-error POST error:", err);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
