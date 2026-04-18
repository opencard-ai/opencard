import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";
const PENDING_PREFIX = "opencard:pending:";
const SUBSCRIBERS_SET = "opencard:subscribers";
const RATE_LIMIT_PREFIX = "opencard:ratelimit:";
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY!;
const FROM_INBOX = process.env.AGENTMAIL_FROM_INBOX!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opencardai.com";

async function rateLimit(req: NextRequest): Promise<{ allowed: boolean }> {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const key = `${RATE_LIMIT_PREFIX}subscribe:${ip}`;
  try {
    const count = await redis.get<number>(key);
    if (count !== null && count >= 5) return { allowed: false };
    await redis.incr(key);
    if (count === null) await redis.expire(key, 3600);
    return { allowed: true };
  } catch { return { allowed: true }; }
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

async function generateToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyLink = `${BASE_URL}/api/my-cards/verify-confirm?token=${token}`;
  const html = `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:0;text-align:center">
    <div style="background:#1a1a1a;color:#fff;padding:20px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px;">💳 OpenCard</h1>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
      <h2 style="color:#1a1a1a;margin:0 0 16px;font-size:22px;">Confirm your email</h2>
      <p style="color:#666;font-size:15px;margin:0 0 28px;line-height:1.6;">Click the button below to verify your email and activate your benefit reminders.</p>
      <a href="${verifyLink}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Verify Email Address</a>
      <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">This link expires in 24 hours. If you didn't request this, ignore this email.</p>
    </div>
  </div>`;

  try {
    const res = await fetch(`https://api.agentmail.to/v0/inboxes/${FROM_INBOX}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AGENTMAIL_API_KEY}` },
      body: JSON.stringify({ to: [email], subject: "💳 Verify your OpenCard email", html }),
    });
    return res.ok;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const { allowed } = await rateLimit(req);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const emailForSend = await encodeEmailForSend(normalizedEmail);
    const userKey = `${USER_PREFIX}${emailHash}`;

    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;

    // Already confirmed — just update silently
    if (existing?.status === "confirmed") {
      const updates: Record<string, unknown> = { updated_at: Date.now() };
      if (cards !== undefined) updates.cards = cards;
      if (marketing_optin !== undefined) updates.marketing_optin = marketing_optin;
      await redis.hset(userKey, updates);
      return NextResponse.json({ success: true, already_confirmed: true });
    }

    // Pending or new — generate token and send verification email
    const token = await generateToken();
    const pendingKey = `${PENDING_PREFIX}${token}`;

    await redis.set(pendingKey, JSON.stringify({
      email_hash: emailHash,
      email_for_send: emailForSend,
      email_hint: normalizedEmail.substring(0, 3) + "***@" + normalizedEmail.split("@")[1],
      cards: cards && Array.isArray(cards) ? cards : [],
      marketing_optin: Boolean(marketing_optin),
      created_at: (existing?.created_at as number) || Date.now(),
    }));
    await redis.expire(pendingKey, 86400);

    const sent = await sendVerificationEmail(normalizedEmail, token);
    if (!sent) {
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pending_verification: true,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { email, cards, marketing_optin } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const emailHash = await hashEmail(email);
    const userKey = `${USER_PREFIX}${emailHash}`;

    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (!existing?.created_at) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: Date.now() };
    if (cards !== undefined) updates.cards = cards;
    if (marketing_optin !== undefined) updates.marketing_optin = marketing_optin;

    await redis.hset(userKey, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
