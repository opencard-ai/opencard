import { notFound } from "next/navigation";
import { Check, AlertTriangle, Gift } from "lucide-react";
import { getCardById, getAllCards } from "@/lib/cards";
import ChatWidget from "../../../components/ChatWidget";
import TravelProducts from "../../../components/TravelProducts";
import BackToCards from "../../../components/BackToCards";
import AddToMyCardsButton from "../../../components/AddToMyCardsButton";
import ReportErrorModal from "../../../components/ReportErrorModal";
import CardArt from "../../../components/CardArt";
import type { Metadata } from "next";
import { locales, t } from "@/lib/i18n";
import { translateCategory } from "@/lib/category-translations";

const CREDIT_LABELS: Record<string, string> = {
  "Excellent": "Excellent",
  "Good to Excellent": "Good → Excellent",
  "Good": "Good",
  "Good/Excellent": "Good/Excellent",
  "Fair to Good": "Fair → Good",
  "Fair to Excellent": "Fair → Excellent",
  "Fair to Poor": "Fair → Poor",
  "Fair/Poor": "Fair/Poor",
  "Fair": "Fair",
  "Poor": "Poor",
  "Limited/No Credit History": "New Credit",
  "New to Credit / Limited Credit": "New Credit",
  "By Invitation Only": "Invitation Only",
  "Fair to Good (Student)": "Fair → Good (Student)",
  "Good to Excellent (invitation-only / pre-qualification required)": "Good → Excellent (Pre-qual)",
};

function creditLabel(raw: string): string {
  return CREDIT_LABELS[raw] || raw;
}
function formatValue(val: string | number): string {
  const str = String(val);
  return str.startsWith('$') ? str : `$${str}`;
}

function localizedBenefitText(text: string | undefined, lang: string): string {
  if (!text) return "";
  const normalized = text.trim();
  const benefitText: Record<string, Partial<Record<string, string>>> = {
    "Visa Infinite Benefits": {
      zh: "Visa Infinite 福利",
      "zh-cn": "Visa Infinite 福利",
      es: "Beneficios Visa Infinite",
    },
    "Includes trip cancellation/interruption insurance, trip delay reimbursement, lost luggage reimbursement, and other Visa Infinite protections.": {
      zh: "包含旅遊取消／中斷保險、旅遊延誤理賠、行李遺失理賠，以及其他 Visa Infinite 保障。",
      "zh-cn": "包含旅行取消／中断保险、旅行延误理赔、行李遗失理赔，以及其他 Visa Infinite 保障。",
      es: "Incluye seguro de cancelación/interrupción de viaje, reembolso por retrasos de viaje, reembolso por equipaje perdido y otras protecciones Visa Infinite.",
    },
  };

  return benefitText[normalized]?.[lang] || text;
}

// Map site lang → BCP-47 for Intl. zh → zh-TW per project default.
const LOCALE_MAP: Record<string, string> = { zh: "zh-TW", en: "en", es: "es" };

function freshnessFromIso(isoDate: string | undefined, lang: string): { label: string; tone: "fresh" | "ok" | "stale"; absolute: string } | null {
  if (!isoDate) return null;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  const locale = LOCALE_MAP[lang] || "en";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let label: string;
  if (days < 1) label = rtf.format(0, "day");
  else if (days < 30) label = rtf.format(-days, "day");
  else if (days < 365) label = rtf.format(-Math.floor(days / 30), "month");
  else label = rtf.format(-Math.floor(days / 365), "year");
  const tone: "fresh" | "ok" | "stale" = days < 90 ? "fresh" : days < 180 ? "ok" : "stale";
  const absolute = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(t);
  return { label, tone, absolute };
}


export const dynamic = "force-static";
export const revalidate = 3600;

interface Props {
  params: Promise<{ lang: string; card_id: string }>;
}

