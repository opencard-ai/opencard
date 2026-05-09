import { NextRequest, NextResponse } from "next/server";
import { getAllCards } from "@/lib/cards";
import { scoreCards, generateRecommendationExplanation, type UserPreferences } from "@/lib/recommend";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Rate limit check
  const ip = getClientIp(req);
  const { allowed, remaining, resetAt } = rateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { reply: "Too many requests. Please slow down." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": String(resetAt) } }
    );
  }
  let message = "";
  let locale = "en";
  let preferences: any = null;
  let conversationHistory: any[] = [];
  let existingCards: string[] = [];

  try {
    const body = await req.json();
    message = body.message || "";
    locale = body.locale || "en";
    preferences = body.preferences || null;
    // Accept full conversation history from widget
    conversationHistory = Array.isArray(body.messages) ? body.messages : [];
    existingCards = Array.isArray(body.existingCards) ? body.existingCards : [];
    if (preferences && existingCards.length > 0) {
      preferences.currentCards = existingCards;
    }
  } catch {
    return NextResponse.json({ reply: "Invalid request" }, { status: 400 });
  }

  const langMap: Record<string, string> = {
    en: "English",
    zh: "Chinese (Traditional)",
    es: "Spanish",
  };
  const lang = langMap[locale] || "English";

  // Direct scoring mode
  if (preferences) {
    const scores = scoreCards(preferences);
    const locale2 = preferences.locale || "en";
    const responses: Record<string, string> = {
      en: `Based on your preferences, here are my top 3 card recommendations:\n\n${scores.slice(0, 3).map((s, i) => `${i+1}. **${s.card.name}** — ${s.card.issuer}\n   Annual Fee: ${s.card.annual_fee === 0 ? "No Annual Fee" : `$${s.card.annual_fee}`}\n   ${s.reasons.slice(0, 2).map(r => `• ${r}`).join("\n   ")}`).join("\n\n")}\n\n*Click any card above to learn more, or ask me to compare two cards!*`,
      zh: `根據你的需求，以下是我最推薦的 3 張卡片：\n\n${scores.slice(0, 3).map((s, i) => `${i+1}. **${s.card.name}** — ${s.card.issuer}\n   年費：${s.card.annual_fee === 0 ? "免年費" : `$${s.card.annual_fee}`}\n   ${s.reasons.slice(0, 2).map(r => `• ${r}`).join("\n   ")}`).join("\n\n")}\n\n*點擊任一卡片了解更多，或問我比較兩張卡！*`,
      es: `Según tus preferencias, aquí están mis 3 mejores recomendaciones:\n\n${scores.slice(0, 3).map((s, i) => `${i+1}. **${s.card.name}** — ${s.card.issuer}\n   Cuota Anual: ${s.card.annual_fee === 0 ? "Sin Cuota Anual" : `$${s.card.annual_fee}`}\n   ${s.reasons.slice(0, 2).map(r => `• ${r}`).join("\n   ")}`).join("\n\n")}\n\n*Haz clic en cualquier tarjeta para más información, o pregúname para comparar dos tarjetas.*`,
    };
    return NextResponse.json({ reply: responses[locale2] || responses.en });
  }

  // Conversational mode
  const cardData = getAllCards();

  // User's existing card portfolio (from MyCards / localStorage). Surface
  // this to the LLM in conversational mode so questions like "which of my
  // cards covers bag fees" can be answered against the user's actual cards
  // rather than the whole DB. Previously existingCards was only consumed
  // by the preferences-scoring branch.
  const ownedCards = existingCards
    .map((cid) => cardData.find((c) => c.card_id === cid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const myCardsBlock = ownedCards.length > 0
    ? `\nUSER ALREADY OWNS THESE CARDS (their portfolio):
${ownedCards.map((c) => `- ${c.name} (${c.issuer}, $${c.annual_fee} AF). Tags: ${c.tags.join(", ")}`).join("\n")}

When the user asks "which of MY cards…", "do I have a card for…", "我手上的卡…", "我有的卡…" or similar portfolio-scoped questions, answer ONLY from the cards above. Do NOT recommend cards they don't own unless they explicitly ask for new cards.`
    : `\nUSER PORTFOLIO: empty (no cards saved in MyCards yet).

If the user asks "which of MY cards…", "do I have a card for…", "我手上的卡…", "我有的卡…" or similar portfolio-scoped questions, DO NOT dump the whole catalog. Tell them concisely (in their language) that you can't see their cards yet, and suggest they add cards in the My Cards page (linked from the homepage) so you can answer portfolio questions next time. Then offer to recommend a NEW card for the underlying need.`;

  const systemPrompt = `You are a friendly US credit card recommendation assistant on OpenCard. Your job is to help users find the best credit card for their needs.

CARD DATABASE:
${cardData.map(c => `- ${c.name} (${c.issuer}): $${c.annual_fee} annual fee. Categories: ${c.earning_rates.map(r => `${r.rate}× ${r.category}`).join(", ")}. Tags: ${c.tags.join(", ")}. ${c.annual_fee === 0 ? "No annual fee!" : ""}`).join("\n")}
${myCardsBlock}

IMPORTANT BEHAVIOR - Follow these rules strictly:
1. ALWAYS ask questions with EXACT emoji options on separate lines. NEVER ask numbered open-ended questions without options.
2. When asking multiple choice questions, you MUST format them like this:
   What do you prefer?
   💰 Cash Back
   ✈️ Travel Rewards
   🏅 Points/Miles
   NEVER say "Please answer any or all of these questions" — just wait for their selection.
3. When user gives multiple answers at once, use ALL info and recommend cards immediately.
4. If user mentions MULTIPLE airlines (e.g., "Delta AND United", "both Delta and JetBlue"), ALWAYS recommend cards for ALL mentioned airlines — do NOT pick just one.
5. Always respond in ${lang} only.
6. Give 2-3 card recommendations with a brief reason. For expert users mentioning MQD, 5/24, velocity rules, acknowledge these and incorporate into reasoning.
7. After recommendations, ask if they have follow-up questions.
8. IMPORTANT card facts to remember:
   - Marriott Bonvoy Brilliant Amex: lounge benefit is Priority Pass (NOT a branded Marriott lounge)
   - Chase Sapphire Reserve: best for travel + dining combined with Priority Pass
   - United cards: United Explorer (Chase), United Club Infinite, United Quest
   - Delta cards: Gold ($0 AF), Platinum ($250), Reserve ($650) — Reserve gives MQD boost

Respond conversationally, like a helpful friend who knows credit cards well.`;

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: "AI configuration error. Please try again later." }, { status: 500 });
  }

  // Build conversation history for MiniMax
  const historyMessages = conversationHistory.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));

  // Wrap the MiniMax call in an explicit timeout + try/catch so a hang
  // bubbles up as our own JSON 500 instead of Vercel's HTML 504 page.
  // The widget's fetch().then(res => res.json()) was throwing JSON parse
  // errors on cold-start hangs, which surfaced as "Something went wrong"
  // on the user's first message (the second message after warm-up worked).
  let response: Response;
  try {
    response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: message }
        ],
        temperature: 0.7,
        // Skip M2.7's reasoning pass — recommend replies are short and don't
        // benefit enough from chain-of-thought to justify the 10-15s latency.
        internal_thought: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error("MiniMax fetch failed:", msg);
    return NextResponse.json(
      { reply: "AI took too long to respond. Please try again." },
      { status: 504 },
    );
  }

  if (!response.ok) {
    const err = await response.text();
    console.error("MiniMax error:", err);
    return NextResponse.json({ reply: "Sorry, AI is temporarily unavailable. Please try again." }, { status: 500 });
  }

  const data = await response.json();
  // M2.7 is a reasoning model and may emit <think>...</think> tokens before
  // the user-facing content; strip them so the recommend widget doesn't show
  // chain-of-thought.
  const rawMessage = data.choices?.[0]?.message?.content || "I'm having trouble understanding. Could you rephrase that?";
  const aiMessage = rawMessage.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  let recommendationResult = null;
  try {
    const jsonMatch = aiMessage.match(/\{[\s\S]*?"action"\s*:\s*"recommend"[\s\S]*?\}/);
    if (jsonMatch) {
      const params = JSON.parse(jsonMatch[0]);
      const scores = scoreCards(params);
      recommendationResult = generateRecommendationExplanation(scores, params);
    }
  } catch (e) {
    // Not a JSON response, just return the text
  }

  const finalReply = recommendationResult
    ? `${aiMessage.replace(/\{[\s\S]*?\}/, "").trim()}\n\n${recommendationResult}`
    : aiMessage;

  return NextResponse.json({ reply: finalReply });
}
