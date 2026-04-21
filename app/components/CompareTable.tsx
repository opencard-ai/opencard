"use client";

import type { CreditCard, AnnualCredit, RecurringCredit } from "@/lib/cards";

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

function CreditTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
      {value && <span className="font-medium">{value}</span>}
      <span>{label}</span>
    </span>
  );
}

export default function CompareTable({ cards, lang }: CompareTableProps) {
  if (cards.length === 0) return null;

  const allCategories = [...new Set(cards.flatMap((c) => c.earning_rates.map((r) => r.category)))].sort();
  const maxRate = Math.max(...cards.flatMap((c) => c.earning_rates.map((r) => r.rate)));

  const l = (() => {
    const en = {
      annualFee: "Annual Fee", welcomeBonus: "Welcome Offer",
      welcomeReq: "Spend Requirement", creditRequired: "Credit Required",
      foreignFee: "Foreign Fee", network: "Network",
      earningRates: "Earning Rates", travelBenefits: "Travel Benefits",
      annualCredits: "Annual Credits", recurringCredits: "Recurring Credits",
      hotelCredits: "Hotel Credits", fhrThc: "FHR / THC",
      insurance: "Insurance", noAf: "Waived", yes: "Yes", none: "—",
      credits: "credits",
    };
    const zh = {
      annualFee: "年費", welcomeBonus: "開卡禮",
      welcomeReq: "消費門檻", creditRequired: "信用分要求",
      foreignFee: "國外手續費", network: "卡片類型",
      earningRates: "回饋倍率", travelBenefits: "旅遊福利",
      annualCredits: "年費回饋", recurringCredits: "定期回饋",
      hotelCredits: "飯店積分", fhrThc: "FHR / THC",
      insurance: "保險", noAf: "免費", yes: "有", none: "無",
      credits: "筆",
    };
    return { en, zh, es: en }[lang] || en;
  })();

  function labelCell(className = "bg-white") {
    return className;
  }

  return (
    <div className="overflow-x-auto">
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
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">

          {/* Annual Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.annualFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={`font-bold ${card.annual_fee === 0 ? "text-green-600" : "text-slate-800"}`}>
                  {card.annual_fee === 0 ? l.noAf : formatCurrency(card.annual_fee)}
                </span>
              </td>
            ))}
          </tr>

          {/* Annual Credits */}
          {cards.some((c) => c.annual_credits && c.annual_credits.length > 0) && (
            <tr className="bg-blue-50/30">
              <td className="py-3 pr-4 font-medium text-blue-700 sticky left-0 bg-blue-50/30 z-10">{l.annualCredits}</td>
              {cards.map((card) => (
                <td key={card.card_id} className="py-3 px-4">
                  {card.annual_credits && card.annual_credits.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {card.annual_credits.map((ac: AnnualCredit, i: number) => (
                        <CreditTag key={i} label={ac.description || `${formatCurrency(ac.amount)} ${l.credits}`} value={formatCurrency(ac.amount)} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">{l.none}</span>
                  )}
                </td>
              ))}
            </tr>
          )}

          {/* Recurring Credits */}
          {cards.some((c) => c.recurring_credits && c.recurring_credits.length > 0) && (
            <tr className="bg-blue-50/30">
              <td className="py-3 pr-4 font-medium text-blue-700 sticky left-0 bg-blue-50/30 z-10">{l.recurringCredits}</td>
              {cards.map((card) => (
                <td key={card.card_id} className="py-3 px-4">
                  {card.recurring_credits && card.recurring_credits.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {card.recurring_credits.map((rc: RecurringCredit, i: number) => (
                        <CreditTag key={i} label={rc.description} value={formatCurrency(rc.amount)} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">{l.none}</span>
                  )}
                </td>
              ))}
            </tr>
          )}

          {/* Welcome Offer */}
          <tr className="bg-amber-50/50">
            <td className="py-3 pr-4 font-medium text-amber-700 sticky left-0 bg-amber-50/50 z-10">{l.welcomeBonus}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                {card.welcome_offer ? (
                  <div>
                    <div className="font-bold text-amber-700">
                      {card.welcome_offer.estimated_value != null && card.welcome_offer.estimated_value !== 0
                        ? formatCurrency(card.welcome_offer.estimated_value)
                        : card.welcome_offer.bonus_value || "—"}
                    </div>
                    {card.welcome_offer.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{card.welcome_offer.description}</div>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">{l.none}</span>
                )}
              </td>
            ))}
          </tr>

          {/* Spend Requirement */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.welcomeReq}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm text-slate-700">
                {card.welcome_offer?.spending_requirement
                  ? `$${card.welcome_offer.spending_requirement.toLocaleString()} / ${card.welcome_offer.time_period_months || "?"} mo`
                  : "—"}
              </td>
            ))}
          </tr>

          {/* Credit Required */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 z-10">{l.creditRequired}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-sm">{card.credit_required}</td>
            ))}
          </tr>

          {/* Foreign Fee */}
          <tr>
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.foreignFee}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4">
                <span className={card.foreign_transaction_fee === 0 ? "text-green-600 font-medium" : "text-red-500"}>
                  {card.foreign_transaction_fee === 0 ? l.noAf : formatCurrency(card.foreign_transaction_fee)}
                </span>
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

          {/* Earning Rates — section header spanning all data columns */}
          <tr>
            <td className="py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-100 sticky left-0 z-10 border-y border-slate-200"
              colSpan={cards.length + 1}>
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

          {/* FHR / THC */}
          {cards.some((c) => c.fhr_thc?.fhr_eligible || c.fhr_thc?.thc_eligible) && (
            <tr>
              <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.fhrThc}</td>
              {cards.map((card) => (
                <td key={card.card_id} className="py-3 px-4">
                  {card.fhr_thc?.fhr_eligible || card.fhr_thc?.thc_eligible ? (
                    <div className="flex flex-wrap gap-1">
                      {card.fhr_thc?.fhr_eligible && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium border border-amber-300">FHR</span>
                      )}
                      {card.fhr_thc?.thc_eligible && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium border border-amber-300">THC</span>
                      )}
                      {card.fhr_thc?.notes && (
                        <span className="text-xs text-slate-400">{card.fhr_thc.notes}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">{l.none}</span>
                  )}
                </td>
              ))}
            </tr>
          )}

          {/* Travel Benefits */}
          <tr className="bg-slate-50/50">
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-slate-50/50 z-10">{l.travelBenefits}</td>
            {cards.map((card) => (
              <td key={card.card_id} className="py-3 px-4 text-xs">
                {card.travel_benefits?.other_benefits && card.travel_benefits.other_benefits.length > 0 ? (
                  <ul className="space-y-1">
                    {card.travel_benefits.other_benefits.map((b: { name?: string; description: string }, i: number) => (
                      <li key={i} className="text-slate-700">
                        {b.name && <span className="font-medium">{b.name}: </span>}{b.description}
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
            <td className="py-3 pr-4 font-medium text-slate-600 sticky left-0 bg-white z-10">{l.insurance}</td>
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