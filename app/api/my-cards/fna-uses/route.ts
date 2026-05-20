import { NextRequest, NextResponse } from "next/server";

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

interface FnaUseEntry {
  card_id: string;
  anniversary_year: number;
  used_at: string;
  redeemed_value?: number;
  note?: string;
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * GET /api/my-cards/fna-uses?email=...&card_id=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const card_id_filter = searchParams.get("card_id");

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (card_id_filter && !ID_RE.test(card_id_filter)) {
      return NextResponse.json({ error: "Invalid card_id" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const redis = getRedis();
    const fnaKey = `${USER_PREFIX}${emailHash}:fna_uses`;
    const raw = await redis.hgetall(fnaKey) as Record<string, unknown> | null;

    const entries: FnaUseEntry[] = [];
    if (raw) {
      for (const [field, val] of Object.entries(raw)) {
        const lastColon = field.lastIndexOf(":");
        if (lastColon < 0) continue;
        const card_id = field.slice(0, lastColon);
        const yearNum = Number(field.slice(lastColon + 1));
        if (!Number.isFinite(yearNum)) continue;
        if (card_id_filter && card_id !== card_id_filter) continue;

        const inner = typeof val === "string" ? safeParse(val) : (val as Record<string, unknown>);
        if (!inner) continue;
        entries.push({
          card_id,
          anniversary_year: yearNum,
          used_at: String(inner.used_at ?? ""),
          ...(typeof inner.redeemed_value === "number" ? { redeemed_value: inner.redeemed_value } : {}),
          ...(inner.note ? { note: String(inner.note) } : {}),
        });
      }
    }

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("fna-uses GET error:", err);
    return NextResponse.json({ error: "Failed to list FNA uses" }, { status: 500 });
  }
}
