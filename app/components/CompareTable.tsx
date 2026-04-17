"use client";

import type { CreditCard } from "@/lib/cards";

interface CompareTableProps {
  cards: CreditCard[];
  lang: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function formatPercent(rate: number): string {
  return `${rate}%`;
}

function RateBar({ rate, maxRate }: { rate: number; maxRate: number }) {
  const pct = maxRate > 0 ? Math.min((rate / maxRate) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-700">{rate}×</span>
    </div>
  );
}

export default function CompareTable({ cards, lang }: CompareTableProps) {
  if (cards.length === 0) return null;

  const maxAf = Math.max(...cards.map((c) => c.annual_fee));
  const maxWelcomeValue = Math.max(
    ...cards.map((c) => c.welcome_offer?.estimated_value || 0)
  );
  const allCategories = [...new Set(cards.flatMap((c) => c.earning_rates.map((r) => r.category)))];
  const allTags = [...new Set(cards.flatMap((c) => c.tags || []))].slice(0, 20);

  const l = {
    en: {
      feature: "Feature", annualFee: "Annual Fee", welcomeBonus: "Welcome Offer",
      welcomeReq: "Spend Requirement", creditRequired: "Credit Required",
      foreignFee: "Foreign Transaction Fee", network: "Network", issuer: "Issuer",
      earningRates: "Earning Rates", travelBenefits: "Travel Benefits",
      insurance: "Insurance", tags: "Tags", maxRate: "Best Rate",
    },
    zh: {
      feature: "項目", annualFee: "年費", welcomeBonus: "開卡禮",
      welcomeReq: "消費門檻", creditRequired: "信用分要求",
      foreignFee: "國外交易手續費", network: "卡片類型", issuer: "發卡機構",
      earningRates: "回饋倍率", travelBenefits: "旅遊福利",
      insurance: "保險", tags: "標籤", maxRate: "最高倍率",
    },
    es: {
      feature: "Característica", annualFee: "Cuota Anual", welcomeBonus: "Bono de Bienvenida",
      welcomeReq: "Requisito de Gasto", creditRequired: "Crédito Requerido",
      foreignFee: "Tarifa Extranjera", network: "Red", issuer: "Emisor",
      earningRates: "Tasas de Ganancias", travelBenefits: "Beneficios de Viaje",
      insurance: "Seguro", tags: "Etiquetas", maxRate: "Mejor Tasa",
    },
  }[lang] || {
    en: {
      feature: "Feature", annualFee: "Annual Fee", welcomeBonus: "Welcome Offer",
      welcomeReq: "Spend Requirement", creditRequired: "Credit Required",
      foreignFee: "Foreign Transaction Fee", network: "Network", issuer: "Issuer",
      earningRates: "Earning Rates", travelBenefits: "Travel Benefits",
      insurance: "Insurance", tags: "Tags", maxRate: "Best Rate",
    },
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-600 w-40 min-w-[120px] sticky left-0 bg-white">
              {l.feature}
            </th>
            {cards.map((card) => (
              <th key={card.card_id} className="text-left py-3 px-4 min-w-[200px]">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="text-base font-bold text-slate-900 leading-tight mb-1">{card.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{card.issuer}</div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {card.tags?.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {/* Annual Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white">{l.annualFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={`font-bold ${card.annual_fee === 0 ? "text-green-600" : "text-slate-800"}`}>
                  {card.annual_fee === 0 ? "免年費" : formatCurrency(card.annual_fee)}
                </span>
              </td>
            ))}
          </tr>

          {/* Welcome Offer */}
          <tr className="bg-amber-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-amber-50/50">{l.welcomeBonus}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                {card.welcome_offer ? (
                  <div>
                    <div className="font-bold text-amber-700">
                      {card.welcome_offer.estimated_value
                        ? formatCurrency(card.welcome_offer.estimated_value)
                        : card.welcome_offer.bonus_value || "有"}
                    </div>
                    {card.welcome_offer.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{card.welcome_offer.description}</div>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm">無</span>
                )}
              </td>
            ))}
          </tr>

          {/* Spend Requirement */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white">{l.welcomeReq}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">
                {card.welcome_offer?.spending_requirement
                  ? `$${card.welcome_offer.spending_requirement.toLocaleString()} / ${card.welcome_offer.time_period_months || "?"} mo`
                  : "—"}
              </td>
            ))}
          </tr>

          {/* Credit Required */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50">{l.creditRequired}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">{card.credit_required}</td>
            ))}
          </tr>

          {/* Foreign Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white">{l.foreignFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={card.foreign_transaction_fee === 0 ? "text-green-600 font-medium" : "text-red-500"}>
                  {card.foreign_transaction_fee === 0 ? "免費" : formatCurrency(card.foreign_transaction_fee)}
                </span>
              </td>
            ))}
          </tr>

          {/* Network */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50">{l.network}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">{card.network}</td>
            ))}
          </tr>

          {/* Earning Rates */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white align-top" rowSpan={allCategories.length + 1}>
              {l.earningRates}
            </td>
          </tr>
          {allCategories.map((cat) => (
            <tr key={cat} className="bg-white hover:bg-slate-50/50">
              <td className="py-2 pr-4 text-xs text-slate-500 sticky left-0 bg-white pl-8">{cat}</td>
              {cards.map((card) => {
                const rate = card.earning_rates.find((r) => r.category === cat);
                return (
                  <td key={card.card_id} className="py-2 px-4">
                    {rate ? (
                      <div className="flex items-center gap-2">
                        <RateBar rate={rate.rate} maxRate={Math.max(...cards.flatMap((c) => c.earning_rates.map((r) => r.rate)))} />
                        {rate.notes && (
                          <span className="text-xs text-slate-400 truncate max-w-[120px]">{rate.notes.split(".")[0]}</span>
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

          {/* Travel Benefits */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 align-top">
              {l.travelBenefits}
            </td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-xs">
                {card.travel_benefits?.other_benefits && card.travel_benefits.other_benefits.length > 0 ? (
                  <ul className="space-y-1">
                    {card.travel_benefits.other_benefits.map((b, i) => (
                      <li key={i} className="text-slate-700">
                        {b.name && <span className="font-medium">{b.name}: </span>}
                        {b.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            ))}
          </tr>

          {/* Insurance */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white align-top">{l.insurance}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-xs">
                <div className="space-y-1">
                  {card.insurance?.rental_insurance && card.insurance.rental_insurance !== "None" && (
                    <div className="text-slate-700">🚗 {card.insurance.rental_insurance}</div>
                  )}
                  {card.insurance?.trip_cancellation && <div className="text-slate-700">✈️ Trip Cancellation</div>}
                  {card.insurance?.trip_delay && <div className="text-slate-700">⏰ Trip Delay</div>}
                  {card.insurance?.extended_warranty && <div className="text-slate-700">🔧 Extended Warranty</div>}
                  {card.insurance?.purchase_protection && <div className="text-slate-700">🛡️ Purchase Protection</div>}
                  {!card.insurance?.rental_insurance && !card.insurance?.trip_cancellation &&
                    !card.insurance?.trip_delay && !card.insurance?.extended_warranty &&
                    !card.insurance?.purchase_protection && (
                      <span className="text-slate-400">—</span>
                    )}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
