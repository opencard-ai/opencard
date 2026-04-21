import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const Redis = (await import("@upstash/redis")).Redis;

const redis = new Redis({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
});

const USER_PREFIX = "opencard:user:";
const PENDING_PREFIX = "opencard:pending:";
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY!;
const FROM_INBOX = process.env.AGENTMAIL_FROM_INBOX!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opencardai.com";

async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

async function generateToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

/**
 * POST /api/my-cards/verify
 * Body: { email: string }
 * Sends a verification email to confirm the user's email address.
 * Flow: subscribe → verify email → confirmed
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = await hashEmail(normalizedEmail);
    const userKey = `${USER_PREFIX}${emailHash}`;

    // Check if already confirmed
    const existing = await redis.hgetall(userKey) as Record<string, unknown> | null;
    if (existing?.status === "confirmed" && existing?.created_at) {
      return NextResponse.json({ success: true, already_confirmed: true });
    }

    // Generate verification token
    const token = await generateToken();
    const pendingKey = `${PENDING_PREFIX}${token}`;
    const emailForSend = Buffer.from(normalizedEmail.split("").reverse().join("")).toString("base64");

    // Store pending verification data (TTL: 24 hours)
    await redis.set(pendingKey, JSON.stringify({
      email_hash: emailHash,
      email_for_send: emailForSend,
      email_hint: normalizedEmail.substring(0, 3) + "***@" + normalizedEmail.split("@")[1],
      created_at: Date.now(),
    }));
    await redis.expire(pendingKey, 86400);

    // Send verification email
    const verifyLink = `${BASE_URL}/api/my-cards/verify-confirm?token=${token}`;
    const html = `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px;text-align:center">
      <div style="background:#1a1a1a;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="margin:0;font-size:20px;">💳 OpenCard</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px;text-align:center">
        <h2 style="color:#1a1a1a;margin:0 0 16px;font-size:22px;">Confirm your email</h2>
        <p style="color:#666;font-size:15px;margin:0 0 28px;line-height:1.6;">Click the button below to verify your email address and activate your benefit reminders.</p>
        <a href="${verifyLink}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Verify Email Address</a>
        <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>`;

    const res = await fetch(`https://api.agentmail.to/v0/inboxes/${FROM_INBOX}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AGENTMAIL_API_KEY}` },
      body: JSON.stringify({ to: [normalizedEmail], subject: "💳 Verify your OpenCard email", html }),
    });

    if (!res.ok) {
      console.error("Failed to send verification email:", await res.text());
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Verify send error:", err);
    return NextResponse.json({ error: "Failed to send verification" }, { status: 500 });
  }
}
