import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
const RedisClass = (await import("@upstash/redis")).Redis;
const redis = new RedisClass({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
}) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY!;
const FROM_INBOX = process.env.AGENTMAIL_FROM_INBOX!;
const CRON_SECRET = process.env.CRON_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://opencardai.com";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${CRON_SECRET}`;
}

async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

// Lookup email from hash (email stored in Redis under the same user key)
async function getEmailFromHash(emailHash: string): Promise<string | null> {
  const userKey = `opencard:user:${emailHash}`;
  const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;
  if (!userData) return null;
  // We stored email_hash and email_hint — reconstruct from hint (not real email, for display only)
  // For actual send, we need the real email. Since we only store hash, we can't recover it.
  // Solution: store (hash -> email) mapping separately, encrypted or access-controlled
  // For now: store real email encrypted with a server-side only key
  return (userData.email_for_send as string) || null;
}

// Better approach: store email_for_send alongside hash
// Let's rebuild: in subscribe, store both email_hash and email_for_send (encrypted)
// For simplicity: store email_for_send as a base64 of reversed email with a salt
async function encodeEmailForStorage(email: string): Promise<string> {
  // Simple obfuscation: reverse email, base64 encode
  const reversed = email.split("").reverse().join("");
  const { createHash } = await import("node:crypto");
  const salt = "opencard_email_v1";
  const hash = createHash("sha256").update(salt + reversed).digest("hex");
  return Buffer.from(reversed).toString("base64");
}

async function decodeEmailFromStorage(encoded: string): Promise<string> {
  try {
    const reversed = Buffer.from(encoded, "base64").toString("ascii");
    return reversed.split("").reverse().join("");
  } catch {
    return "";
  }
}

interface RecurringCredit {
  name: string;
  amount?: number;
  frequency: string;
  category: string;
  description?: string;
}

interface CardData {
  card_id: string;
  name: string;
  annual_fee: number;
  recurring_credits?: RecurringCredit[];
}

interface UserProfile {
  email: string;
  cards: string[];
  marketing_optin: boolean;
  status?: string;
  email_for_send?: string;
  created_at: number;
}

