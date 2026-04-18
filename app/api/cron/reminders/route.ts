import { NextRequest, NextResponse } from "next/server";

// @ts-ignore
// @ts-ignore
const RedisClass = (await import("@upstash/redis")).Redis;
const redis = new RedisClass({
  url: process.env.UPSTASH_KV_REST_API_URL!,
  token: process.env.UPSTASH_KV_REST_API_TOKEN!,
}) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY!;
const FROM_INBOX = process.env.AGENTMAIL_FROM_INBOX!; // e.g. "delightfulschool306@agentmail.to"
const CRON_SECRET = process.env.CRON_SECRET!;

// Verify cron authorization
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${CRON_SECRET}`;
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
  created_at: number;
}

// Fetch card data from our own API
async function getCardData(cardIds: string[]): Promise<Record<string, CardData>> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://opencardai.com";
    const res = await fetch(`${baseUrl}/api/cards?full=1`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    if (!res.ok) return {};
    const allCards: CardData[] = await res.json();
    const map: Record<string, CardData> = {};
    for (const card of allCards) {
      if (cardIds.includes(card.card_id)) {
        map[card.card_id] = card;
      }
    }
    return map;
  } catch {
    return {};
  }
}

// Determine which credits are relevant for today
function getCreditsThisPeriod(cards: CardData[]) {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth(); // 0-indexed
  const dayOfWeek = now.getDay();
  const isNearEndOfMonth = day >= 20;
  const isFirstOfMonth = day <= 3;

  const thisMonth: { card: CardData; credit: RecurringCredit }[] = [];
  const upcoming: { card: CardData; credit: RecurringCredit }[] = [];
  const expiringSoon: { card: CardData; credit: RecurringCredit }[] = [];

  for (const card of cards) {
    for (const credit of card.recurring_credits || []) {
      switch (credit.frequency) {
        case "monthly":
          // Remind on 1st (available) and 20th (催促)
          if (isFirstOfMonth) {
            thisMonth.push({ card, credit });
          } else if (isNearEndOfMonth) {
            thisMonth.push({ card, credit }); // End of month催促
          }
          break;
        case "quarterly":
          // Remind quarterly credit holders on month 1 of each quarter
          if (month % 3 === 0 && isFirstOfMonth) {
            thisMonth.push({ card, credit });
          }
          // Expiring if we're in month 2 or 3 of quarter and near end
          if (isNearEndOfMonth && month % 3 !== 0) {
            expiringSoon.push({ card, credit });
          }
          break;
        case "semi_annual":
          // Remind at start of Jan and July
          if ((month === 0 || month === 6) && isFirstOfMonth) {
            thisMonth.push({ card, credit });
          }
          break;
        case "annual":
          // Remind 14 days before end of year, and 45 days before annual fee due
          if (isNearEndOfMonth && month === 11) {
            expiringSoon.push({ card, credit });
          }
          break;
        case "cardmember_year":
          // Similar to annual
          if (isNearEndOfMonth) {
            expiringSoon.push({ card, credit });
          }
          break;
      }
    }
  }

  return { thisMonth, upcoming, expiringSoon };
}

// Send email via AgentMail API
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.agentmail.to/v0/inboxes/${FROM_INBOX}/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AGENTMAIL_API_KEY}`,
      },
      body: JSON.stringify({
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("AgentMail error:", err);
    }
    return res.ok;
  } catch (err) {
    console.error("AgentMail send error:", err);
    return false;
  }
}

