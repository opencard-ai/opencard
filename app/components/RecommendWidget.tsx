"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { CARD_OPTIONS } from "@/lib/constants";
import { fetchRecommend } from "@/lib/recommend-fetch";

interface Message {
  role: "user" | "assistant";
  content: string;
  options?: string[];
}

const STORAGE_KEY = "opencard_existing_cards";

const MESSAGES = {
  en: {
    title: "AI Card Finder",
    trigger: "Find Your Card",
    placeholder: "Type your answer here...",
    send: "Send",
    thinking: "Thinking...",
    intro: "Hi! I'm your AI card finder. I'll help you find the best US credit card for your needs.\n\nWhat's your preference?",
    alreadyHave: "⚠️ You already have this card",
    options: ["💰 Cash Back", "✈️ Travel Rewards", "🏅 Points/Miles", "💎 Multiple Types"],
  },
  zh: {
    title: "AI 卡片推薦",
    trigger: "卡片推薦",
    placeholder: "輸入你的答案...",
    send: "送出",
    thinking: "思考中...",
    intro: "嗨！我是你的 AI 卡片推薦師。我會幫你找到最適合的美國信用卡。\n\n你想要什麼類型的回饋？",
    alreadyHave: "⚠️ 你已有這張卡",
    options: ["💰 現金回饋", "✈️ 旅遊獎勵", "🏅 點數/里程", "💎 多種類型"],
  },
  "zh-cn": {
    title: "AI 卡片推荐",
    trigger: "卡片推荐",
    placeholder: "输入你的答案...",
    send: "发送",
    thinking: "思考中...",
    intro: "嗨！我是你的 AI 卡片推荐师。我会帮你找到最适合的美国信用卡。\n\n你想要什么类型的回馈？",
    alreadyHave: "⚠️ 你已有这张卡",
    options: ["💰 现金回馈", "✈️ 旅行奖励", "🏅 积分/里程", "💎 多种类型"],
  },
  es: {
    title: "Buscador AI de Tarjetas",
    trigger: "Buscador AI",
    placeholder: "Escribe tu respuesta aquí...",
    send: "Enviar",
    thinking: "Pensando...",
    intro: "¡Hola! Soy tu buscador AI de tarjetas. Te ayudaré a encontrar la mejor tarjeta.\n\n¿Qué tipo de recompensas prefieres?",
    alreadyHave: "⚠️ Ya tienes esta tarjeta",
    options: ["💰 Efectivo", "✈️ Viajes", "🏅 Puntos/Millas", "💎 Múltiples Tipos"],
  },
};

function parseOptions(text: string): string[] {
  const lines = text.split("\n");
  const options: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/^[-*•]\s+/, '').trim();
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
  }

  return options.slice(0, 8);
}

function renderContent(text: string) {
  return text.split("\n").map((line, j) => (
    <p key={j} className="mt-1 first:mt-0 whitespace-pre-wrap text-sm">{line}</p>
  ));
}

