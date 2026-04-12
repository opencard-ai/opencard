"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useMemo } from "react";
import type { CreditCard } from "@/lib/cards";

interface CardGridProps {
  cards: CreditCard[];
  issuers: string[];
  tags: string[];
}

export default function CardGrid({ cards, issuers, tags }: CardGridProps) {
  return (
    <>
      <FilterBar issuers={issuers} tags={tags} />
      <CardList cards={cards} />
    </>
  );
}

function FilterBar({ issuers, tags }: { issuers: string[]; tags: string[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const search = searchParams.get("search") || "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}#cards`, { scroll: true });
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="搜尋卡片名稱..."
          defaultValue={search}
          onChange={(e) => updateParam("search", e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={selectedIssuer}
          onChange={(e) => updateParam("issuer", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block"
        >
          <option value="">所有發卡機構</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>
              {issuer}
            </option>
          ))}
        </select>
        <select
          value={selectedTag}
          onChange={(e) => updateParam("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hidden sm:block"
        >
          <option value="">所有類型</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        {(selectedIssuer || selectedTag || search) && (
          <button
            onClick={() => router.push(`${pathname}#cards`)}
            className="px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            清除
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
          <option value="">發卡機構</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>
              {issuer}
            </option>
          ))}
        </select>
        <select
          value={selectedTag}
          onChange={(e) => updateParam("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white flex-1 min-w-[120px]"
        >
          <option value="">卡片類型</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CardList({ cards }: { cards: CreditCard[] }) {
  const searchParams = useSearchParams();
  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const search = searchParams.get("search") || "";

  const filtered = useMemo(() => {
    return cards.filter((card) => {
      if (selectedIssuer && card.issuer !== selectedIssuer) return false;
      if (selectedTag && !card.tags.includes(selectedTag)) return false;
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
    });
  }, [cards, selectedIssuer, selectedTag, search]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-lg mb-2">找不到符合條件的卡片</p>
        <p className="text-sm">試著調整篩選條件</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
        {filtered.map((card) => (
          <Link
            key={card.card_id}
            href={`/cards/${card.card_id}`}
            className="group bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all duration-200 block"
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
              <span className="text-xs text-slate-500">年費</span>
              <span
                className={`text-sm font-medium ${
                  card.annual_fee === 0 ? "text-green-600" : "text-slate-800"
                }`}
              >
                {card.annual_fee === 0
                  ? "免年費"
                  : `$${card.annual_fee.toLocaleString()}`}
              </span>
            </div>

            <div className="mb-3 space-y-0.5">
              {card.earning_rates.slice(0, 2).map((rate, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-xs text-slate-600"
                >
                  <span className="text-blue-600 font-medium">
                    {rate.rate}×
                  </span>
                  <span>{rate.category}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1">
              {card.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center text-sm text-slate-500">
        顯示 {filtered.length} / {cards.length} 張卡片
      </div>
    </>
  );
}
