"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";

interface NewsItem {
  title: string;
  url: string;
  permalink?: string;
  source: string;
  score?: number;
  comments?: number;
  ts: string;
  categories?: string[];
  isError?: boolean;
  summary?: string;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "<1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SourceIcon({ source }: { source: string }) {
  if (source === "Doctor of Credit") return (
    <span title="Doctor of Credit — leading US credit card news & offers" className="text-emerald-500 font-bold text-xs cursor-help">DoC</span>
  );
  return <span className="text-slate-400 text-xs">{source}</span>;
}

const NEWS_CAT_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { banking: "Banking", "credit cards": "Credit Cards", "sign-up bonus": "Sign-up Bonus", rewards: "Rewards", travel: "Travel" },
  zh: { banking: "銀行", "credit cards": "信用卡", "sign-up bonus": "開卡獎勵", rewards: "回饋", travel: "旅遊" },
  es: { banking: "Banca", "credit cards": "Tarjetas de Crédito", "sign-up bonus": "Bono de Inscripción", rewards: "Recompensas", travel: "Viajes" },
};

function CategoryBadge({ cat, lang }: { cat: string; lang: string }) {
  const label = cat.toLowerCase();
  const colors: Record<string, string> = {
    banking: "bg-blue-100 text-blue-700",
    "credit cards": "bg-violet-100 text-violet-700",
    "sign-up bonus": "bg-amber-100 text-amber-700",
    rewards: "bg-green-100 text-green-700",
    travel: "bg-sky-100 text-sky-700",
  };
  const c = colors[label] || "bg-slate-100 text-slate-600";
  const translations = NEWS_CAT_TRANSLATIONS[lang] || NEWS_CAT_TRANSLATIONS["en"];
  const displayLabel = translations[label] || cat;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${c}`}>{displayLabel}</span>
  );
}

type Props = {
  lang: string;
};

export default function NewsFeed({ lang }: Props) {
  
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "cards" | "banking" | "deals" | "others">("all");
  const [expanded, setExpanded] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/${lang}/api/daily-digest?lang=${lang}&v=1776235290`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setItems(data.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [lang]);

  const filtered = items.filter((item) => {
    if (item.isError) return false;
    if (filter === "banking") {
      return item.categories?.some((c) =>
        ["banking", "savings", "checking", "bank account"].some((b) =>
          c.toLowerCase().includes(b)
        )
      );
    }
    if (filter === "cards") {
      return item.categories?.some((c) =>
        c.toLowerCase().includes("credit cards")
      );
    }
    if (filter === "deals") {
      return item.categories?.some((c) =>
        ["deals", "free drinks", "freebies", "crypto", "cryptocurrency"].some((d) =>
          c.toLowerCase().includes(d)
        )
      );
    }
    if (filter === "others") {
      const isBanking = item.categories?.some((c) =>
        ["banking", "savings", "checking", "bank account"].some((b) =>
          c.toLowerCase().includes(b)
        )
      );
      const isCards = item.categories?.some((c) =>
        c.toLowerCase().includes("credit cards")
      );
      const isDeals = item.categories?.some((c) =>
        ["deals", "free drinks", "freebies", "crypto", "cryptocurrency"].some((d) =>
          c.toLowerCase().includes(d)
        )
      );
      return !isBanking && !isCards && !isDeals;
    }
    return true;
  });

  const displayItems = expanded ? filtered : filtered.slice(0, 3);
  const hasMore = filtered.length > 3;

  type FilterKey = "all" | "cards" | "banking" | "deals" | "others";
  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("feed.all", lang as any) },
    { key: "cards", label: t("feed.cards", lang as any) },
    { key: "deals", label: t("feed.deals", lang as any) },
    { key: "banking", label: t("feed.banking", lang as any) },
    { key: "others", label: t("feed.others", lang as any) },
  ];

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t("feed.title", lang as any)}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("feed.subtitle", lang as any)}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key);  }}
            className={`text-sm px-3 py-1.5 rounded-full border transition duration-200 ${
              filter === tab.key
                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <div className="w-5 h-5 mx-auto mb-2 animate-spin border-2 border-blue-500 border-t-transparent rounded-full"></div>
            {t("feed.loading", lang as any)}
          </div>
        ) : error && items.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button onClick={fetchNews} className="mt-2 text-sm text-blue-600 hover:underline">Retry</button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">{t("feed.noItems", lang as any)}</div>
        ) : (
          displayItems.map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="p-4 hover:bg-slate-50 transition group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <SourceIcon source={item.source} />
                    {item.categories?.slice(0, 2).map((cat) => (
                      <CategoryBadge key={cat} cat={cat} lang={lang} />
                    ))}
                    <span className="text-xs text-slate-400">{timeAgo(item.ts)}</span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-800 hover:text-blue-600 line-clamp-2 leading-snug"
                  >
                    {item.title}
                  </a>
                  {item.summary && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition shadow-sm"
        >
          {expanded ? t("feed.showLess", lang as any) : t("feed.loadMore", lang as any, { count: filtered.length - 3 })}
        </button>
      )}
    </section>
  );
}
