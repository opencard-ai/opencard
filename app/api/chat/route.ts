import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getCardById, type CreditCard } from "@/lib/cards";

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";

const BASE_CONTEXT = `You are a helpful US credit card assistant on OpenCard, a site indexing 200+ US consumer and business credit cards across major issuers (American Express, Chase, Citi, Capital One, Bank of America, Wells Fargo, U.S. Bank, Discover, Barclays, Synchrony).

IMPORTANT RULES:
- Never promise approval or guarantee rewards.
- All information is for reference only; check official sources before applying.
- Never help users falsify application information.
- Affiliate links are for reference and do not affect recommendation objectivity.
- If you don't have specific data on a card, say so honestly rather than guessing.`;

function buildCardContext(card: CreditCard): string {
  const parts: string[] = [];
  parts.push(`Card: ${card.name} (${card.issuer})`);
  parts.push(`Annual fee: $${card.annual_fee}`);
  if (card.earning_rates?.length) {
    const rates = card.earning_rates.slice(0, 6).map(r => `${r.rate}× ${r.category}`).join(", ");
    parts.push(`Earning: ${rates}`);
  }
  if (card.recurring_credits?.length) {
    const credits = card.recurring_credits.map(c => {
      const amt = c.is_free_night ? "Free Night Award" : (c.amount > 0 ? `$${c.amount}` : "");
      return `${c.name}${amt ? ` (${amt}/${c.frequency})` : ""}`;
    }).join("; ");
    parts.push(`Recurring credits: ${credits}`);
  }
  if (card.welcome_offer) {
    const wo = card.welcome_offer;
    if (wo.bonus_points) parts.push(`Welcome bonus: ${wo.bonus_points.toLocaleString()} pts after $${wo.spending_requirement?.toLocaleString() ?? "?"} in ${wo.time_period_months ?? 3} months`);
  }
  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  // Rate limit check
  const ip = getClientIp(req);
  const { allowed, remaining, resetAt } = rateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": String(resetAt) } }
    );
  }

  let locale = "en";
  let messages: any[] = [];
  let cardName = "";
  let cardId = "";

  try {
    const body = await req.json();
    // Support both array messages (conversational) and single message string (ChatWidget)
    if (Array.isArray(body.messages)) {
      messages = body.messages;
    } else if (typeof body.message === "string" && body.message.trim()) {
      messages = [{ role: "user", content: body.message.trim() }];
    }
    cardName = body.cardName || "";
    cardId = body.cardId || "";
    locale = body.locale || "en";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const langMap: Record<string, string> = {
    en: "English",
    zh: "Chinese (Traditional)",
    es: "Spanish",
  };
  const lang = langMap[locale] || "English";

  try {
    let cardSpecificContext = "";
    if (cardId) {
      const card = getCardById(cardId);
      if (card) {
        cardSpecificContext = `\n\nThe user is currently viewing this card:\n${buildCardContext(card)}`;
      }
    } else if (cardName) {
      cardSpecificContext = `\n\nThe user is currently viewing: ${cardName}`;
    }

    const systemPrompt = `${BASE_CONTEXT}${cardSpecificContext}

IMPORTANT: Always respond in ${lang} only. Never switch languages.

User question:`;

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-10)
    ];

    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "MiniMax-Text-01",
        messages: chatMessages,
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MiniMax API error:", response.status, errorText);
      return NextResponse.json(
        { error: "AI service error" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, AI is temporarily unavailable.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