function buildEmailHtml(
  email: string,
  cards: CardData[],
  thisMonth: { card: CardData; credit: RecurringCredit }[],
  upcoming: { card: CardData; credit: RecurringCredit }[],
  expiringSoon: { card: CardData; credit: RecurringCredit }[],
  lang: string = "en"
): string {
  const CATEGORY_LABELS: Record<string, Record<string, string>> = {
    en: { travel: "Travel", dining: "Dining", entertainment: "Entertainment", shopping: "Shopping", gas: "Gas", grocery: "Grocery", streaming: "Streaming", other: "Other" },
    zh: { travel: "旅遊", dining: "餐飲", entertainment: "娛樂", shopping: "購物", gas: "加油", grocery: "超市", streaming: "串流", other: "其他" },
  };
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;

  const formatAmount = (amount?: number) => amount && amount > 0 ? `$${amount}` : "";
  const categoryLabel = (cat: string) => labels[cat] || cat;

  let body = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px;">
        💳 OpenCard — ${lang === "zh" ? "本月福利提醒" : lang === "es" ? "Tus beneficios de este mes" : "Your Credit Card Benefits This Month"}
      </h2>
  `;

  if (thisMonth.length > 0) {
    body += `
      <h3 style="color: #16a34a; margin-top: 24px;">✓ ${lang === "zh" ? "本月可用" : lang === "es" ? "Disponible este mes" : "Available this month"}</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="text-align: left; padding: 8px; font-size: 12px; color: #666;">${lang === "zh" ? "卡片" : "Card"}</th>
            <th style="text-align: left; padding: 8px; font-size: 12px; color: #666;">${lang === "zh" ? "福利" : "Benefit"}</th>
            <th style="text-align: right; padding: 8px; font-size: 12px; color: #666;">${lang === "zh" ? "金額" : "Amount"}</th>
          </tr>
        </thead>
        <tbody>
          ${thisMonth.map(({ card, credit }) => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-size: 13px; color: #333;">${card.name}</td>
              <td style="padding: 8px; font-size: 13px; color: #555;">${credit.name}</td>
              <td style="padding: 8px; font-size: 13px; text-align: right; font-weight: 600;">${formatAmount(credit.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  if (expiringSoon.length > 0) {
    body += `
      <h3 style="color: #dc2626; margin-top: 24px;">⚠️ ${lang === "zh" ? "即將到期" : lang === "es" ? "Vence pronto" : "Expiring soon"}</h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        ${lang === "zh" ? "這些福利即將到期，還沒使用的話快把握！" : lang === "es" ? "¡Estas ventajas están por vencer, usalas antes de que sea tarde!" : "These benefits are expiring — use them before they're gone!"}
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tbody>
          ${expiringSoon.map(({ card, credit }) => `
            <tr style="border-bottom: 1px solid #fee2e2; background: #fef2f2;">
              <td style="padding: 8px; font-size: 13px;">${card.name}</td>
              <td style="padding: 8px; font-size: 13px;">${credit.name}</td>
              <td style="padding: 8px; text-align: right; font-weight: 600; color: #dc2626;">${formatAmount(credit.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  if (upcoming.length > 0) {
    body += `
      <h3 style="color: #2563eb; margin-top: 24px;">📅 ${lang === "zh" ? "即將到來" : lang === "es" ? "Próximamente" : "Upcoming"}</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tbody>
          ${upcoming.map(({ card, credit }) => `
            <tr style="border-bottom: 1px solid #dbeafe;">
              <td style="padding: 8px; font-size: 13px;">${card.name}</td>
              <td style="padding: 8px; font-size: 13px;">${credit.name}</td>
              <td style="padding: 8px; text-align: right; font-weight: 600;">${formatAmount(credit.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  body += `
      <div style="margin-top: 32px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          ${lang === "zh" 
            ? "這筆資料有誤？告訴我們 → <a href='mailto:opencard@opencardai.com' style='color: #666;'>opencard@opencardai.com</a>" 
            : lang === "es" 
            ? "¿Datos incorrectos? Reportalos → <a href='mailto:opencard@opencardai.com' style='color: #666;'>opencard@opencardai.com</a>"
            : "Found an error? Report it → <a href='mailto:opencard@opencardai.com' style='color: #666;'>opencard@opencardai.com</a>"}
        </p>
        <p style="font-size: 11px; color: #ccc; margin: 8px 0 0;">
          OpenCard — Your credit card benefits assistant · <a href='https://opencardai.com' style='color: #ccc;'>opencardai.com</a>
        </p>
      </div>
    </div>
  `;

  return body;
}

// Main cron handler
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all subscriber emails
    const subscriberEmails = await redis.smembers("opencard:subscribers") as unknown as string[];
    if (!subscriberEmails || (subscriberEmails as string[]).length === 0) {
      return NextResponse.json({ message: "No subscribers", sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const email of subscriberEmails as string[]) {
      const userKey = `opencard:user:${email}`;
      const userData = (await redis.hgetall(userKey)) as unknown as UserProfile | null;
      
      if (!userData || !userData.cards || userData.cards.length === 0) continue;
      if (!userData.marketing_optin) continue; // Skip if no marketing consent

      const cardsMap = await getCardData(userData.cards);
      const userCards = userData.cards.map((id) => cardsMap[id]).filter(Boolean) as CardData[];
      
      if (userCards.length === 0) continue;

      const { thisMonth, upcoming, expiringSoon } = getCreditsThisPeriod(userCards);

      // Only send if there's something to remind
      if (thisMonth.length === 0 && expiringSoon.length === 0 && upcoming.length === 0) {
        continue;
      }

      const subject = thisMonth.length > 0
        ? `💳 OpenCard: ${thisMonth.length} benefit${thisMonth.length > 1 ? "s" : ""} available this month`
        : `⚠️ OpenCard: ${expiringSoon.length} benefit${expiringSoon.length > 1 ? "s" : ""} expiring soon`;

      const html = buildEmailHtml(email, userCards, thisMonth, upcoming, expiringSoon);
      const success = await sendEmail(email, subject, html);

      if (success) sent++;
      else failed++;

      // Rate limit: wait 100ms between sends to avoid overwhelming AgentMail
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({ sent, failed, total: (subscriberEmails as string[]).length });
  } catch (err) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
