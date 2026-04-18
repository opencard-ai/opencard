import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

export async function POST(req: NextRequest) {
  try {
    const { email, card_id } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!card_id || typeof card_id !== "string") {
      return NextResponse.json({ error: "card_id is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `${USER_PREFIX}${normalizedEmail}`;

    // Get existing cards array
    const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (!userData || !userData.created_at) {
      return NextResponse.json({ error: "User not subscribed" }, { status: 404 });
    }

    const existingCards = (userData.cards as string[]) || [];

    // Add card if not already present
    if (!existingCards.includes(card_id)) {
      const updatedCards = [...existingCards, card_id];
      await redis.hset(userKey, {
        cards: updatedCards,
        updated_at: Date.now(),
      });
      return NextResponse.json({ success: true, cards: updatedCards });
    }

    return NextResponse.json({ success: true, cards: existingCards, already_saved: true });
  } catch (err) {
    console.error("Save card error:", err);
    return NextResponse.json({ error: "Failed to save card" }, { status: 500 });
  }
}
