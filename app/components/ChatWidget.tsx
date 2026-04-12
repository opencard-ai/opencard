"use client";

import { useState } from "react";

interface ChatWidgetProps {
  cardName: string;
  cardId: string;
}

export default function ChatWidget({ cardName, cardId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `嗨！歡迎來到 ${cardName} 的 AI 助理。我可以幫你分析這張卡片的優缺點、比較回饋，或回答任何相關問題。`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          cardName,
        }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "抱歉，AI 目前無法回覆。",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "網路錯誤，請稍後再試。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>🤖</span>
          <span className="font-semibold text-sm">AI 卡片助理</span>
        </div>
        <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Chat body */}
      {isOpen && (
        <div className="flex flex-col" style={{ height: "360px" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 rounded-xl px-3 py-2 text-sm">
                  思考中...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="問我關於這張卡的事..."
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                送出
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              AI 回覆僅供參考，核卡結果由銀行決定
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}
