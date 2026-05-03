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

// Owner notification — fires after the Redis write so the user response
// isn't blocked if AgentMail is slow. Failures are swallowed (the report
// is already saved; email is just a courtesy ping).
async function notifyOwner(record: {
  id: string;
  card_id: string;
  message: string;
  email?: string;
  lang: string;
  ip_hint?: string;
  user_agent?: string;
  created_at: string;
}): Promise<void> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inbox = process.env.AGENTMAIL_FROM_INBOX;
  const to = process.env.OWNER_EMAIL || "opencard@opencardai.com";
  if (!apiKey || !inbox) return;

  const cardUrl = `https://opencardai.com/${record.lang}/cards/${record.card_id}`;
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const html = `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#1a1a1a;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
      <strong style="font-size:15px;">📩 New OpenCard error report</strong>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:18px;border-radius:0 0 8px 8px;background:#fff">
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111">
        <tr><td style="padding:4px 8px 4px 0;color:#666;width:90px">Card</td><td><a href="${cardUrl}" style="color:#2563eb;text-decoration:none">${escape(record.card_id)}</a></td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">Lang</td><td>${escape(record.lang)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">From</td><td>${record.email ? escape(record.email) : "<em style=\"color:#9ca3af\">anonymous</em>"}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">When</td><td>${escape(record.created_at)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">IP</td><td style="color:#9ca3af">${record.ip_hint ? escape(record.ip_hint) : "—"}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">UA</td><td style="color:#9ca3af;font-size:11px">${record.user_agent ? escape(record.user_agent) : "—"}</td></tr>
      </table>
      <div style="margin-top:14px;padding:12px;background:#f9fafb;border-left:3px solid #1a1a1a;border-radius:4px;white-space:pre-wrap;font-size:14px;line-height:1.5">${escape(record.message)}</div>
      <p style="margin:14px 0 0;color:#9ca3af;font-size:11px">Report id: <code>${escape(record.id)}</code></p>
    </div>
  </div>`;

  try {
    await fetch(`https://api.agentmail.to/v0/inboxes/${inbox}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        to: [to],
        subject: `[OpenCard] error report — ${record.card_id}`,
        html,
      }),
    });
  } catch (err) {
    console.error("notifyOwner failed:", err);
  }
}

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

    // Fire-and-forget owner ping so user response isn't blocked on AgentMail.
    notifyOwner(record).catch(() => {});

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("report-error POST error:", err);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
