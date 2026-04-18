import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `${USER_PREFIX}${normalizedEmail}`;
    const userData = await kv.hgetall(userKey);

    if (!userData || !userData.created_at) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      email: userData.email,
      cards: userData.cards || [],
      marketing_optin: userData.marketing_optin || false,
      created_at: userData.created_at,
    });
  } catch (err) {
    console.error("GET user error:", err);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
