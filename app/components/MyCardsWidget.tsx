"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { CARD_OPTIONS } from "@/lib/constants";

const STORAGE_KEY = "opencard_existing_cards";

const MESSAGES = {
  en: {
    title: "👛 My Wallet",
    trigger: "My Cards",
    hint: "Select cards you already own. AI will avoid recommending these and look for complementary benefits.",
    searchPlaceholder: "Search cards...",
    clearAll: "Clear all",
    selected: "selected",
    noResults: "No cards found",
  },
  zh: {
    title: "👛 我的皮夾",
    trigger: "我的卡片",
    hint: "勾選你已有的卡片。AI 會避免推薦重複項目，並為你尋找互補的福利。",
    searchPlaceholder: "搜尋卡片...",
    clearAll: "清除全部",
    selected: "已選擇",
    noResults: "找不到卡片",
  },
  es: {
    title: "👛 Mi Cartera",
    trigger: "Mis Tarjetas",
    hint: "Selecciona las tarjetas que ya tienes. La IA evitará recomendar estas y buscará beneficios complementarios.",
    searchPlaceholder: "Buscar tarjetas...",
    clearAll: "Borrar todo",
    selected: "seleccionadas",
    noResults: "No se encontraron tarjetas",
  },
};

export default function MyCardsWidget({ lang = "en" }: { lang?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const m = MESSAGES[lang as keyof typeof MESSAGES] || MESSAGES.en;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSelectedCards(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load cards", e);
      }
    }
  }, []);

  const toggleCard = (cardId: string) => {
    setSelectedCards((prev) => {
      const next = prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: next }));
      return next;
    });
  };

  const clearAll = () => {
    setSelectedCards([]);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: [] }));
  };

  const filteredCards = CARD_OPTIONS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.issuer.toLowerCase().includes(search.toLowerCase())
  );

  const issuers = [...new Set(filteredCards.map((c) => c.issuer))].sort();

  return (
    <div className="flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col mb-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm">{m.title}</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">{m.hint}</p>

            <input
              type="text"
              placeholder={m.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 mb-3"
            />

            <div className="flex-1 overflow-y-auto max-h-96 pr-1 space-y-4">
              {issuers.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">{m.noResults}</div>
              )}
              {issuers.map((issuer) => (
                <div key={issuer}>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {issuer}
                  </h4>
                  <div className="space-y-1">
                    {filteredCards
                      .filter((c) => c.issuer === issuer)
                      .map((card) => (
                        <label
                          key={card.card_id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedCards.includes(card.card_id)
                              ? "bg-slate-900 text-white"
                              : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <input
                              type="checkbox"
                              checked={selectedCards.includes(card.card_id)}
                              onChange={() => toggleCard(card.card_id)}
                              className="hidden"
                            />
                            <div className="text-xs font-medium truncate">{card.name}</div>
                          </div>
                          {card.annual_fee > 0 && !selectedCards.includes(card.card_id) && (
                            <div className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
                              ${card.annual_fee}
                            </div>
                          )}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedCards.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  {selectedCards.length} {m.selected}
                </div>
                <button
                  onClick={clearAll}
                  className="text-xs text-red-500 font-medium hover:text-red-600 transition-colors"
                >
                  {m.clearAll}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${
          isOpen ? "bg-slate-800 text-white shadow-xl" : "bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300"
        }`}
      >
        <img src="/brand/my-cards-icon.png" alt="Wallet" className="w-6 h-6 object-contain" />
        <span className="font-bold text-sm">{m.trigger}</span>
        {selectedCards.length > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {selectedCards.length}
          </span>
        )}
      </button>
    </div>
  );
}