export default function RecommendWidget({ lang = "en", expanded = true }: { lang?: string; expanded?: boolean }) {
  const msg = MESSAGES[lang as keyof typeof MESSAGES] || MESSAGES.en;
  const hasOpened = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: msg.intro, options: msg.options }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  // Gates the auto-open `?ask=` send until localStorage has been read.
  // Without this, opening from the home hero CTA fires the API call with
  // existingCards=[] (initial state) before the localStorage-loading
  // effect runs, so the LLM has no idea what cards the user owns.
  const [storageLoaded, setStorageLoaded] = useState(false);

  // Load saved cards from localStorage (and listen for cross-component
  // updates from MyCardsWidget / AddToMyCardsButton). Runs first so the
  // ?ask= auto-send below has the right portfolio.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedCards(JSON.parse(saved));
    } catch {}
    setStorageLoaded(true);

    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) setSelectedCards(detail);
    };
    window.addEventListener("opencard_cards_updated", handleSync);
    return () => window.removeEventListener("opencard_cards_updated", handleSync);
  }, []);

  // Auto-open and send when ?ask= query param is present. Gated on
  // storageLoaded so existingCards reflects the user's actual portfolio.
  useEffect(() => {
    if (!storageLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const askParam = params.get("ask");
    if (askParam && !hasOpened.current) {
      hasOpened.current = true;
      setIsOpen(true);
      // Set user message immediately, then call API
      setMessages([{ role: "user", content: askParam }]);
      setIsLoading(true);
      window.history.replaceState(null, "", window.location.pathname);
      // Call API to get AI response (auto-retries once on cold-start failure)
      fetchRecommend({
        message: askParam,
        messages: [],
        locale: lang,
        existingCards: selectedCards,
      })
        .then(data => {
          setIsLoading(false);
          const reply = data.reply || "Sorry, I couldn't get a response.";
          const options = parseOptions(reply);
          setMessages([{ role: "user", content: askParam }, { role: "assistant", content: reply, options: options.length > 0 ? options : undefined }]);
        })
        .catch(() => {
          setIsLoading(false);
          setMessages([{ role: "user", content: askParam }, { role: "assistant", content: "Something went wrong. Please try again." }]);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageLoaded]);

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg = text.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsLoading(true);

    fetchRecommend({
      message: userMsg,
      messages: messages, // send full history so LLM has context
      locale: lang,
      existingCards: selectedCards,
    })
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
    <div className="flex flex-col items-end gap-3">
      {isOpen && (
        <>
          {/* Mobile: dim the rest of the page so the chat reads as a modal. */}
          <div
            className="fixed inset-0 bg-black/30 z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div
            className="
              fixed inset-x-3 top-4 bottom-4 z-50
              sm:static sm:inset-auto sm:w-[400px] sm:max-h-none
              bg-white rounded-2xl shadow-2xl border border-slate-200
              overflow-hidden flex flex-col mb-2
              animate-in fade-in slide-in-from-bottom-4 duration-200
            "
          >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-white font-bold text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> {msg.title}</h3>
              <p className="text-blue-100 text-[10px]">AI-powered credit card assistant</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex-1 sm:h-[450px] sm:flex-none overflow-y-auto p-4 space-y-4 bg-slate-50"
            style={{ overscrollBehavior: "contain" }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm"
                    }`}
                  >
                    {renderContent(m.content)}
                  </div>
                </div>

                {m.role === "assistant" && m.options && m.options.length > 0 && (
                  <div className="mt-2 ml-1 flex flex-wrap gap-1.5">
                    {m.options.map((option, j) => (
                      <button
                        key={j}
                        onClick={() => sendMessage(option)}
                        className="text-[10px] bg-blue-50 border border-blue-200 hover:border-blue-400 hover:bg-blue-100 text-blue-700 rounded-full px-2.5 py-1 transition-colors font-medium"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    {msg.thinking}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-100 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(input); } }}
                placeholder={msg.placeholder}
                disabled={isLoading}
                className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {msg.send}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={msg.trigger}
        title={msg.trigger}
        className={`h-12 rounded-full shadow-lg flex items-center gap-2 transition-[width,padding] duration-200 hover:scale-105 active:scale-95 justify-center overflow-hidden ${
          isOpen || expanded ? "w-[160px] px-5" : "w-12 px-0"
        } ${
          isOpen
            ? "bg-blue-700 text-white shadow-2xl"
            : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl"
        }`}
        style={{ boxShadow: isOpen ? "0 8px 32px rgba(59, 130, 246, 0.5)" : "0 4px 12px rgba(0,0,0,0.1)" }}
      >
        <Sparkles className="w-5 h-5 shrink-0" />
        {(isOpen || expanded) && <span className="font-bold text-sm whitespace-nowrap">{msg.trigger}</span>}
      </button>
    </div>
  );
}
