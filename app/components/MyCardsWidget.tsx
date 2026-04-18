"use client";

import { useState, useEffect, useCallback } from "react";
import { trackCreditsViewed } from "@/lib/analytics";

const STORAGE_KEY = "opencard_existing_cards";

const MESSAGES = {
  en: {
    title: "💳 My Cards",
    trigger: "My Cards",
    hint: "Select cards you already own. AI will avoid recommending these.",
    searchPlaceholder: "Search cards...",
    clearAll: "Clear all",
    selected: "selected",
    noResults: "No cards found",
    empty: "No cards match",
  },
  zh: {
    title: "💳 我的卡片",
    trigger: "我的卡片",
    hint: "勾選你已有的卡片。AI 會避免推薦重複項目。",
    searchPlaceholder: "搜尋卡片...",
    clearAll: "清除全部",
    selected: "已選擇",
    noResults: "找不到卡片",
    empty: "沒有符合的卡片",
  },
  es: {
    title: "💳 Mis Tarjetas",
    trigger: "Mis Tarjetas",
    hint: "Selecciona las tarjetas que ya tienes.",
    searchPlaceholder: "Buscar tarjetas...",
    clearAll: "Borrar todo",
    selected: "seleccionadas",
    noResults: "No se encontraron tarjetas",
    empty: "No hay tarjetas",
  },
};

interface CardInfo {
  card_id: string;
  name: string;
  annual_fee: number;
}

interface IssuerGroup {
  issuer: string;
  cards: CardInfo[];
}

export default function MyCardsWidget({ lang = "en" }: { lang?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [expandedIssuers, setExpandedIssuers] = useState<Set<string>>(new Set());
  const [issuers, setIssuers] = useState<IssuerGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const m = MESSAGES[lang as keyof typeof MESSAGES] || MESSAGES.en;

  // Track My Cards opened event (once per session)
  useEffect(() => {
    if (isOpen) {
      const count = selectedCards.length;
      trackCreditsViewed(count);
    }
  }, [isOpen]);

  // Fetch all cards grouped by issuer
  useEffect(() => {
    if (!loaded) {
      fetch("/api/cards")
        .then((r) => r.json())
        .then((data: IssuerGroup[]) => {
          setIssuers(data);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [loaded]);

  // Listen for external open event
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("opencard_open_mycards", handleOpen);
    return () => window.removeEventListener("opencard_open_mycards", handleOpen);
  }, []);

  // Load saved cards
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

  // Listen for external save events (from CardGrid save buttons)
  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setSelectedCards(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to reload cards", e);
        }
      }
    };
    window.addEventListener("opencard_cards_updated", handler);
    return () => window.removeEventListener("opencard_cards_updated", handler);
  }, []);

  const toggleCard = useCallback((cardId: string) => {
    setSelectedCards((prev) => {
      const next = prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: next }));
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedCards([]);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: [] }));
  }, []);

  const toggleIssuer = (issuer: string) => {
    setExpandedIssuers((prev) => {
      const next = new Set(prev);
      if (next.has(issuer)) next.delete(issuer);
      else next.add(issuer);
      return next;
    });
  };

  // Filter issuers and cards by search
  const filteredIssuers = issuers
    .map(({ issuer, cards }) => ({
      issuer,
      cards: search.trim()
        ? cards.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase())
          )
        : cards,
    }))
    .filter(({ cards }) => cards.length > 0);

  const toggleAll = (issuer: string, cards: CardInfo[]) => {
    const allSelected = cards.every((c) => selectedCards.includes(c.card_id));
    if (allSelected) {
      // Deselect all in this issuer
      const ids = new Set(cards.map((c) => c.card_id));
      const next = selectedCards.filter((id) => !ids.has(id));
      setSelectedCards(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: next }));
    } else {
      // Select all in this issuer
      const next = [...new Set([...selectedCards, ...cards.map((c) => c.card_id)])];
      setSelectedCards(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: next }));
    }
  };

  const issuerSelectedCount = (cards: CardInfo[]) =>
    cards.filter((c) => selectedCards.includes(c.card_id)).length;

  return (
    <div className="flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="text-white font-bold text-sm">{m.title}</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-4 flex flex-col overflow-hidden max-h-[70vh]">
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">{m.hint}</p>

            <input
              type="text"
              placeholder={m.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 mb-3 shrink-0"
            />

            <div className="flex-1 overflow-y-auto pr-1 space-y-1">
              {!loaded ? (
                <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
              ) : filteredIssuers.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {search ? m.empty : m.noResults}
                </div>
              ) : (
                filteredIssuers.map(({ issuer, cards }) => {
                  const isExpanded = expandedIssuers.has(issuer);
                  const selCount = issuerSelectedCount(cards);
                  const allSelected = selCount === cards.length;

                  return (
                    <div key={issuer} className="border border-slate-100 rounded-lg overflow-hidden">
                      {/* Issuer header — always visible */}
                      <button
                        onClick={() => toggleIssuer(issuer)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                          allSelected
                            ? "bg-slate-900 text-white"
                            : selCount > 0
                            ? "bg-slate-100 text-slate-800"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]">{isExpanded ? "▼" : "▶"}</span>
                          <span className="font-semibold text-xs">{issuer}</span>
                          {selCount > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${allSelected ? "bg-white/20" : "bg-blue-600 text-white"}`}>
                              {selCount}{selCount === cards.length ? "/" + cards.length : ""}
                            </span>
                          )}
                        </div>
                        {cards.length > 1 && (
                          <span
                            onClick={(e) => { e.stopPropagation(); toggleAll(issuer, cards); }}
                            className="text-[10px] underline opacity-60 hover:opacity-100 transition-opacity"
                          >
                            {allSelected ? "deselect all" : "select all"}
                          </span>
                        )}
                      </button>

                      {/* Cards — collapsible */}
                      {isExpanded && (
                        <div className="divide-y divide-slate-100">
                          {cards.map((card) => {
                            const isSelected = selectedCards.includes(card.card_id);
                            return (
                              <label
                                key={card.card_id}
                                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-slate-900 text-white"
                                    : "hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleCard(card.card_id)}
                                    className="hidden"
                                  />
                                  <span className="text-xs truncate">{card.name}</span>
                                </div>
                                {card.annual_fee > 0 && (
                                  <span className={`text-[10px] ml-2 shrink-0 ${isSelected ? "text-white/60" : "text-slate-400"}`}>
                                    ${card.annual_fee}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {selectedCards.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
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
        className={`h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 w-[160px] justify-center ${
          isOpen
            ? "bg-slate-800 text-white shadow-xl"
            : "bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300"
        }`}
      >
        <span className="text-xl leading-none">💳</span>
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
