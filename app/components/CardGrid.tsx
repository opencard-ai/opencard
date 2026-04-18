"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useMemo } from "react";
import CompareBar from "./CompareBar";
import Link from "next/link";
import type { CreditCard } from "@/lib/cards";

interface CardGridProps {
  cards: CreditCard[];
  issuers: string[];
  tags: string[];
  locale: any;
}

// Tag groups — simplified to only the most useful filter categories
const TAG_GROUPS: Record<string, { label: string; tags: string[] }> = {
  "travel": {
    label: "✈️ Travel",
    tags: ["travel", "flights", "hotel_hilton", "hotel_marriott", "hilton hotels and resorts", "marriott hotels", "ihg", "chase travel", "hotels, car rentals & attractions (cititravel.com)"],
  },
  "airline": {
    label: "✈️ Airline Miles",
    tags: ["united flights", "united purchases (airline tickets, seat upgrades, economy plus, inflight food/beverages/wi-fi, united fees)", "delta purchases"],
  },
  "hotel": {
    label: "🏨 Hotel",
    tags: ["hotel_hilton", "hotel_marriott", "hilton hotels and resorts", "marriott hotels", "ihg"],
  },
  "cashback": {
    label: "💰 Cash Back",
    tags: ["all purchases", "all purchases (flat)", "all purchases (buy)", "groceries", "grocery stores", "u.s. supermarkets", "rotating", "rotating 5% categories", "restaurants"],
  },
  "business": {
    label: "💼 Business",
    tags: ["top 2 eligible business categories", "office supply stores"],
  },
  "dining": {
    label: "🍽️ Dining",
    tags: ["restaurants"],
  },
  "groceries": {
    label: "🛒 Groceries",
    tags: ["groceries", "grocery stores", "u.s. supermarkets"],
  },
  "gas": {
    label: "⛽ Gas & Costco",
    tags: ["gas (costco)"],
  },
  "streaming": {
    label: "📺 Streaming",
    tags: ["disneyplus.com, hulu.com, espn+ purchases"],
  },
};

// Build display list — ONLY show predefined tag groups; skip ALL individual tags
function buildDisplayTags(allTags: string[]) {
  const usedGroupTags = new Set<string>();
  const groups: { value: string; label: string }[] = [];

  for (const [groupKey, group] of Object.entries(TAG_GROUPS)) {
    const matchingTags = group.tags.filter((t) => allTags.includes(t));
    if (matchingTags.length > 0) {
      groups.push({ value: groupKey, label: group.label });
      matchingTags.forEach((t) => usedGroupTags.add(t));
    }
  }

  return groups;
}

// Check if a card matches a tag filter value
function cardMatchesTag(card: CreditCard, tagValue: string, allTags: string[]): boolean {
  if (!tagValue) return true;
  if (tagValue === "__no-af__") return card.annual_fee === 0;

  // Check if it's a group key
  const group = TAG_GROUPS[tagValue];
  if (group) {
    return group.tags.some((t) => card.tags.includes(t));
  }

  // Only predefined tag groups are valid filter values; no individual tag fallback
  return false;
}

const LABELS: Record<string, Record<string, string>> = {
  searchPlaceholder: { en: "Search cards...", zh: "搜尋卡片名稱...", es: "Buscar tarjetas..." },
  allIssuers: { en: "All Issuers", zh: "所有發卡機構", es: "Todos los Emisores" },
  allTags: { en: "All Types", zh: "所有類型", es: "Todos los Tipos" },
  clear: { en: "Clear", zh: "清除", es: "Limpiar" },
  annualFee: { en: "Annual Fee", zh: "年費", es: "Cuota Anual" },
  noFee: { en: "No Annual Fee", zh: "免年費", es: "Sin Cuota Anual" },
  allAf: { en: "All Fees", zh: "所有年費", es: "Todas las Cuotas" },
  afUnder95: { en: "Under $95", zh: "低於 $95", es: "Menos de $95" },
  afOver95: { en: "$95+", zh: "$95 以上", es: "$95+" },
  noResults: { en: "No cards match your criteria", zh: "找不到符合條件的卡片", es: "No hay tarjetas que coincidan" },
  tryAdjust: { en: "Try adjusting your filters", zh: "試著調整篩選條件", es: "Intenta ajustar tus filtros" },
  showing: { en: "Showing", zh: "顯示", es: "Mostrando" },
  of: { en: "of", zh: "/", es: "de" },
  cards: { en: "cards", zh: "張卡片", es: "tarjetas" },
  sortBy: { en: "Sort", zh: "排序", es: "Ordenar" },
  sortName: { en: "Name", zh: "名稱", es: "Nombre" },
  sortFeeAsc: { en: "Fee: Low → High", zh: "年費由低到高", es: "Cuota ↓" },
  sortFeeDesc: { en: "Fee: High → Low", zh: "年費由高到低", es: "Cuota ↑" },
};