export async function generateStaticParams() {
  const cards = getAllCards();
  const params: { lang: string; card_id: string }[] = [];
  for (const card of cards) {
    for (const lang of locales) {
      params.push({ lang, card_id: card.card_id });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, card_id } = await params;
  const card = getCardById(card_id);
  if (!card) return { title: t("status.noResults", lang as any) };
  return {
    title: `${card.name} — OpenCard`,
    description: `${card.name}: ${t("card.annualFee", lang as any)} $${card.annual_fee} | ${t("card.welcomeBonus", lang as any)}`,
  };
}

export default async function CardDetailPage({ params }: Props) {
  const { lang, card_id } = await params;
  const locale = lang as any;
  const card = getCardById(card_id);
  if (!card) notFound();

  const l = (key: string, p?: Record<string, string | number>) => t(key, locale, p);
  const freshness = freshnessFromIso(card.last_updated, lang);
  const recurringCredits = (card.recurring_credits || []).filter(c => c.amount !== undefined);
  const hasTravelBenefits = !!(
    (card.travel_benefits?.hotel_status?.length ?? 0) > 0 ||
    (card.travel_benefits?.lounge_access || []).length > 0 ||
    (card.travel_benefits?.other_benefits?.length ?? 0) > 0
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <BackToCards lang={lang} label={l("detail.backToList")} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap mb-4">
          <CardArt cardId={card.card_id} issuer={card.issuer} size="lg" className="shrink-0" />
          <div className="flex-1 min-w-[200px] flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{card.name}</h1>
              <p className="text-slate-500 mt-1">{card.issuer}</p>
            </div>
            <div className="text-right">
              <div
                className={`text-2xl font-bold ${
                  card.annual_fee === 0 ? "text-emerald-600" : "text-slate-900"
                }`}
              >
                {card.annual_fee === 0 ? l("card.annualFeeWaived") : `$${card.annual_fee}`}
              </div>
              <div className="text-xs text-slate-500">{l("card.annualFee")}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-3 py-1">
            {card.network}
          </span>
          <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-3 py-1" title={l("detail.creditRequired")}>
            {creditLabel(card.credit_required)}
          </span>
          {card.foreign_transaction_fee === 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-3 py-1">
              {l("detail.noForeignFee")}
            </span>
          )}
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-blue-50 text-blue-700 rounded-full px-3 py-1"
            >
              {tag}
            </span>
          ))}
          {freshness && (
            <span
              className={`text-xs rounded-full px-3 py-1 inline-flex items-center gap-1 ${
                freshness.tone === "fresh"
                  ? "bg-emerald-50 text-emerald-700"
                  : freshness.tone === "ok"
                  ? "bg-slate-100 text-slate-600"
                  : "bg-amber-50 text-amber-700"
              }`}
              title={`${l("detail.lastUpdated")}: ${freshness.absolute}`}
            >
              {freshness.tone === "fresh" ? <Check className="w-3 h-3" strokeWidth={2.5} /> : freshness.tone === "stale" ? <AlertTriangle className="w-3 h-3" /> : null}
              {freshness.label}
            </span>
          )}
        </div>

        {/* Welcome Offer */}
        {card.welcome_offer && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
              <Gift className="w-4 h-4" /> {l("detail.welcomeBonus")}
            </h3>
            <div className="text-sm text-amber-900">
              {(() => {
                const w = card.welcome_offer;
                const hasPoints = !!(w.bonus_points && w.bonus_points > 0);
                const hasFnas = !!(w.free_nights && w.free_nights > 0);
                const hasValue = !!(w.estimated_value && w.estimated_value > 0);
                if (!hasPoints && !hasFnas && !hasValue) {
                  return <span className="text-amber-700">{l("detail.noWelcomeOffer")}</span>;
                }
                return (
                  <>
                    {hasPoints && (
                      <span className="font-bold">
                        {w.bonus_points!.toLocaleString()} {l("detail.points")}
                      </span>
                    )}
                    {hasFnas && (
                      <span className="font-bold">
                        {hasPoints && <span className="mx-1 font-normal text-amber-700">·</span>}
                        {w.free_night_value_cap
                          ? l("detail.freeNights", { count: w.free_nights!, cap: w.free_night_value_cap.toLocaleString(), plural: w.free_nights! === 1 ? "" : "s" })
                          : l("detail.freeNightsNoCap", { count: w.free_nights!, plural: w.free_nights! === 1 ? "" : "s" })}
                      </span>
                    )}
                    {hasValue && (
                      <span className="ml-1">
                        ({l("detail.estimatedValue", { value: formatValue(w.estimated_value!) })})
                      </span>
                    )}
                    {w.spending_requirement && (
                      <span className="text-xs text-amber-700 block mt-1">
                        {l("detail.spendingReq", { amount: w.spending_requirement.toLocaleString(), months: w.time_period_months ?? 3 })}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* CTA Row: Add to My Cards + AI Assistant */}
        <div className="flex flex-row gap-2 mt-4">
          <div className="flex-1">
            <AddToMyCardsButton cardId={card.card_id} cardName={card.name} lang={lang} />
          </div>
          <div className="flex-1">
            <ChatWidget cardName={card.name} cardId={card.card_id} locale={locale} />
          </div>
        </div>
      </div>

      <div className="space-y-6">
          {/* Earning Rates */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">{l("detail.earningRates")}</h2>
            <div className="space-y-2">
              {card.earning_rates.map((rate, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <span className="text-blue-600 font-bold text-lg">
                      {rate.rate}×
                    </span>
                    <span className="text-slate-700 ml-2 capitalize">
                      {translateCategory(rate.category, lang as "en" | "zh" | "es")}
                    </span>
                    {rate.notes && (
                      <span className="text-xs text-slate-400 block">
                        {rate.notes}
                      </span>
                    )}
                  </div>
                  {rate.program && (
                    <span className="text-xs text-slate-500">
                      {rate.program}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Dynamic / User-Activated Reward Structures */}
          {(card.selectable_rewards || card.relationship_bonus || card.rotating_categories) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                {lang === "zh" || lang === "zh-cn" ? "動態回饋條件" : lang === "es" ? "Condiciones dinámicas" : "Dynamic Reward Rules"}
              </h2>
              <div className="space-y-4">
                {card.selectable_rewards && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">
                      {lang === "zh" || lang === "zh-cn" ? "需選擇／啟用的回饋" : lang === "es" ? "Recompensas seleccionables" : "Selectable rewards"}
                    </h3>
                    <p className="text-xs text-blue-800">
                      {card.selectable_rewards.activation_required
                        ? (lang === "zh" || lang === "zh-cn" ? "需要手動選擇或啟用。" : lang === "es" ? "Requiere selección o activación manual." : "Manual selection or activation required.")
                        : (lang === "zh" || lang === "zh-cn" ? "不需手動啟用。" : lang === "es" ? "No requiere activación manual." : "No manual activation required.")}
                      {card.selectable_rewards.selection_frequency && (
                        <span className="ml-1">{card.selectable_rewards.selection_frequency}</span>
                      )}
                    </p>
                    {card.selectable_rewards.cap && (
                      <p className="text-xs text-blue-700 mt-1">{card.selectable_rewards.cap}</p>
                    )}
                    {(card.selectable_rewards.five_percent_categories || card.selectable_rewards.two_percent_categories) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {card.selectable_rewards.five_percent_categories && (
                          <div>
                            <div className="text-[11px] font-semibold uppercase text-blue-500 mb-1">5%</div>
                            <p className="text-xs text-slate-700">{card.selectable_rewards.five_percent_categories.join(" · ")}</p>
                          </div>
                        )}
                        {card.selectable_rewards.two_percent_categories && (
                          <div>
                            <div className="text-[11px] font-semibold uppercase text-blue-500 mb-1">2%</div>
                            <p className="text-xs text-slate-700">{card.selectable_rewards.two_percent_categories.join(" · ")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {card.relationship_bonus && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                    <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                      {lang === "zh" || lang === "zh-cn" ? "銀行關係加成" : lang === "es" ? "Bono por relación bancaria" : "Relationship bonus"}
                    </h3>
                    <p className="text-xs text-emerald-800">
                      {card.relationship_bonus.program}{card.relationship_bonus.requirements ? ` — ${card.relationship_bonus.requirements}` : ""}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {card.relationship_bonus.tiers.map((tier, i) => (
                        <div key={i} className="rounded-md bg-white/70 border border-emerald-100 px-3 py-2">
                          <div className="text-xs font-semibold text-emerald-800">
                            {tier.tier_name ? `${tier.tier_name}: ` : ""}${tier.qualifying_balance_min.toLocaleString()}+
                            {typeof tier.qualifying_balance_max === "number" ? ` – $${tier.qualifying_balance_max.toLocaleString()}` : ""}
                          </div>
                          {typeof tier.total_cash_back_rate === "number" && (
                            <div className="text-sm font-bold text-slate-900 mt-0.5">{tier.total_cash_back_rate}%</div>
                          )}
                          {typeof tier.earning_bonus_pct === "number" && (
                            <div className="text-[11px] text-slate-500">+{tier.earning_bonus_pct}% bonus</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {card.rotating_categories && (
                  <div className="rounded-lg bg-purple-50 border border-purple-100 p-4">
                    <h3 className="text-sm font-semibold text-purple-900 mb-1">
                      {lang === "zh" || lang === "zh-cn" ? "季度輪替類別" : lang === "es" ? "Categorías trimestrales" : "Quarterly rotating categories"}
                    </h3>
                    <p className="text-xs text-purple-800">
                      {card.rotating_categories.activation_required
                        ? (lang === "zh" || lang === "zh-cn" ? "需要手動啟用。" : lang === "es" ? "Requiere activación manual." : "Manual activation required.")
                        : (lang === "zh" || lang === "zh-cn" ? "不需手動啟用。" : lang === "es" ? "No requiere activación manual." : "No manual activation required.")}
                      {card.rotating_categories.cap ? ` ${card.rotating_categories.cap}` : ""}
                    </p>
                    {card.rotating_categories.quarters_2026 && (
                      <div className="mt-3 space-y-2">
                        {card.rotating_categories.quarters_2026.map((q, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 text-xs border-t border-purple-100 pt-2 first:border-t-0 first:pt-0">
                            <span className="font-semibold text-purple-800 shrink-0">{q.quarter}</span>
                            <span className="text-slate-700">{q.categories.join(" · ")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {card.rotating_categories.reminder_recommendation && (
                      <p className="text-xs text-purple-700 mt-3">{card.rotating_categories.reminder_recommendation}</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Benefits & Credits */}
          {(recurringCredits.length > 0 || hasTravelBenefits) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                {recurringCredits.length > 0 ? l("detail.annualCredits") : l("detail.otherBenefits")}
              </h2>
              {recurringCredits.length > 0 && (
                <div className="space-y-3">
                  {recurringCredits.map((credit, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
                        >
                          <span className={credit.is_free_night ? "text-amber-600 font-bold text-[10px] shrink-0 w-12 text-right uppercase" : "text-emerald-600 font-bold text-sm shrink-0 w-12 text-right"}>
                            {credit.is_free_night ? (lang === "zh" ? "免費住宿" : lang === "zh-cn" ? "免费住宿" : lang === "es" ? "Noche" : "FNA") : (credit.amount && credit.amount > 0 ? `$${credit.amount}` : '')}
                          </span>
                    <div>
                      <span className="text-slate-800 font-medium text-sm">
                        {credit.name}
                      </span>
                      {credit.description && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {credit.description}
                        </p>
                      )}
                      <span className="text-xs text-slate-400">
                        {credit.frequency === 'annual' || credit.frequency === 'cardmember_year' ? '/year' :
                         credit.frequency === 'quarterly' ? '/quarter' :
                         credit.frequency === 'monthly' ? '/month' :
                         credit.frequency === 'semi_annual' ? '/6mo' :
                         credit.frequency === 'per_stay' ? '/stay' : ''}
                      </span>
                    </div>
                  </div>
                ))}
                </div>
              )}

              {/* Travel Privileges — merged into Benefits section */}
              {card.travel_benefits && hasTravelBenefits && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="space-y-3">
                      {(card.travel_benefits.hotel_status?.length ?? 0) > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            {l("detail.hotelStatus")}
                          </h3>
                          <div className="space-y-1">
                            {card.travel_benefits.hotel_status!.map((hs, i) => (
                              <div key={i} className="text-sm">
                                <span className="text-slate-800">{hs.program}</span>
                                <span className="text-blue-600 ml-2 font-medium">{hs.tier}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(card.travel_benefits.lounge_access || []).length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            {l("detail.loungeAccess")}
                          </h3>
                          <div className="space-y-1">
                            {(card.travel_benefits.lounge_access || []).map((lounge, i) => {
                              const meta: string[] = [];
                              if (typeof lounge.passes_per_quarter === "number") {
                                meta.push(`${lounge.passes_per_quarter} ${l("detail.passesPerQuarter")}`);
                              }
                              if (typeof lounge.passes_per_year === "number") {
                                meta.push(`${lounge.passes_per_year} ${l("detail.passesPerYear")}`);
                              }
                              if (lounge.discount) meta.push(lounge.discount);
                              return (
                                <div key={i} className="text-sm text-slate-700 flex items-baseline justify-between gap-2">
                                  <span>{lounge.name}</span>
                                  {meta.length > 0 && (
                                    <span className="text-xs text-slate-500 text-right">{meta.join(" · ")}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {(card.travel_benefits.other_benefits?.length ?? 0) > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            {l("detail.otherBenefits")}
                          </h3>
                          <div className="space-y-2">
                            {card.travel_benefits.other_benefits!.map((ob, i) => (
                              <div key={i}>
                                <span className="text-sm text-slate-800 font-medium">{localizedBenefitText(ob.name, lang)}</span>
                                <p className="text-xs text-slate-500">{localizedBenefitText(ob.description, lang)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </section>
          )}

          {/* Insurance */}
          {card.insurance &&
            Object.keys(card.insurance).length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">{l("detail.insurance")}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: "trip_cancellation", label: l("detail.tripCancel") },
                    { key: "trip_delay", label: l("detail.tripDelay") },
                    { key: "rental_insurance", label: l("detail.rentalIns") },
                    { key: "purchase_protection", label: l("detail.purchaseProt") },
                    { key: "return_protection", label: l("detail.returnProt") },
                    { key: "extended_warranty", label: l("detail.extendedWarranty") },
                  ].map((item) => {
                    const val = card.insurance[
                      item.key as keyof typeof card.insurance
                    ] as boolean | string | undefined;
                    if (!val || val === "0" || val === "None" || val === "No") return null;
                    return (
                      <div
                        key={item.key}
                        className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-700"
                      >
                        {item.label}
                        {typeof val === "string" && (
                          <span className="block text-slate-500 mt-0.5">
                            {val}
                          </span>
                        )}
                        {val === true && (
                          <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5" strokeWidth={2.5} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          {/* Application Rules */}
          {card.application_rules && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">{l("detail.applicationRules")}</h2>
              <div className="flex flex-wrap gap-2">
                {card.application_rules.rules.map((r, i) => (
                  <span
                    key={i}
                    title={r.description}
                    className="text-xs bg-red-50 text-red-700 rounded-full px-3 py-1 cursor-help"
                  >
                    {r.rule}
                  </span>
                ))}
              </div>
              {card.application_rules.notes && (
                <p className="text-xs text-slate-500 mt-2">
                  {card.application_rules.notes}
                </p>
              )}
            </section>
          )}

          {/* Sources */}
          {card.sources?.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-3">{l("detail.sources")}</h2>
              <ul className="space-y-1">
                {card.sources.map((src, i) => (
                  <li key={i}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline break-all"
                    >
                      {src.url}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-400">
                  {l("detail.lastUpdated")}: {freshness?.absolute || card.last_updated}
                </p>
                <ReportErrorModal cardId={card.card_id} cardName={card.name} lang={lang} />
              </div>
            </section>
          )}
      </div>

      {/* Travel Products - full width at bottom */}
      <div className="mt-8">
        <TravelProducts lang={lang} />
      </div>
    </div>
  );
}
