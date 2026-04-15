"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatWidgetProps {
  cardName: string;
  cardId: string;
  locale?: string;
}

const MESSAGES: Record<string, { welcome: string; placeholder: string; send: string; thinking: string; disclaimer: string; label: string }> = {
  en: {
    label: "AI Card Assistant",
    welcome: "Hi! Welcome to the AI assistant for this card. I can help you analyze pros & cons, compare rewards, or answer any questions.",
    placeholder: "Ask about this card...",
    send: "Send",
    thinking: "Thinking...",
    disclaimer: "AI responses are for reference only. Approval decisions are made by the bank.",
  },
  zh: {
    label: "AI 卡片助理",
    welcome: "嗨！歡迎來到這張卡片的 AI 助理。我可以幫你分析這張卡片的優缺點、比較回饋，或回答任何相關問題。",
    placeholder: "問我關於這張卡的事...",
    send: "送出",
    thinking: "思考中...",
    disclaimer: "AI 回覆僅供參考，核卡結果由銀行決定",
  },
  es: {
    label: "Asistente AI",
    welcome: "¡Hola! Bienvenido al asistente AI de esta tarjeta. Puedo ayudarte a analizar pros y contras, comparar recompensas o responder cualquier pregunta.",
    placeholder: "Pregunta sobre esta tarjeta...",
    send: "Enviar",
    thinking: "Pensando...",
    disclaimer: "Las respuestas de IA son solo para referencia. Las decisiones de aprobación las toma el banco.",
  },
};

function getMsg(locale: string) {
  return MESSAGES[locale] || MESSAGES.en;
}

export default function ChatWidget({ cardName, cardId, locale = "en" }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const msg = getMsg(locale);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: msg.welcome,
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "assistant", content: msg.thinking }]);

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, cardName, message: currentInput, locale }),
    })
      .then((res) => res.json())
      .then((data) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.content === msg.thinking ? { role: "assistant", content: data.reply || "Sorry, something went wrong." } : m
          )
        );
      })
      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.content === msg.thinking ? { role: "assistant", content: "Sorry, I couldn't process that. Please try again." } : m
          )
        );
      });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 flex items-center gap-3 transition-colors"
      >
        <span className="text-xl">💬</span>
        <span className="font-semibold">💬 {msg.label}</span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">💬 {msg.label}</span>
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white text-sm">
          ✕
        </button>
      </div>
      <div className="h-64 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={msg.placeholder}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {msg.send}
          </button>
        </div>
      </div>
    </div>
  );
}
