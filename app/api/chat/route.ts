import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";

const CARD_CONTEXT = `You are a helpful US credit card assistant on OpenCard. You have knowledge of 14 US credit cards.

Card list:
1. Apple Card (Goldman Sachs) - No annual fee, 3% Apple purchases, 2% Apple Pay
2. Atmos Rewards Ascent Visa (Alaska Airlines, Bank of America) - $95 annual fee, 3% airline
3. Atmos Rewards Summit Visa (Alaska Airlines, Bank of America) - $395 annual fee, 3% restaurant/foreign
4. Bank of America Customized Cash Rewards - No annual fee, 3% select category
5. Bank of America Travel Rewards - No annual fee, 1.5% flat rate
6. Chase Sapphire Preferred - $95 annual fee, 5% travel, 3% restaurant
7. Chase Sapphire Reserve - $295 annual fee, 8% travel, 4% dining
8. Citi Strata Elite - $595 annual fee, 10% hotel/airline
9. Discover it Cash Back - No annual fee, 5% rotating category
10. Hilton Honors Aspire (Amex) - $550 annual fee, 14% hotel
11. Hilton Honors Card (Amex) - No annual fee, 7% hotel
12. Hilton Honors Surpass (Amex) - $150 annual fee, 12% hotel
13. Marriott Bonvoy Boundless (Chase) - $95 annual fee, 6% hotel
14. The Platinum Card (Amex) - $695 annual fee, 5% airline/hotel, many benefits

IMPORTANT RULES:
- Never promise approval or guarantee rewards.
- All information is for reference only; check official sources before applying.
- Never help users falsify application information.
- Affiliate links are for reference and do not affect recommendation objectivity.`;

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
    const systemPrompt = `${CARD_CONTEXT}

The user is currently viewing: ${cardName || "No specific card"}${cardId ? ` (card ID: ${cardId})` : ""}
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