function l(key: string, locale: string): string {
  return LABELS[key]?.[locale] || LABELS[key]?.en || key;
}

export default function CardGrid({ cards, issuers, tags, locale }: CardGridProps) {
  // Handle #cards-section hash scroll when arriving from another page
  useEffect(() => {
    if (window.location.hash === "#cards-section") {
      const el = document.getElementById("cards-section");
      if (el) {
        const headerHeight = 73;
        const elTop = el.getBoundingClientRect().top + window.scrollY;
        // Scroll so the element is just below the sticky header
        window.scrollTo({ top: elTop - headerHeight, behavior: "instant" });
      }
    }
  }, []);

  return (
    <div id="cards-section" style={{ scrollMarginTop: "73px" }}>
      <FilterBar issuers={issuers} tags={tags} locale={locale} />
      <CardList cards={cards} tags={tags} locale={locale} />
    </div>
  );
}

function FilterBar({ issuers, tags, locale }: { issuers: string[]; tags: string[]; locale: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const displayTags = useMemo(() => buildDisplayTags(tags), [tags]);

  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const selectedAf = searchParams.get("af") || "";
  const search = searchParams.get("search") || "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}#cards-section`, { scroll: false });
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder={l("searchPlaceholder", locale)}
          defaultValue={search}
          onChange={(e) => updateParam("search", e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={selectedIssuer}
          onChange={(e) => updateParam("issuer", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block"
        >
          <option value="">{l("allIssuers", locale)}</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>{issuer}</option>
          ))}
        </select>
        <select
          value={selectedTag}
          onChange={(e) => updateParam("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block min-w-[140px]"
        >
          <option value="">{l("allTags", locale)}</option>
          {displayTags.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={selectedAf}
          onChange={(e) => updateParam("af", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block min-w-[110px]"
        >
          <option value="">{l("allAf", locale)}</option>
          <option value="no">{l("noFee", locale)}</option>
          <option value="lt95">{l("afUnder95", locale)}</option>
          <option value="ge95">{l("afOver95", locale)}</option>
        </select>
        <select
          value={searchParams.get("sort") || ""}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden md:block min-w-[140px]"
        >
          <option value="">{l("sortBy", locale)}</option>
          <option value="name">{l("sortName", locale)}</option>
          <option value="fee-asc">{l("sortFeeAsc", locale)}</option>
          <option value="fee-desc">{l("sortFeeDesc", locale)}</option>
        </select>
        {(selectedIssuer || selectedTag || selectedAf || search || searchParams.get("sort")) && (
          <button
            onClick={() => router.push(`${pathname}#cards-section`, { scroll: false })}
            className="px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            {l("clear", locale)}
          </button>
        )}
      </div>

      {/* Mobile filters */}
      <div className="flex flex-wrap gap-2 sm:hidden mb-3">
        <select
          value={selectedIssuer}
          onChange={(e) => updateParam("issuer", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white flex-1 min-w-[120px]"
        >
          <option value="">{l("allIssuers", locale)}</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>{issuer}</option>
          ))}
        </select>
        <select
          value={selectedTag}
          onChange={(e) => updateParam("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white flex-1 min-w-[120px]"
        >
          <option value="">{l("allTags", locale)}</option>
          {displayTags.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CardList({ cards, tags, locale }: { cards: CreditCard[]; tags: string[]; locale: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const selectedAf = searchParams.get("af") || "";
  const search = searchParams.get("search") || "";

  const lang = pathname.split("/")[1] || "en";
  const selectedSort = searchParams.get("sort") || "name";

  const toggleCompare = useCallback((cardId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  }, []);

  const selectedCards = cards.filter((c) => compareIds.includes(c.card_id));

  const filtered = useMemo(() => {
    return cards.filter((card) => {
      if (selectedIssuer && card.issuer !== selectedIssuer) return false;
      if (!cardMatchesTag(card, selectedTag, tags)) return false;
      if (selectedAf === "no" && card.annual_fee !== 0) return false;
      if (selectedAf === "lt95" && card.annual_fee >= 95) return false;
      if (selectedAf === "ge95" && card.annual_fee < 95) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !card.name.toLowerCase().includes(q) &&
          !card.issuer.toLowerCase().includes(q) &&
          !card.tags.some((t) => t.toLowerCase().includes(q))
        )
          return false;
      }
      return true;
    }).sort((a, b) => {
      if (selectedSort === "fee-asc") return a.annual_fee - b.annual_fee;
      if (selectedSort === "fee-desc") return b.annual_fee - a.annual_fee;
      return a.name.localeCompare(b.name);
    });
  }, [cards, selectedIssuer, selectedTag, search, tags]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-lg mb-2">{l("noResults", locale)}</p>
        <p className="text-sm">{l("tryAdjust", locale)}</p>
      </div>
    );
  }

  return (
    <>
      {/* Card action legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-500">⚖</span>
          <span>{locale === "zh" ? "加入比價（最多3張）" : locale === "es" ? "Comparar (máx 3)" : "Compare (up to 3 cards)"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full border border-slate-300 bg-white flex items-center justify-center">💾</span>
          <span>{locale === "zh" ? "儲存到我的卡片" : locale === "es" ? "Guardar en Mis Tarjetas" : "Save to My Cards"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
        {filtered.map((card) => {
          const isCompared = compareIds.includes(card.card_id);
          const isMaxed = compareIds.length >= 3 && !isCompared;
          return (
            <div key={card.card_id} className={`relative bg-white rounded-xl border transition-all duration-200 hover:shadow-md hover:border-slate-300 ${isCompared ? "ring-2 ring-blue-500 border-blue-500" : "border-slate-200"}`}>
              <Link
                href={`/${lang}/cards/${card.card_id}`}
                className="block p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 pr-2">
                    <h2 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                      {card.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">{card.issuer}</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 shrink-0">
                    {card.network}
                  </span>
                </div>

                <div className="flex items-center gap-1 mb-3">
                  <span className="text-xs text-slate-500">{l("annualFee", locale)}</span>
                  <span className={`text-sm font-medium ${card.annual_fee === 0 ? "text-green-600" : "text-slate-800"}`}>
                    {card.annual_fee === 0 ? l("noFee", locale) : `$${card.annual_fee.toLocaleString()}`}
                  </span>
                </div>

                <div className="mb-3 space-y-0.5">
                  {card.earning_rates.slice(0, 2).map((rate, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-slate-600">
                      <span className="text-blue-600 font-medium">{rate.rate}×</span>
                      <span>{rate.category}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1">
                  {card.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>

              {/* Action buttons: Compare + Save */}
              <div className="absolute bottom-3 right-3 flex gap-1.5">
                {/* Compare button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleCompare(card.card_id);
                  }}
                  disabled={isMaxed}
                  title={isCompared ? "移除比較" : isMaxed ? "已選滿 3 張" : "加入比較"}
                  className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${
                    isCompared
                      ? "bg-blue-600 border-blue-600 text-white"
                      : isMaxed
                      ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed"
                      : "bg-white border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600"
                  }`}
                >
                  {isCompared ? "✓" : "⚖"}
                </button>

                {/* Save to My Cards button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const key = "opencard_existing_cards";
                    const stored = localStorage.getItem(key);
                    const existing: string[] = stored ? JSON.parse(stored) : [];
                    const alreadySaved = existing.includes(card.card_id);
                    if (alreadySaved) {
                      // Remove from saved
                      const updated = existing.filter((id) => id !== card.card_id);
                      localStorage.setItem(key, JSON.stringify(updated));
                    } else {
                      // Add card_id only (My Cards page fetches fresh data from DB)
                      existing.push(card.card_id);
                      localStorage.setItem(key, JSON.stringify(existing));
                    }
                    // Notify My Cards page to refresh
                    window.dispatchEvent(new CustomEvent("opencard_cards_updated"));
                  }}
                  title="儲存到我的卡片"
                  className="w-7 h-7 rounded-full border bg-white border-slate-300 text-slate-500 hover:border-green-400 hover:text-green-600 transition-all flex items-center justify-center text-sm"
                >
                  💾
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center text-sm text-slate-500">
        {l("showing", locale)} {filtered.length} {l("of", locale)} {cards.length} {l("cards", locale)}
      </div>

      {/* Compare floating bar */}
      <CompareBar
        selected={selectedCards}
        onRemove={toggleCompare}
        onClear={() => setCompareIds([])}
        lang={lang}
      />
    </>
  );
}
