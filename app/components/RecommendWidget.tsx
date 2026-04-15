"use client";

import { useState, useEffect } from "react";
import { CARD_OPTIONS } from "@/lib/constants";

interface Message {
  role: "user" | "assistant";
  content: string;
  options?: string[];
}

const STORAGE_KEY = "opencard_existing_cards";

const MESSAGES = {
  en: {
    title: "✨ AI Card Finder",
    placeholder: "Type your answer here...",
    send: "Send",
    thinking: "Thinking...",
    intro: "Hi! I'm your AI card finder. I'll help you find the best US credit card for your needs.\n\nWhat's your preference?",
    alreadyHave: "⚠️ You already have this card",
  },
  zh: {
    title: "✨ AI 卡片推薦",
    placeholder: "輸入你的答案...",
    send: "送出",
    thinking: "思考中...",
    intro: "嗨！我是你的 AI 卡片推薦師。我會幫你找到最適合的美國信用卡。\n\n你想要什麼類型的回饋？",
    alreadyHave: "⚠️ 你已有這張卡",
  },
  es: {
    title: "✨ Buscador AI de Tarjetas",
    placeholder: "Escribe tu respuesta aquí...",
    send: "Enviar",
    thinking: "Pensando...",
    intro: "¡Hola! Soy tu buscador AI de tarjetas. Te ayudaré a encontrar la mejor tarjeta.\n\n¿Qué tipo de recompensas prefieres?",
    alreadyHave: "⚠️ Ya tienes esta tarjeta",
  },
};

function parseOptions(text: string): string[] {
  const lines = text.split("\n");
  const options: string[] = [];

  for (const raw of lines) {
    let line = raw.replace(/^[-*•]\s+/, '').trim();
    if (!line || line.length > 85) continue;
    if (line.includes("?")) continue;

    const emojiMatch = line.match(/^([\u2600-\u27BF\uFE0F\u{1F300}-\u{1F9FF}]+)\s+(.+)$/u);
    if (emojiMatch && emojiMatch[2].length < 65) {
      options.push(line);
      continue;
    }

    const numMatch = line.match(/^[1-9][.)]\s+(.+)$/);
    if (numMatch && numMatch[1].length < 65) {
      options.push(line.replace(/^[1-9][.)]\s+/, ''));
      continue;
    }

    const letterMatch = line.match(/^[A-Za-z][.)]\s+(.+)$/);
    if (letterMatch && letterMatch[1].length < 65) {
      options.push(line.replace(/^[A-Za-z][.)]\s+/, ''));
    }
  }

  return options.slice(0, 8);
}

function renderContent(text: string) {
  return text.split("\n").map((line, j) => (
    <p key={j} className="mt-1 first:mt-0 whitespace-pre-wrap text-sm">{line}</p>
  ));
}

interface RecommendWidgetProps {
  locale?: string;
  onClose?: () => void;
}

export default function RecommendWidget({ locale = "en", onClose }: RecommendWidgetProps) {
  const msg = MESSAGES[locale as keyof typeof MESSAGES] || MESSAGES.en;
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: msg.intro, options: ["💰 Cash Back", "✈️ Travel Rewards", "🏅 Points/Miles", "💎 Multiple Types"] }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  useEffect(() => {
    // Initial load
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setSelectedCards(JSON.parse(saved)); } catch (e) {}
    }

    // Sync from MyCardsWidget
    const handleSync = (e: any) => {
      setSelectedCards(e.detail);
    };
    window.addEventListener("opencard_cards_updated", handleSync);
    return () => window.removeEventListener("opencard_cards_updated", handleSync);
  }, []);

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg = text.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsLoading(true);

    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg,
        locale,
        existingCards: selectedCards,
      }),
    })
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        let reply = data.reply || "Sorry, I couldn't get a response.";
        if (selectedCards.length > 0) {
          for (const cid of selectedCards) {
            const card = CARD_OPTIONS.find(c => c.card_id === cid);
            if (card && reply.includes(card.name)) {
              reply = reply.replace(card.name, `${card.name} ${msg.alreadyHave}`);
            }
          }
        }
        const options = parseOptions(reply);
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: reply, options: options.length > 0 ? options : undefined },
        ]);
      })
      .catch(() => {
        setIsLoading(false);
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Something went wrong. Please try again." },
        ]);
      });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">{msg.title}</h3>
          <p className="text-blue-200 text-xs mt-0.5">AI recommendations are for reference only.</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="h-[400px] overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
                }`}
              >
                {renderContent(m.content)}
              </div>
            </div>

            {m.role === "assistant" && m.options && m.options.length > 0 && (
              <div className="mt-2 ml-2">
                <div className="flex flex-wrap gap-2">
                  {m.options.slice(0, 6).map((option, j) => (
                    <button
                      key={j}
                      onClick={() => sendMessage(option)}
                      className="text-xs bg-blue-50 border-2 border-blue-400 hover:border-blue-600 hover:bg-blue-100 text-blue-700 rounded-full px-3 py-1.5 transition-colors shadow-sm font-medium"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                {msg.thinking}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={msg.placeholder}
            disabled={isLoading}
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
          >
            {msg.send}
          </button>
        </div>
      </div>
    </div>
  );
}
