"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { CreditCard } from "@/lib/cards";

const STORAGE_KEY = "opencard_existing_cards";

interface Props {
  card: CreditCard;
  lang: string;
  locale: string;
  isCompared: boolean;
  isMaxed: boolean;
  onToggleCompare: () => void;
}

const STR = {
  en: {
    noFee: "No annual fee",
    perYr: "/yr",
    welcome: "Welcome",
    viewDetails: "View details →",
    compare: "Compare",
    inCompare: "In compare",
    save: "Save to my cards",
    saved: "Saved",
    expand: "Expand details",
    collapse: "Collapse",
  },
  zh: {
    noFee: "免年費",
    perYr: "/年",
    welcome: "開卡禮",
    viewDetails: "查看詳情 →",
    compare: "加入比較",
    inCompare: "已加入比較",
    save: "加入我的卡片",
    saved: "已加入",
    expand: "展開細節",
    collapse: "收合",
  },
  es: {
    noFee: "Sin cuota",
    perYr: "/año",
    welcome: "Bono",
    viewDetails: "Ver detalles →",
    compare: "Comparar",
    inCompare: "En comparación",
    save: "Guardar",
    saved: "Guardada",
    expand: "Mostrar detalles",
    collapse: "Ocultar",
  },
};

type Lang = keyof typeof STR;

function formatBonusValue(v: number | string | undefined | null): string | null {
  if (v == null) return null;
  if (typeof v === "number") return `$${v.toLocaleString()}`;
  const parsed = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(parsed) ? `$${parsed.toLocaleString()}` : null;
}

export default function CardRow({ card, lang, locale, isCompared, isMaxed, onToggleCompare }: Props) {
  const t = STR[(locale as Lang) in STR ? (locale as Lang) : "en"];
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved state from localStorage; sync with cross-component event so
  // toggles from the my-cards page or other rows are reflected here.
  useEffect(() => {
    const read = () => {
      try {
        const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        setSaved(Array.isArray(ids) && ids.includes(card.card_id));
      } catch {
        setSaved(false);
      }
    };
    read();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string[] | undefined>).detail;
      if (Array.isArray(detail)) setSaved(detail.includes(card.card_id));
      else read();
    };
    window.addEventListener("opencard_cards_updated", handler);
    return () => window.removeEventListener("opencard_cards_updated", handler);
  }, [card.card_id]);

  const toggleSaved = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let ids: string[];
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      ids = Array.isArray(raw) ? raw : [];
    } catch {
      ids = [];
    }
    const has = ids.includes(card.card_id);
    const next = has ? ids.filter((id) => id !== card.card_id) : [...ids, card.card_id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("opencard_cards_updated", { detail: next }));
    setSaved(!has);
  }, [card.card_id]);

  const onCompareClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleCompare();
  }, [onToggleCompare]);

  const bonusValue = card.welcome_offer
    ? formatBonusValue(card.welcome_offer.estimated_value ?? card.welcome_offer.bonus_value)
    : null;
  const bonusPoints = card.welcome_offer?.bonus_points;

  return (
    <div className={`bg-white rounded-xl border transition-colors ${isCompared ? "ring-2 ring-blue-500 border-blue-500" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{card.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{card.issuer}</p>
        </div>
        <div className="text-right shrink-0 tabular-nums whitespace-nowrap">
          <div className={`text-sm font-medium ${card.annual_fee === 0 ? "text-emerald-600" : "text-slate-800"}`}>
            {card.annual_fee === 0 ? t.noFee : `$${card.annual_fee.toLocaleString()}${t.perYr}`}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleSaved}
          aria-label={saved ? t.saved : t.save}
          title={saved ? t.saved : t.save}
          className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-colors ${
            saved ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
          }`}
        >
          {saved ? "✓" : "💾"}
        </button>
        <span
          aria-hidden
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-100 space-y-3">
          {(bonusValue || bonusPoints) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">🎁 {t.welcome}</p>
              <p className="text-sm font-semibold text-amber-900 mt-0.5">
                {bonusPoints != null && bonusPoints > 0 && (
                  <span>{bonusPoints.toLocaleString()} pts</span>
                )}
                {bonusPoints != null && bonusPoints > 0 && bonusValue && <span className="mx-1 text-amber-700">·</span>}
                {bonusValue && <span>(~{bonusValue})</span>}
              </p>
            </div>
          )}

          {card.earning_rates?.length > 0 && (
            <div className="space-y-1">
              {card.earning_rates.slice(0, 3).map((rate, i) => (
                <div key={i} className="flex items-baseline gap-2 text-xs">
                  <span className="text-blue-600 font-semibold tabular-nums">{rate.rate}×</span>
                  <span className="text-slate-700">{rate.category}</span>
                </div>
              ))}
            </div>
          )}

          {card.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onCompareClick}
              disabled={isMaxed && !isCompared}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                isCompared
                  ? "bg-blue-600 border-blue-600 text-white"
                  : isMaxed
                  ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"
                  : "bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              ⚖ {isCompared ? t.inCompare : t.compare}
            </button>
            <Link
              href={`/${lang}/cards/${card.card_id}`}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              {t.viewDetails}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
