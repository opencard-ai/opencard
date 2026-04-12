import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";

const CARD_CONTEXT = `你是 OpenCard 的 AI 信用卡助理。以下是你知道的卡片資訊：

卡片列表（14張）：
1. Apple Card (Goldman Sachs) - 免年費，3% Apple消費，2% Apple Pay
2. Atmos Rewards Ascent Visa (Alaska Airlines, Bank of America) - 年費$95，3% airline
3. Atmos Rewards Summit Visa (Alaska Airlines, Bank of America) - 年費$395，3% restaurant/foreign
4. Bank of America Customized Cash Rewards - 免年費，3% 自選類別
5. Bank of America Travel Rewards - 免年費，1.5% 全額回饋
6. Chase Sapphire Preferred - 年費$95，5% travel, 3% restaurant
7. Chase Sapphire Reserve - 年費$795，8% travel, 4% airline
8. Citi Strata Elite - 年費$595，10% hotel/airline
9. Discover it Cash Back - 免年費，5% rotating category
10. Hilton Honors Aspire (Amex) - 年費$550，14% hotel
11. Hilton Honors Card (Amex) - 免年費，7% hotel
12. Hilton Honors Surpass (Amex) - 年費$150，12% hotel
13. Marriott Bonvoy Boundless (Chase) - 年費$95，6% hotel
14. The Platinum Card (Amex) - 年費$895，5% airline/hotel，附多種福利

重要規則：
- 不得承諾核卡結果或保證回饋
- 所有資訊僅供參考，申請前請以官方公告為準
- 不得協助用戶偽造申請資料
- 附屬連結僅為參考，不影響推薦的客觀性`;

export async function POST(req: NextRequest) {
  const { messages, cardName } = await req.json();

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const systemPrompt = `${CARD_CONTEXT}

目前用戶正在查看的卡片：${cardName || "未指定"}

請根據用戶問題，結合卡片資料回答。`;

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
    const reply = data.choices?.[0]?.message?.content || "抱歉，AI 目前無法回覆。";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
