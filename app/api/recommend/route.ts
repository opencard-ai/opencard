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

  try {
    const body = await req.json();
    message = body.message || "";
    locale = body.locale || "en";
    preferences = body.preferences || null;
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

  const systemPrompt = `You are a friendly US credit card recommendation assistant on OpenCard. Your job is to help users find the best credit card for their needs.

CARD DATABASE (14 cards):
${cardData.map(c => `- ${c.name} (${c.issuer}): $${c.annual_fee} annual fee. Categories: ${c.earning_rates.map(r => `${r.rate}× ${r.category}`).join(", ")}. Tags: ${c.tags.join(", ")}. ${c.annual_fee === 0 ? "No annual fee!" : ""}`).join("\n")}

IMPORTANT BEHAVIOR - Follow these rules strictly:
1. ALWAYS ask questions with EXACT emoji options on separate lines. NEVER ask numbered open-ended questions without options.
2. When asking multiple choice questions, you MUST format them like this:
   What do you prefer?
   💰 Cash Back
   ✈️ Travel Rewards
   🏅 Points/Miles
   NEVER say "Please answer any or all of these questions" — just wait for their selection.
3. When user gives multiple answers at once, use ALL info and recommend cards immediately.
4. Always respond in ${lang} only.
5. Give 2-3 card recommendations with a brief reason.
6. After recommendations, ask if they have follow-up questions.

Respond conversationally, like a helpful friend who knows credit cards well.`;

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: "AI configuration error. Please try again later." }, { status: 500 });
  }

  const response = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "MiniMax-Text-01",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("MiniMax error:", err);
    return NextResponse.json({ reply: "Sorry, AI is temporarily unavailable. Please try again." }, { status: 500 });
  }

  const data = await response.json();
  const aiMessage = data.choices?.[0]?.message?.content || "I'm having trouble understanding. Could you rephrase that?";

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