async function getCardData(cardIds: string[]): Promise<Record<string, CardData>> {
  try {
    const res = await fetch(`${BASE_URL}/api/cards?full=1`, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const allCards: CardData[] = await res.json();
    const map: Record<string, CardData> = {};
    for (const card of allCards) {
      if (cardIds.includes(card.card_id)) map[card.card_id] = card;
    }
    return map;
  } catch { return {}; }
}

function getCreditsThisPeriod(cards: CardData[]) {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const isNearEndOfMonth = day >= 20;
  const isFirstOfMonth = day <= 3;

  const thisMonth: { card: CardData; credit: RecurringCredit }[] = [];
  const upcoming: { card: CardData; credit: RecurringCredit }[] = [];
  const expiringSoon: { card: CardData; credit: RecurringCredit }[] = [];

  for (const card of cards) {
    for (const credit of card.recurring_credits || []) {
      switch (credit.frequency) {
        case "monthly":
          if (isFirstOfMonth || isNearEndOfMonth) thisMonth.push({ card, credit });
          break;
        case "quarterly":
          if (month % 3 === 0 && isFirstOfMonth) thisMonth.push({ card, credit });
          if (isNearEndOfMonth && month % 3 !== 0) expiringSoon.push({ card, credit });
          break;
        case "semi_annual":
          if ((month === 0 || month === 6) && isFirstOfMonth) thisMonth.push({ card, credit });
          break;
        case "annual":
        case "cardmember_year":
          if (isNearEndOfMonth && month === 11) expiringSoon.push({ card, credit });
          break;
      }
    }
  }
  return { thisMonth, upcoming, expiringSoon };
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.agentmail.to/v0/inboxes/${FROM_INBOX}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AGENTMAIL_API_KEY}` },
      body: JSON.stringify({ to: [to], subject, html }),
    });
    if (!res.ok) console.error("AgentMail error:", await res.text());
    return res.ok;
  } catch (err) { console.error("AgentMail send error:", err); return false; }
}

function buildUnsubscribeLink(emailHash: string): string {
  return `${BASE_URL}/api/my-cards/unsubscribe?hash=${emailHash}`;
}

function buildEmailHtml(
  emailHash: string,
  cards: CardData[],
  thisMonth: { card: CardData; credit: RecurringCredit }[],
  upcoming: { card: CardData; credit: RecurringCredit }[],
  expiringSoon: { card: CardData; credit: RecurringCredit }[],
  lang: string = "en"
): string {
  const UNSUB_LINK = buildUnsubscribeLink(emailHash);
  const CATEGORY_LABELS: Record<string, Record<string, string>> = {
    en: { travel: "Travel", dining: "Dining", entertainment: "Entertainment", shopping: "Shopping", gas: "Gas", grocery: "Grocery", streaming: "Streaming", other: "Other" },
    zh: { travel: "旅遊", dining: "餐飲", entertainment: "娛樂", shopping: "購物", gas: "加油", grocery: "超市", streaming: "串流", other: "其他" },
    es: { travel: "Viaje", dining: "Restaurante", entertainment: "Entretenimiento", shopping: "Compras", gas: "Gasolina", grocery: "Supermercado", streaming: "Streaming", other: "Otro" },
  };
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
  const fmt = (n?: number) => n && n > 0 ? `$${n}` : "";
  const catLabel = (c: string) => labels[c] || c;

  const t = (en: string, zh: string, es: string) => lang === "zh" ? zh : lang === "es" ? es : en;

  let body = `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #1a1a1a; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px;">
      💳 OpenCard — ${t("Your Credit Card Benefits This Month", "本月福利提醒", "Tus beneficios de este mes")}
    </h2>`;

  if (thisMonth.length > 0) {
    body += `<h3 style="color: #16a34a; margin-top: 24px;">✓ ${t("Available this month", "本月可用", "Disponible este mes")}</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr style="background:#f8f9fa;"><th style="text-align:left;padding:8px;font-size:12px;color:#666;">${t("Card","卡片","Tarjeta")}</th><th style="text-align:left;padding:8px;font-size:12px;color:#666;">${t("Benefit","福利","Beneficio")}</th><th style="text-align:right;padding:8px;font-size:12px;color:#666;">${t("Amount","金額","Monto")}</th></tr></thead>
      <tbody>${thisMonth.map(({card,credit}) => `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px;font-size:13px;color:#333;">${card.name}</td><td style="padding:8px;font-size:13px;color:#555;">${credit.name}</td><td style="padding:8px;font-size:13px;text-align:right;font-weight:600;">${fmt(credit.amount)}</td></tr>`).join("")}</tbody></table>`;
  }

  if (expiringSoon.length > 0) {
    body += `<h3 style="color:#dc2626;margin-top:24px;">⚠️ ${t("Expiring soon","即將到期","Vence pronto")}</h3>
    <p style="color:#666;font-size:13px;margin-bottom:8px;">${t("These benefits are expiring — use them before they're gone!","這些福利即將到期，還沒使用的話快把握！","¡Estas ventajas están por vencer, úsalas antes de que sea tarde!")}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody>${expiringSoon.map(({card,credit}) => `<tr style="border-bottom:1px solid #fee2e2;background:#fef2f2;"><td style="padding:8px;font-size:13px;">${card.name}</td><td style="padding:8px;font-size:13px;">${credit.name}</td><td style="padding:8px;text-align:right;font-weight:600;color:#dc2626;">${fmt(credit.amount)}</td></tr>`).join("")}</tbody></table>`;
  }

  if (upcoming.length > 0) {
    body += `<h3 style="color:#2563eb;margin-top:24px;">📅 ${t("Upcoming","即將到來","Próximamente")}</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody>${upcoming.map(({card,credit}) => `<tr style="border-bottom:1px solid #dbeafe;"><td style="padding:8px;font-size:13px;">${card.name}</td><td style="padding:8px;font-size:13px;">${credit.name}</td><td style="padding:8px;text-align:right;font-weight:600;">${fmt(credit.amount)}</td></tr>`).join("")}</tbody></table>`;
  }

  body += `<div style="margin-top:32px;padding:16px;background:#f8f9fa;border-radius:8px;">
    <p style="font-size:12px;color:#999;margin:0;">${t("Found an error?","發現錯誤？","¿Encontraste un error?")} → <a href="mailto:opencard@opencardai.com" style="color:#666;">opencard@opencardai.com</a></p>
    <p style="font-size:11px;color:#ccc;margin:8px 0 0;">
      <a href="${UNSUB_LINK}" style="color:#999;text-decoration:underline;">${t("Unsubscribe","取消訂閱","Cancelar suscripción")}</a> · OpenCard · <a href="${BASE_URL}" style="color:#ccc;">opencardai.com</a>
    </p>
  </div></div>`;

  return body;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const subscriberHashes = (await redis.smembers("opencard:subscribers")) as unknown as string[];
    if (!subscriberHashes?.length) return NextResponse.json({ message: "No subscribers", sent: 0 });

    let sent = 0, failed = 0;

    for (const emailHash of subscriberHashes) {
      const userKey = `opencard:user:${emailHash}`;
      const userData = await redis.hgetall(userKey) as Record<string, unknown> | null;

      if (!userData || !userData.created_at) continue;
      if (!userData.marketing_optin) continue;
      if (userData.status === "unsubscribed") continue;

      const cards: string[] = (userData.cards as string[]) || [];
      if (!cards.length) continue;

      // Get real email from stored encoded version
      const encodedEmail = userData.email_for_send as string;
      if (!encodedEmail) { console.warn("No email_for_send for hash:", emailHash); continue; }
      const realEmail = await decodeEmailFromStorage(encodedEmail);
      if (!isValidEmail(realEmail)) { console.warn("Invalid email for hash:", emailHash); continue; }

      const cardsMap = await getCardData(cards);
      const userCards = cards.map(id => cardsMap[id]).filter(Boolean) as CardData[];
      if (!userCards.length) continue;

      const { thisMonth, upcoming, expiringSoon } = getCreditsThisPeriod(userCards);
      if (!thisMonth.length && !expiringSoon.length && !upcoming.length) continue;

      const subject = thisMonth.length > 0
        ? `💳 OpenCard: ${thisMonth.length} benefit${thisMonth.length > 1 ? "s" : ""} available this month`
        : `⚠️ OpenCard: ${expiringSoon.length} benefit${expiringSoon.length > 1 ? "s" : ""} expiring soon`;

      const html = buildEmailHtml(emailHash, userCards, thisMonth, upcoming, expiringSoon);
      if (await sendEmail(realEmail, subject, html)) sent++; else failed++;
      await new Promise(r => setTimeout(r, 100));
    }

    return NextResponse.json({ sent, failed, total: subscriberHashes.length });
  } catch (err) { console.error("Cron error:", err); return NextResponse.json({ error: "Cron failed" }, { status: 500 }); }
}
