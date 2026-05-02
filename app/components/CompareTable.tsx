"use client";

import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CreditCard, RecurringCredit } from "@/lib/cards";

interface CompareTableProps {
  cards: CreditCard[];
  lang: string;
}

function formatCurrency(amount: number): string {
  return amount === 0 ? "—" : `$${amount.toLocaleString()}`;
}

function RateBar({ rate, maxRate }: { rate: number; maxRate: number }) {
  const pct = maxRate > 0 ? Math.min((rate / maxRate) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 tabular-nums">{rate}×</span>
    </div>
  );
}

const INSURANCE_KEYS = [
  { key: "trip_cancellation", label: "Trip Cancellation" },
  { key: "trip_delay", label: "Trip Delay" },
  { key: "rental_insurance", label: "Rental Insurance" },
  { key: "purchase_protection", label: "Purchase Protection" },
  { key: "return_protection", label: "Return Protection" },
  { key: "extended_warranty", label: "Extended Warranty" },
] as const;

export default function CompareTable({ cards, lang }: CompareTableProps) {
  if (cards.length === 0) return null;

  const allCategories = [...new Set(cards.flatMap((c) => c.earning_rates.map((r) => r.category)))].sort();
  const maxRate = Math.max(...cards.flatMap((c) => c.earning_rates.map((r) => r.rate)), 1);

  const l = (() => {
    const en = {
      annualFee: "Annual Fee", welcomeBonus: "Welcome Offer",
      creditRequired: "Credit Required", foreignFee: "Foreign Fee", network: "Network",
      earningRates: "Earning Rates",
      benefitsCredits: "Benefits & Credits",
      credits: "Annual Credits",
      hotelStatus: "Hotel Status", loungeAccess: "Lounge Access", otherBenefits: "Other Benefits",
      insurance: "Insurance", noAf: "Waived", yes: "Yes", none: "—",
      firstYearValue: "First-year value",
      firstYearHint: "Welcome offer + annual credits − annual fee",
      viewDetails: "Details",
      swipeHint: "Swipe →",
    };
    const zh = {
      annualFee: "年費", welcomeBonus: "開卡禮",
      creditRequired: "信用分要求", foreignFee: "國外手續費", network: "卡片類型",
      earningRates: "回饋倍率",
      benefitsCredits: "福利與回饋",
      credits: "年費回饋",
      hotelStatus: "飯店會籍", loungeAccess: "貴賓室", otherBenefits: "其他福利",
      insurance: "保險", noAf: "免費", yes: "有", none: "無",
      firstYearValue: "首年淨值",
      firstYearHint: "開卡禮 + 年費回饋 − 年費",
      viewDetails: "詳情",
      swipeHint: "左右滑動 →",
    };
    const es = {
      annualFee: "Cuota anual", welcomeBonus: "Bono de bienvenida",
      creditRequired: "Crédito requerido", foreignFee: "Comisión extranjera", network: "Red",
      earningRates: "Tasas de ganancia",
      benefitsCredits: "Beneficios y créditos",
      credits: "Créditos anuales",
      hotelStatus: "Estatus de hotel", loungeAccess: "Acceso a salones", otherBenefits: "Otros beneficios",
      insurance: "Seguro", noAf: "Sin cuota", yes: "Sí", none: "—",
      firstYearValue: "Valor primer año",
      firstYearHint: "Bono + créditos anuales − cuota",
      viewDetails: "Detalles",
      swipeHint: "Desliza →",
    };
    return ({ en, zh, es } as Record<string, typeof en>)[lang] || en;
  })();

  const firstYearValue = (card: CreditCard): number => {
    const welcome = Number(card.welcome_offer?.estimated_value) || 0;
    const credits = (card.recurring_credits || [])
      .filter((c) => typeof c.amount === "number" && c.amount > 0)
      .reduce((sum, c) => {
        const a = Number(c.amount) || 0;
        if (c.frequency === "monthly") return sum + a * 12;
        if (c.frequency === "quarterly") return sum + a * 4;
        if (c.frequency === "semi_annual") return sum + a * 2;
        return sum + a;
      }, 0);
    return welcome + credits - (card.annual_fee || 0);
  };

  return (
    <div className="overflow-x-auto">
      <div className="md:hidden text-xs text-slate-400 mb-2 px-1">{l.swipeHint}</div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-600 w-44 sticky left-0 bg-slate-50 z-10 min-w-[140px]">
              {l.earningRates}
            </th>
            {cards.map((card) => (
              <th key={card.card_id} className="text-left py-3 px-4 min-w-[180px]">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="text-base font-bold text-slate-900 leading-tight">{card.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{card.issuer}</div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {card.tags?.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/${lang}/cards/${card.card_id}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {l.viewDetails} <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">

          {/* First-year net value (welcome + credits - AF) */}
          <tr className="bg-blue-50/40">
            <td className="py-3 pr-4 sticky left-0 bg-blue-50/40 z-10">
              <div className="font-medium text-slate-700">{l.firstYearValue}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{l.firstYearHint}</div>
            </td>
            {cards.map((card) => {
              const fyv = firstYearValue(card);
              return (
                <td key={card.card_id} className="py-3 px-4">
                  <span className={`text-lg font-bold tabular-nums ${fyv > 0 ? "text-emerald-600" : fyv < 0 ? "text-red-500" : "text-slate-500"}`}>
                    {fyv >= 0 ? `+$${fyv.toLocaleString()}` : `−$${Math.abs(fyv).toLocaleString()}`}
                  </span>
                </td>
              );
            })}
          </tr>

          {/* Annual Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.annualFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={`font-bold ${card.annual_fee === 0 ? "text-emerald-600" : "text-slate-800"}`}>
                  {card.annual_fee === 0 ? l.noAf : formatCurrency(card.annual_fee)}
                </span>
              </td>
            ))}
          </tr>

          {/* Credit Required */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 z-10">{l.creditRequired}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">
                <span className="bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">
                  {card.credit_required}
                </span>
              </td>
            ))}
          </tr>

          {/* Foreign Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.foreignFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={card.foreign_transaction_fee === 0 ? "text-emerald-600 font-medium" : "text-red-500"}>
                  {card.foreign_transaction_fee === 0 ? l.noAf : formatCurrency(card.foreign_transaction_fee)}
                </span>
              </td>
            ))}
          </tr>

          {/* Welcome Offer */}
          <tr className="bg-amber-50/50">
            <td className="py-3 pr-4 font-medium text-amber-700 sticky left-0 bg-amber-50/50 z-10">{l.welcomeBonus}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                {card.welcome_offer ? (
                  <div>
                    {card.welcome_offer.bonus_points ? (
                      <div className="font-bold text-amber-700">
                        {card.welcome_offer.bonus_points.toLocaleString()} pts
                      </div>
                    ) : card.welcome_offer.estimated_value != null && card.welcome_offer.estimated_value !== 0 ? (
                      <div className="font-bold text-amber-700">{formatCurrency(card.welcome_offer.estimated_value)}</div>
                    ) : (
                      <span className="text-slate-400 text-xs">{l.none}</span>
                    )}
                    {card.welcome_offer.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{card.welcome_offer.description}</div>
                    )}
                    {card.welcome_offer.spending_requirement && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Spend ${card.welcome_offer.spending_requirement.toLocaleString()} in {card.welcome_offer.time_period_months || 3} mo
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">{l.none}</span>
                )}
              </td>
            ))}
          </tr>

          {/* Network */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 z-10">{l.network}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">{card.network}</td>
            ))}
          </tr>

          {/* Earning Rates Section Header */}
          <tr>
            <td className="py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-100 sticky left-0 z-10 border-y border-slate-200" colSpan={cards.length + 1}>
              {l.earningRates}
            </td>
          </tr>

          {/* Earning category rows */}
          {allCategories.map((cat) => (
            <tr key={cat} className="hover:bg-slate-50/50">
              <td className="py-2 pr-4 text-xs text-slate-500 sticky left-0 bg-white z-10 border-l-2 border-transparent pl-3">
                {cat}
              </td>
              {cards.map((card) => {
                const rate = card.earning_rates.find((r) => r.category === cat);
                return (
                  <td key={card.card_id} className="py-2 px-4">
                    {rate ? (
                      <div className="flex items-center gap-2">
                        <RateBar rate={rate.rate} maxRate={maxRate} />
                        {rate.notes && (
                          <span className="text-xs text-slate-400 truncate max-w-[100px]">{rate.notes.split(".")[0]}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Benefits & Credits (MERGED: Annual Credits + Travel Benefits) */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10 align-top">{l.benefitsCredits}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-xs align-top">
                <div className="space-y-3">
                  {/* Annual Credits */}
                  {card.recurring_credits?.filter((c) => c.amount !== undefined && (c.amount !== 0 || c.is_free_night)).length ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{l.credits}</div>
                      <ul className="space-y-1">
                        {card.recurring_credits
                          .filter((c) => c.amount !== undefined && (c.amount !== 0 || c.is_free_night))
                          .map((rc: RecurringCredit, i: number) => (
                            <li key={i} className="text-slate-700">
                              {rc.name}{rc.is_free_night ? <span className="ml-1 text-[10px] uppercase font-semibold text-amber-600">FNA</span> : null}
                              {rc.description && <span className="text-slate-400"> - {rc.description.split(".")[0]}</span>}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Hotel Status */}
                  {card.travel_benefits?.hotel_status?.length ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{l.hotelStatus}</div>
                      {card.travel_benefits.hotel_status.map((hs, i) => (
                        <div key={i} className="text-slate-700">
                          {hs.program}{hs.tier && <span className="text-blue-600 ml-1 font-medium">{hs.tier}</span>}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Lounge Access */}
                  {card.travel_benefits?.lounge_access ? (
                    Object.entries(card.travel_benefits.lounge_access).filter(([, v]) => v).length > 0 ? (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{l.loungeAccess}</div>
                        {Object.entries(card.travel_benefits.lounge_access)
                          .filter(([, v]) => v)
                          .map(([key]) => (
                            <div key={key} className="text-slate-700">
                              {key.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())}
                            </div>
                          ))}
                      </div>
                    ) : null
                  ) : null}

                  {/* Other Benefits */}
                  {card.travel_benefits?.other_benefits?.length ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{l.otherBenefits}</div>
                      {card.travel_benefits.other_benefits.map((ob, i) => (
                        <div key={i} className="text-slate-700">
                          {ob.name && <span className="font-medium">{ob.name}: </span>}
                          {ob.description.split(".")[0]}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!card.recurring_credits?.length &&
                   !card.travel_benefits?.hotel_status?.length &&
                   !card.travel_benefits?.lounge_access &&
                   !card.travel_benefits?.other_benefits?.length ? (
                    <span className="text-slate-400">—</span>
                  ) : null}
                </div>
              </td>
            ))}
          </tr>

          {/* Insurance */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 z-10 align-top">{l.insurance}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <div className="grid grid-cols-2 gap-1">
                  {INSURANCE_KEYS.map(({ key, label }) => {
                    const val = card.insurance?.[key as keyof typeof card.insurance];
                    if (!val || val === "0" || val === "None" || val === "No") return null;
                    return (
                      <div key={key} className="text-xs text-slate-700 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" strokeWidth={2.5} /> {val === true ? label : val}
                      </div>
                    );
                  })}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}