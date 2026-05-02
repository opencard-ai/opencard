"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, ArrowUpDown } from "lucide-react";
import CardArt from "./CardArt";
import IssuerChip from "./IssuerChip";
import type { CreditCard } from "@/lib/cards";

interface Props {
  cards: CreditCard[];
  lang: string;
}

const STR = {
  en: {
    title: "Top welcome offers",
    subtitle: "Highest-value sign-up bonuses on the market right now.",
    elevatedTitle: "Currently elevated",
    elevatedSubtitle: "These offers are running above the card's standard bonus.",
    sortValue: "Highest value", sortPoints: "Most points", sortLowAf: "Low annual fee",
    issuerAll: "All issuers", filterIssuer: "Issuer:",
    bonus: "bonus", val: "Est. value", afShort: "AF", spend: "Spend",
    months: "mo", elevated: "Elevated", normal: "Normal", aboveBy: "above standard",
    none: "No cards match the filters.",
  },
  zh: {
    title: "高額開卡禮",
    subtitle: "目前市場上最有價值的開卡獎勵。",
    elevatedTitle: "目前加碼中",
    elevatedSubtitle: "這些開卡禮高於該卡的標準獎勵。",
    sortValue: "估值最高", sortPoints: "點數最多", sortLowAf: "年費最低",
    issuerAll: "全部發卡行", filterIssuer: "發卡行:",
    bonus: "開卡禮", val: "估值", afShort: "年費", spend: "需消費",
    months: "個月", elevated: "加碼中", normal: "平常", aboveBy: "高於標準",
    none: "沒有符合的卡片。",
  },
  es: {
    title: "Mejores bonos de bienvenida",
    subtitle: "Bonos de inscripción de mayor valor disponibles ahora.",
    elevatedTitle: "Actualmente elevados",
    elevatedSubtitle: "Estas ofertas están por encima del bono estándar.",
    sortValue: "Mayor valor", sortPoints: "Más puntos", sortLowAf: "Cuota baja",
    issuerAll: "Todos los emisores", filterIssuer: "Emisor:",
    bonus: "bono", val: "Valor est.", afShort: "Cuota", spend: "Gasto",
    months: "meses", elevated: "Elevado", normal: "Estándar", aboveBy: "sobre estándar",
    none: "Ninguna tarjeta coincide.",
  },
};

type Lang = keyof typeof STR;
type SortKey = "value" | "points" | "lowaf";

function formatPoints(p?: number): string {
  if (!p) return "—";
  return p.toLocaleString();
}

function formatValue(v?: number | string): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? `$${n.toLocaleString()}` : "—";
}

export default function ElevatedOffersList({ cards, lang }: Props) {
  const t = STR[(lang as Lang) in STR ? (lang as Lang) : "en"];
  const [sort, setSort] = useState<SortKey>("value");
  const [issuer, setIssuer] = useState<string>("");

  const issuers = useMemo(() => {
    return [...new Set(cards.map((c) => c.issuer).filter(Boolean))].sort();
  }, [cards]);

  const elevated = useMemo(
    () => cards.filter((c) => c.welcome_offer?.is_elevated),
    [cards],
  );

  const visible = useMemo(() => {
    const filtered = cards.filter((c) => {
      if (!c.welcome_offer) return false;
      const v = Number(c.welcome_offer.estimated_value) || 0;
      if (v <= 0 && !c.welcome_offer.bonus_points) return false;
      if (issuer && c.issuer !== issuer) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "value") {
        return (b.welcome_offer?.estimated_value ?? 0) - (a.welcome_offer?.estimated_value ?? 0);
      }
      if (sort === "points") {
        return (b.welcome_offer?.bonus_points ?? 0) - (a.welcome_offer?.bonus_points ?? 0);
      }
      // lowaf: lowest annual fee first, then highest value
      const af = (a.annual_fee || 0) - (b.annual_fee || 0);
      if (af !== 0) return af;
      return (b.welcome_offer?.estimated_value ?? 0) - (a.welcome_offer?.estimated_value ?? 0);
    });
    return sorted.slice(0, 30);
  }, [cards, sort, issuer]);

  const Row = ({ card }: { card: CreditCard }) => {
    const w = card.welcome_offer!;
    const elevatedDelta = w.is_elevated && w.normal_bonus_points && w.bonus_points
      ? Math.round(((w.bonus_points - w.normal_bonus_points) / w.normal_bonus_points) * 100)
      : null;
    return (
      <Link
        href={`/${lang}/cards/${card.card_id}`}
        className="flex items-center gap-3 bg-white border border-slate-200 hover:border-blue-300 rounded-xl px-3 py-3 transition-colors"
      >
        <CardArt cardId={card.card_id} issuer={card.issuer} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{card.name}</h3>
            {w.is_elevated && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                <Flame className="w-3 h-3" /> {t.elevated}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <IssuerChip issuer={card.issuer} />
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 tabular-nums">{t.afShort} ${card.annual_fee.toLocaleString()}</span>
            {w.spending_requirement && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 tabular-nums whitespace-nowrap">{t.spend} ${w.spending_requirement.toLocaleString()}/{w.time_period_months || 3}{t.months}</span>
              </>
            )}
          </div>
          {elevatedDelta !== null && elevatedDelta > 0 && (
            <div className="mt-1 text-[11px] text-amber-700">
              +{elevatedDelta}% {t.aboveBy} ({formatPoints(w.normal_bonus_points)} pts)
            </div>
          )}
        </div>
        <div className="text-right shrink-0 tabular-nums">
          <div className="text-base font-bold text-slate-900">{formatPoints(w.bonus_points)}</div>
          <div className="text-[11px] text-emerald-600 font-medium">{formatValue(w.estimated_value)}</div>
        </div>
      </Link>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">{t.subtitle}</p>

      {elevated.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">{t.elevatedTitle}</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">{t.elevatedSubtitle}</p>
          <div className="space-y-2">
            {elevated.map((card) => <Row key={card.card_id} card={card} />)}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
          <ArrowUpDown className="w-3 h-3 text-slate-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
          >
            <option value="value">{t.sortValue}</option>
            <option value="points">{t.sortPoints}</option>
            <option value="lowaf">{t.sortLowAf}</option>
          </select>
          <select
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
          >
            <option value="">{t.issuerAll}</option>
            {issuers.map((iss) => (
              <option key={iss} value={iss}>{iss}</option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">{t.none}</p>
        ) : (
          <div className="space-y-2">
            {visible.map((card) => <Row key={card.card_id} card={card} />)}
          </div>
        )}
      </section>
    </div>
  );
}
