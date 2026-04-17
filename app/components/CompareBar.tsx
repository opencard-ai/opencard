"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CreditCard } from "@/lib/cards";

interface CompareBarProps {
  selected: CreditCard[];
  onRemove: (cardId: string) => void;
  onClear: () => void;
  lang: string;
}

export default function CompareBar({ selected, onRemove, onClear, lang }: CompareBarProps) {
  const [visible, setVisible] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    const isVisible = selected.length > 0;
    setVisible(isVisible);
    window.dispatchEvent(new CustomEvent(isVisible ? "comparebar:show" : "comparebar:hide"));
  }, [selected]);

  if (!visible || selected.length === 0) return null;

  const labels = {
    en: { title: "Compare Cards", compare: "Compare Now", remove: "Remove", clear: "Clear", max: "Compare up to 3 cards" },
    zh: { title: "比較卡片", compare: "立即比較", remove: "移除", clear: "清除", max: "最多比較 3 張卡" },
    es: { title: "Comparar Tarjetas", compare: "Comparar Ahora", remove: "Eliminar", clear: "Limpiar", max: "Hasta 3 tarjetas" },
  };
  const l = labels[lang as keyof typeof labels] || labels.en;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-2xl">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Selected cards pills */}
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            <span className="text-sm font-semibold text-slate-600 shrink-0">{l.title}:</span>
            {selected.map((card) => (
              <div
                key={card.card_id}
                className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-sm shrink-0 group"
              >
                <span className="truncate max-w-[120px] font-medium text-slate-700">{card.name}</span>
                <button
                  onClick={() => onRemove(card.card_id)}
                  className="text-slate-400 hover:text-red-500 ml-1 transition-colors"
                  title={l.remove}
                >
                  ✕
                </button>
              </div>
            ))}
            {selected.length < 3 && (
              <span className="text-xs text-slate-400 shrink-0">{l.max}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClear}
              className="text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1.5"
            >
              {l.clear}
            </button>
            {selected.length >= 2 && (
              <a
                href={`/${lang}/compare?cards=${selected.map(c => c.card_id).join(",")}`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-colors"
              >
                {l.compare} →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
