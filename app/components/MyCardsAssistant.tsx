"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { fetchRecommend } from "@/lib/recommend-fetch";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const COPY = {
  en: {
    title: "Ask about your cards",
    hint: "I can see the cards you've added. Try \"which of my cards waives bag fees?\" or \"who has dining credit this quarter?\"",
    placeholder: "Ask about your cards…",
    send: "Send",
    thinking: "Thinking…",
    empty: "Add at least one card above to ask portfolio-aware questions.",
    error: "Something went wrong. Please try again.",
    samples: [
      "Which of my cards waives checked-bag fees?",
      "Which dining credits do I have this month?",
      "Best card in my wallet for groceries?",
    ],
  },
  zh: {
    title: "問問你手上的卡",
    hint: "我看得到你加進來的卡。試試「我手上哪張卡免托運行李費?」或「這季有什麼餐飲 credit?」",
    placeholder: "問問你手上的卡…",
    send: "送出",
    thinking: "思考中…",
    empty: "請先在上方加入至少一張卡,才能問跟你卡組相關的問題。",
    error: "出了點問題,再試一次。",
    samples: [
      "我手上哪張卡可以免托運行李費?",
      "這個月我有哪些餐飲 credit 可以用?",
      "我皮夾裡哪張卡買菜最划算?",
    ],
  },
  "zh-cn": {
    title: "问问你手上的卡",
    hint: "我看得到你加进来的卡。试试「我手上哪张卡免托运行李费?」或「这季有什么餐饮 credit?」",
    placeholder: "问问你手上的卡…",
    send: "发送",
    thinking: "思考中…",
    empty: "请先在上方加入至少一张卡,才能问跟你卡组相关的问题。",
    error: "出了点问题,再试一次。",
    samples: [
      "我手上哪张卡可以免托运行李费?",
      "这个月我有哪些餐饮 credit 可以用?",
      "我钱包里哪张卡买菜最划算?",
    ],
  },
  es: {
    title: "Pregunta sobre tus tarjetas",
    hint: "Puedo ver las tarjetas que has añadido. Prueba \"¿qué tarjeta mía cubre el equipaje facturado?\"",
    placeholder: "Pregunta sobre tus tarjetas…",
    send: "Enviar",
    thinking: "Pensando…",
    empty: "Añade al menos una tarjeta arriba para preguntar sobre tu portafolio.",
    error: "Algo salió mal. Inténtalo de nuevo.",
    samples: [
      "¿Qué tarjeta mía cubre el equipaje facturado?",
      "¿Qué créditos de comida tengo este mes?",
      "¿Mejor tarjeta de mi cartera para supermercados?",
    ],
  },
};

interface Props {
  /** Card ids the user owns. Source of truth lives on the parent page so
   * we never race with localStorage like RecommendWidget does. */
  selectedCards: string[];
  lang: string;
}

export default function MyCardsAssistant({ selectedCards, lang }: Props) {
  const t = COPY[lang as keyof typeof COPY] || COPY.en;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setIsLoading(true);
    // Skip prior messages — the my-cards assistant is single-turn-ish;
    // each question is answered against the current portfolio. Auto-retries
    // once on cold-start failure via fetchRecommend.
    fetchRecommend({
      message: text,
      messages: [],
      locale: lang,
      existingCards: selectedCards,
    })
      .then((data) => {
        setIsLoading(false);
        setMessages([...next, { role: "assistant", content: data.reply || t.error }]);
      })
      .catch(() => {
        setIsLoading(false);
        setMessages([...next, { role: "assistant", content: t.error }]);
      });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
        <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> {t.title}
        </h3>
        <p className="text-blue-100 text-[11px] mt-0.5 leading-snug">{t.hint}</p>
      </div>

      <div ref={scrollRef} className="px-4 py-3 max-h-80 overflow-y-auto space-y-3 bg-slate-50">
        {messages.length === 0 && (
          <div className="space-y-2">
            {selectedCards.length === 0 && (
              <p className="text-xs text-slate-500">{t.empty}</p>
            )}
            {selectedCards.length > 0 && t.samples.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="block w-full text-left text-xs bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 rounded-lg px-3 py-2 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm"
              }`}
            >
              {m.content.split("\n").map((line, j) => (
                <p key={j} className="mt-1 first:mt-0 whitespace-pre-wrap">{line}</p>
              ))}
            </div>
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
                {t.thinking}
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={t.placeholder}
            disabled={isLoading || selectedCards.length === 0}
            className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => send(input)}
            disabled={isLoading || !input.trim() || selectedCards.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {t.send}
          </button>
        </div>
      </div>
    </div>
  );
}
