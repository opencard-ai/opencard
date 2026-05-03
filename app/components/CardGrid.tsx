"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Bookmark, Scale } from "lucide-react";
import CompareBar from "./CompareBar";
import CardRow from "./CardRow";
import type { CreditCard } from "@/lib/cards";

interface CardGridProps {
  cards: CreditCard[];
  issuers: string[];
  tags: string[];
  locale: any;
}

// Tag groups — consolidated to 7 non-overlapping categories
const TAG_GROUPS: Record<string, { label: string; tags: string[] }> = {
  "travel": {
    label: "✈️ Travel Rewards",
    tags: ["travel", "transferable"],
  },
  "airline": {
    label: "✈️ Airline Miles",
    tags: ["airline"],
  },
  "hotel": {
    label: "🏨 Hotel",
    tags: ["hotel"],
  },
  "cashback": {
    label: "💰 Cash Back",
    tags: ["cash-back"],
  },
  "business": {
    label: "💼 Business",
    tags: ["business"],
  },
  "student-secured": {
    label: "🎓 Student & Secured",
    tags: ["student", "secured"],
  },
  "no-annual-fee": {
    label: "💳 No Annual Fee",
    tags: ["no-annual-fee"],
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

// Tier classification for the default browse view. Order matters: a card hits
// the first matching tier (e.g. a $0-AF business card lands in "business",
// not "no-fee", because business identity is more meaningful for that user).
// $90-100 carved out from "premium" because that band (CSP, Venture, etc.) is
// a distinct value-tier audience from $200+ premium ultra-cards.
type Tier =
  | "secured-student"
  | "business"
  | "premium"
  | "mid-premium"
  | "low-fee"
  | "no-fee";

function getTier(card: CreditCard): Tier {
  const tags = card.tags || [];
  if (tags.includes("secured") || tags.includes("student")) return "secured-student";
  if (tags.includes("business")) return "business";
  if (card.annual_fee > 100) return "premium";
  if (card.annual_fee >= 90) return "mid-premium";
  if (card.annual_fee > 0) return "low-fee";
  return "no-fee";
}

const TIER_ORDER: Tier[] = [
  "premium",
  "mid-premium",
  "low-fee",
  "no-fee",
  "business",
  "secured-student",
];

// Popularity score for the default browse view. featured flag pins to top,
// otherwise welcome_offer estimated_value drives the order. Cards with no
// bonus tie at 0 and fall back to alphabetical via the secondary comparator.
function popularityScore(card: CreditCard): number {
  if (card.featured === true) return Number.MAX_SAFE_INTEGER;
  const wo = card.welcome_offer;
  if (!wo) return 0;
  const ev = Number(wo.estimated_value);
  if (Number.isFinite(ev) && ev > 0) return ev;
  // Fall back to bonus_value if it's parseable as a number ($-prefixed string etc.)
  if (wo.bonus_value != null) {
    const parsed = parseFloat(String(wo.bonus_value).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

const TIER_LABELS: Record<Tier, Record<string, string>> = {
  "premium": {
    en: "💎 Premium ($101+)",
    zh: "💎 高階($101+)",
    "zh-cn": "💎 高端($101+)",
    es: "💎 Premium ($101+)",
  },
  "mid-premium": {
    en: "🌟 Mid-Premium ($90-100)",
    zh: "🌟 中階($90-100)",
    "zh-cn": "🌟 中端($90-100)",
    es: "🌟 Intermedia ($90-100)",
  },
  "low-fee": {
    en: "🎯 Low-fee ($1-$89)",
    zh: "🎯 入門($1-$89)",
    "zh-cn": "🎯 入门($1-$89)",
    es: "🎯 Cuota baja ($1-$89)",
  },
  "no-fee": {
    en: "✓ No Annual Fee",
    zh: "✓ 免年費",
    "zh-cn": "✓ 免年费",
    es: "✓ Sin cuota anual",
  },
  "business": {
    en: "🏢 Business",
    zh: "🏢 商務",
    "zh-cn": "🏢 商务",
    es: "🏢 Negocios",
  },
  "secured-student": {
    en: "🎓 Student & Secured",
    zh: "🎓 學生 & 擔保卡",
    "zh-cn": "🎓 学生 & 担保卡",
    es: "🎓 Estudiantes & Aseguradas",
  },
};

const DEFAULT_PER_TIER = 6;

const LABELS: Record<string, Record<string, string>> = {
  searchPlaceholder: { en: "Search cards...", zh: "搜尋卡片名稱...", "zh-cn": "搜索卡片名称...", es: "Buscar tarjetas..." },
  allIssuers: { en: "All Issuers", zh: "所有發卡機構", "zh-cn": "所有发卡机构", es: "Todos los Emisores" },
  allTags: { en: "All Types", zh: "所有類型", "zh-cn": "所有类型", es: "Todos los Tipos" },
  clear: { en: "Clear", zh: "清除", "zh-cn": "清除", es: "Limpiar" },
  annualFee: { en: "Annual Fee", zh: "年費", "zh-cn": "年费", es: "Cuota Anual" },
  noFee: { en: "No Annual Fee", zh: "免年費", "zh-cn": "免年费", es: "Sin Cuota Anual" },
  allAf: { en: "All Fees", zh: "所有年費", "zh-cn": "所有年费", es: "Todas las Cuotas" },
  afUnder95: { en: "Under $95", zh: "低於 $95", "zh-cn": "低于 $95", es: "Menos de $95" },
  afOver95: { en: "$95+", zh: "$95 以上", "zh-cn": "$95 以上", es: "$95+" },
  noResults: { en: "No cards match your criteria", zh: "找不到符合條件的卡片", "zh-cn": "找不到符合条件的卡片", es: "No hay tarjetas que coincidan" },
  tryAdjust: { en: "Try adjusting your filters", zh: "試著調整篩選條件", "zh-cn": "试着调整筛选条件", es: "Intenta ajustar tus filtros" },
  showing: { en: "Showing", zh: "顯示", "zh-cn": "显示", es: "Mostrando" },
  of: { en: "of", zh: "/", "zh-cn": "/", es: "de" },
  cards: { en: "cards", zh: "張卡片", "zh-cn": "张卡片", es: "tarjetas" },
  showAllInTier: { en: "Show all", zh: "展開全部", "zh-cn": "展开全部", es: "Ver todas" },
  showLessInTier: { en: "Show less", zh: "收合", "zh-cn": "收起", es: "Ver menos" },
  cardsCount: { en: "cards", zh: "張", "zh-cn": "张", es: "tarjetas" },
  sortBy: { en: "Sort", zh: "排序", "zh-cn": "排序", es: "Ordenar" },
  sortName: { en: "Sort: A → Z", zh: "排序:卡名 A→Z", "zh-cn": "排序：卡名 A→Z", es: "Orden: A → Z" },
  sortFeeAsc: { en: "Sort: Fee Low → High", zh: "排序:年費 低→高", "zh-cn": "排序：年费 低→高", es: "Orden: Cuota ↓" },
  sortFeeDesc: { en: "Sort: Fee High → Low", zh: "排序:年費 高→低", "zh-cn": "排序：年费 高→低", es: "Orden: Cuota ↑" },
  sortBonus: { en: "Sort: Welcome bonus highest", zh: "排序:開卡禮最高", "zh-cn": "排序：开卡奖励最高", es: "Orden: Bono ↑" },
};

function l(key: string, locale: string): string {
  return LABELS[key]?.[locale] || LABELS[key]?.en || key;
}

export default function CardGrid({ cards, issuers, tags, locale }: CardGridProps) {
  const searchParams = useSearchParams();
  const [selectedSort, setSelectedSort] = useState(() => searchParams.get("sort") || "name");

  return (
    <div id="cards-section" style={{ scrollMarginTop: "73px" }}>
      <FilterBar issuers={issuers} tags={tags} locale={locale} selectedSort={selectedSort} setSelectedSort={setSelectedSort} />
      <CardList cards={cards} tags={tags} locale={locale} selectedSort={selectedSort} />
    </div>
  );
}

function FilterBar({ issuers, tags, locale, selectedSort, setSelectedSort }: { issuers: string[]; tags: string[]; locale: string; selectedSort: string; setSelectedSort: (v: string) => void }) {
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
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="text"
          placeholder={l("searchPlaceholder", locale)}
          defaultValue={search}
          onChange={(e) => updateParam("search", e.target.value)}
          className="flex-1 min-w-[220px] border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={selectedIssuer}
          onChange={(e) => updateParam("issuer", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block max-w-[150px]"
        >
          <option value="">{l("allIssuers", locale)}</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>{issuer}</option>
          ))}
        </select>
        <select
          value={selectedTag}
          onChange={(e) => updateParam("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block max-w-[150px]"
        >
          <option value="">{l("allTags", locale)}</option>
          {displayTags.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={selectedAf}
          onChange={(e) => updateParam("af", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block max-w-[140px]"
        >
          <option value="">{l("allAf", locale)}</option>
          <option value="no">{l("noFee", locale)}</option>
          <option value="lt95">{l("afUnder95", locale)}</option>
          <option value="ge95">{l("afOver95", locale)}</option>
        </select>
        <select
          value={selectedSort}
          onChange={(e) => setSelectedSort(e.target.value)}
          aria-label={l("sortBy", locale)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="name">{l("sortName", locale)}</option>
          <option value="fee-asc">{l("sortFeeAsc", locale)}</option>
          <option value="fee-desc">{l("sortFeeDesc", locale)}</option>
          <option value="bonus">{l("sortBonus", locale)}</option>
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

function CardList({ cards, tags, locale, selectedSort }: { cards: CreditCard[]; tags: string[]; locale: string; selectedSort: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [expandedTiers, setExpandedTiers] = useState<Set<Tier>>(new Set());

  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const selectedAf = searchParams.get("af") || "";
  const search = searchParams.get("search") || "";

  const lang = pathname.split("/")[1] || "en";

  const toggleTier = useCallback((t: Tier) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

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
      if (selectedSort === "bonus") {
        const getBonus = (c: CreditCard) => {
          if (c.welcome_offer?.estimated_value != null) return Number(c.welcome_offer.estimated_value);
          if (c.welcome_offer?.bonus_value != null) {
            const parsed = parseFloat(String(c.welcome_offer.bonus_value).replace(/[^0-9.]/g, ""));
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };
        return getBonus(b) - getBonus(a);
      }
      return a.name.localeCompare(b.name);
    });
  }, [cards, selectedIssuer, selectedTag, selectedAf, search, selectedSort, tags]);

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
          <span className="w-5 h-5 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-500"><Scale className="w-3 h-3" /></span>
          <span>{locale === "zh" ? "加入比價（最多3張）" : locale === "zh-cn" ? "加入比较（最多3张）" : locale === "es" ? "Comparar (máx 3)" : "Compare (up to 3 cards)"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-500"><Bookmark className="w-3 h-3" /></span>
          <span>{locale === "zh" ? "儲存到我的卡片" : locale === "zh-cn" ? "保存到我的卡片" : locale === "es" ? "Guardar en Mis Tarjetas" : "Save to My Cards"}</span>
        </div>
      </div>

      {(() => {
        const hasActiveFilter = !!(search || selectedIssuer || selectedTag || selectedAf);
        const hasCustomSort = !!selectedSort && selectedSort !== "name";
        const useTierMode = !hasActiveFilter && !hasCustomSort;
        const renderRow = (card: CreditCard) => {
          const isCompared = compareIds.includes(card.card_id);
          const isMaxed = compareIds.length >= 3 && !isCompared;
          return (
            <CardRow
              key={card.card_id}
              card={card}
              lang={lang}
              locale={locale}
              isCompared={isCompared}
              isMaxed={isMaxed}
              onToggleCompare={() => toggleCompare(card.card_id)}
            />
          );
        };

        if (useTierMode) {
          return (
            <div className="space-y-8 mt-2">
              {TIER_ORDER.map((tier) => {
                // In tier mode the user hasn't picked an explicit sort, so
                // override the alphabetical default with popularity. Featured
                // cards rise to the top, then welcome-bonus value, then name.
                const inTier = filtered
                  .filter((c) => getTier(c) === tier)
                  .sort((a, b) => {
                    const diff = popularityScore(b) - popularityScore(a);
                    return diff !== 0 ? diff : a.name.localeCompare(b.name);
                  });
                if (inTier.length === 0) return null;
                const expanded = expandedTiers.has(tier);
                const visible = expanded ? inTier : inTier.slice(0, DEFAULT_PER_TIER);
                return (
                  <section key={tier}>
                    <div className="flex items-baseline justify-between mb-3 px-1">
                      <h2 className="text-lg font-bold text-slate-800">
                        {TIER_LABELS[tier][locale] ?? TIER_LABELS[tier].en}
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          {inTier.length} {l("cardsCount", locale)}
                        </span>
                      </h2>
                      {inTier.length > DEFAULT_PER_TIER && (
                        <button
                          onClick={() => toggleTier(tier)}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline shrink-0"
                        >
                          {expanded
                            ? l("showLessInTier", locale)
                            : `${l("showAllInTier", locale)} (${inTier.length})`}
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {visible.map(renderRow)}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        }

        return (
          <div className="space-y-2 mt-2">
            {filtered.map(renderRow)}
          </div>
        );
      })()}

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
