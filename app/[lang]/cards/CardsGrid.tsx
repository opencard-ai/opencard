"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Card {
  card_id: string;
  name: string;
  issuer: string;
  network?: string;
  annual_fee: number;
  welcome_offer?: { bonus_points?: number };
  earning_rates?: { category: string; rate: number }[];
}

interface Props {
  cards: Card[];
  lang: "en" | "zh" | "es";
}

const ISSUERS = ["All", "American Express", "Chase", "Capital One", "Citi", "Discover", "US Bank", "Bank of America", "Wells Fargo", "Navy Federal", "USBank", "Bilt"];

export default function CardsGrid({ cards, lang }: Props) {
  const [search, setSearch] = useState("");
  const [issuer, setIssuer] = useState("All");
  const [feeFilter, setFeeFilter] = useState<"all" | "no-fee" | "has-fee">("all");
  const [sortBy, setSortBy] = useState<"name" | "fee-asc" | "fee-desc">("name");

  const labels = {
    en: { search: "Search cards...", issuer: "Issuer", fee: "Annual Fee", all: "All", noFee: "No Annual Fee", hasFee: "Has Annual Fee", viewDetails: "View details →", welcomeBonus: "Welcome Bonus", annualFee: "Annual Fee", earning: "Earning", bonus: "pts" },
    zh: { search: "搜尋卡片...", issuer: "發卡銀行", fee: "年費", all: "全部", noFee: "免年費", hasFee: "有年費", viewDetails: "查看詳情 →", welcomeBonus: "開卡禮", annualFee: "年費", earning: "回饋", bonus: "pts" },
    es: { search: "Buscar tarjetas...", issuer: "Emisor", fee: "Cuota Anual", all: "Todos", noFee: "Sin Cuota", hasFee: "Con Cuota", viewDetails: "Ver detalles →", welcomeBonus: "Bono", annualFee: "Cuota Anual", earning: "Ganancia", bonus: "pts" },
  };
  const l = labels[lang];

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.issuer.toLowerCase().includes(q) ||
        c.card_id.toLowerCase().includes(q)
      );
    }

    if (issuer !== "All") {
      result = result.filter(c => c.issuer.toLowerCase().includes(issuer.toLowerCase()));
    }

    if (feeFilter === "no-fee") result = result.filter(c => c.annual_fee === 0);
    else if (feeFilter === "has-fee") result = result.filter(c => c.annual_fee > 0);

    if (sortBy === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "fee-asc") result = [...result].sort((a, b) => a.annual_fee - b.annual_fee);
    else if (sortBy === "fee-desc") result = [...result].sort((a, b) => b.annual_fee - a.annual_fee);

    return result;
  }, [cards, search, issuer, feeFilter, sortBy]);

  return (
    <>
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={l.search}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 pl-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
          )}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3">
          {/* Issuer */}
          <select
            value={issuer}
            onChange={e => setIssuer(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {ISSUERS.map(i => (
              <option key={i} value={i}>{i === "All" ? l.all : i}</option>
            ))}
          </select>

          {/* Fee filter */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {([["all", l.all], ["no-fee", l.noFee], ["has-fee", l.hasFee]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFeeFilter(val)}
                className={`px-3 py-2 transition-colors ${feeFilter === val ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none ml-auto"
          >
            <option value="name">{lang === "zh" ? "名稱排序" : lang === "es" ? "Por Nombre" : "Sort by Name"}</option>
            <option value="fee-asc">{lang === "zh" ? "年費 ↑" : lang === "es" ? "Cuota ↑" : "Fee: Low → High"}</option>
            <option value="fee-desc">{lang === "zh" ? "年費 ↓" : lang === "es" ? "Cuota ↓" : "Fee: High → Low"}</option>
          </select>
        </div>

        {/* Results count */}
        <div className="text-xs text-slate-400">
          {filtered.length === cards.length
            ? `${cards.length} cards`
            : `${filtered.length} / ${cards.length} cards`}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(card => {
          const bonus = card.welcome_offer?.bonus_points ?? 0;
          const bonusDisplay = bonus >= 1000 ? `${(bonus / 1000).toFixed(0)}K` : bonus > 0 ? `${bonus}` : "—";
          const topRate = card.earning_rates?.[0];

          return (
            <Link
              key={card.card_id}
              href={`/${lang}/cards/${card.card_id}`}
              className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                    {card.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{card.issuer} · {card.network}</p>
                </div>
                <span className="text-2xl">💳</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{l.welcomeBonus}</span>
                  <span className="text-sm font-bold text-blue-600">
                    {bonusDisplay === "—" ? "—" : `${bonusDisplay} ${l.bonus}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{l.annualFee}</span>
                  <span className={`text-sm font-medium ${card.annual_fee === 0 ? "text-green-600" : "text-slate-700"}`}>
                    {card.annual_fee === 0 ? (lang === "zh" ? "免年費" : lang === "es" ? "Sin cuota" : "No AF") : `$${card.annual_fee}`}
                  </span>
                </div>
                {topRate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{l.earning}</span>
                    <span className="text-sm font-medium text-slate-700">
                      {topRate.rate}× {topRate.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-blue-500 font-medium group-hover:text-blue-700 transition-colors">
                  {l.viewDetails}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">{lang === "zh" ? "找不到符合條件的卡片" : lang === "es" ? "No se encontraron tarjetas" : "No cards match your filters"}</p>
          <button onClick={() => { setSearch(""); setIssuer("All"); setFeeFilter("all"); }} className="mt-3 text-xs text-blue-500 hover:text-blue-700">
            {lang === "zh" ? "清除搜尋" : lang === "es" ? "Limpiar búsqueda" : "Clear search"}
          </button>
        </div>
      )}
    </>
  );
}
