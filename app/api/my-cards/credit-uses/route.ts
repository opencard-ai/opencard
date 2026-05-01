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

interface CreditUseEntry {
  card_id: string;
  credit_key: string;
  period_key: string;
  used_amount: number;
  used_at: string;
  note?: string;
}

function parseField(field: string): { card_id: string; credit_key: string; period_key: string } | null {
  // Format: card_id:credit_key:period_key — but credit_key/period_key may
  // themselves contain '-'. We split from the right twice on ':'.
  const parts = field.split(":");
  if (parts.length < 3) return null;
  // Rejoin everything except the last two pieces back into card_id (defensive,
  // although our id regex disallows ':' so this should be a 3-piece split).
  const period_key = parts[parts.length - 1];
  const credit_key = parts[parts.length - 2];
  const card_id = parts.slice(0, parts.length - 2).join(":");
  return { card_id, credit_key, period_key };
}

/**
 * GET /api/my-cards/credit-uses?email=...&card_id=...
 *   Returns all check-off entries for the user, optionally filtered by card_id.
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
    const usesKey = `${USER_PREFIX}${emailHash}:credit_uses`;
    const raw = await redis.hgetall(usesKey) as Record<string, unknown> | null;

    const entries: CreditUseEntry[] = [];
    if (raw) {
      for (const [field, val] of Object.entries(raw)) {
        const parsed = parseField(field);
        if (!parsed) continue;
        if (card_id_filter && parsed.card_id !== card_id_filter) continue;
        const inner = typeof val === "string" ? safeParse(val) : (val as Record<string, unknown>);
        if (!inner) continue;
        entries.push({
          ...parsed,
          used_amount: Number(inner.used_amount ?? 0),
          used_at: String(inner.used_at ?? ""),
          ...(inner.note ? { note: String(inner.note) } : {}),
        });
      }
    }

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("credit-uses GET error:", err);
    return NextResponse.json({ error: "Failed to list credit uses" }, { status: 500 });
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
