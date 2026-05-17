import { NextRequest, NextResponse } from "next/server";

// @ts-expect-error upstash ESM type interop in Next route handlers
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

interface UserCardInstance {
  instance_id: string;
  card_id: string;
  nickname?: string;
  last4?: string;
  created_at: number;
  status: "active" | "closed";
}

function normalizeInstances(userData: Record<string, unknown>): UserCardInstance[] {
  const raw = userData.card_instances;
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        instance_id: String(x.instance_id || x.card_id || ""),
        card_id: String(x.card_id || x.instance_id || ""),
        ...(x.nickname ? { nickname: String(x.nickname) } : {}),
        ...(x.last4 ? { last4: String(x.last4).slice(-4) } : {}),
        created_at: Number(x.created_at || Date.now()),
        status: (x.status === "closed" ? "closed" : "active") as "active" | "closed",
      }))
      .filter((x) => x.card_id && x.instance_id);
  }
  const legacyCards = Array.isArray(userData.cards) ? (userData.cards as string[]) : [];
  return legacyCards.map((card_id) => ({ instance_id: card_id, card_id, created_at: Number(userData.created_at || Date.now()), status: "active" }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;
    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;

    if (!userData || !userData.created_at) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      // Never return the hash — only card data
      cards: userData.cards || [],
      card_instances: normalizeInstances(userData),
      marketing_optin: userData.marketing_optin || false,
      created_at: userData.created_at,
    });
  } catch (err) {
    console.error("GET user error:", err);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
