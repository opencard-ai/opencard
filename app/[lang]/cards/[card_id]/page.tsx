import { notFound } from "next/navigation";
import { getCardById, getAllCards } from "@/lib/cards";
import ChatWidget from "../../../components/ChatWidget";
import TravelProducts from "../../../components/TravelProducts";
import BackToCards from "../../../components/BackToCards";
import AddToMyCardsButton from "../../../components/AddToMyCardsButton";
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <BackToCards lang={lang} label={l("detail.backToList")} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{card.name}</h1>
            <p className="text-slate-500 mt-1">{card.issuer}</p>
          </div>
          <div className="text-right">
            <div
              className={`text-2xl font-bold ${
                card.annual_fee === 0 ? "text-green-600" : "text-slate-900"
              }`}
            >
              {card.annual_fee === 0 ? l("card.annualFeeWaived") : `$${card.annual_fee}`}
            </div>
            <div className="text-xs text-slate-500">{l("card.annualFee")}</div>
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
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-3 py-1">
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
        </div>

        {/* Welcome Offer */}
        {card.welcome_offer && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              🎁 {l("detail.welcomeBonus")}
            </h3>
            <div className="text-sm text-amber-900">
              {card.welcome_offer.bonus_points && (
                <span className="font-bold">
                  {card.welcome_offer.bonus_points.toLocaleString()} {l("detail.points")}
                </span>
              )}
              {card.welcome_offer.estimated_value && (
                <span className="ml-1">
                  ({l("detail.estimatedValue", { value: `$${card.welcome_offer.estimated_value}` })})
                </span>
              )}
              {card.welcome_offer.spending_requirement && (
                <span className="text-xs text-amber-700 block mt-1">
                  {l("detail.spendingReq", { amount: card.welcome_offer.spending_requirement.toLocaleString(), months: card.welcome_offer.time_period_months ?? 3 })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Add to My Cards CTA */}
        <AddToMyCardsButton cardId={card.card_id} cardName={card.name} lang={lang} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
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

          {/* Annual Credits */}
          {card.annual_credits.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">{l("detail.annualCredits")}</h2>
              <div className="space-y-3">
                {card.annual_credits.map((credit, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-green-600 font-bold text-sm shrink-0">
                      ${credit.amount}
                    </span>
                    <div>
                      <span className="text-slate-800 font-medium text-sm">
                        {credit.name}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {credit.description}
                      </p>
                      <span className="text-xs text-slate-400">
                        {credit.frequency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Travel Benefits */}
          {card.travel_benefits &&
            (card.travel_benefits.hotel_status?.length ||
              card.travel_benefits.lounge_access?.length ||
              card.travel_benefits.other_benefits?.length) && (
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">
                  {l("detail.travelBenefits")}
                </h2>

                {card.travel_benefits.hotel_status?.length && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      {l("detail.hotelStatus")}
                    </h3>
                    <div className="space-y-1">
                      {card.travel_benefits.hotel_status.map((hs, i) => (
                        <div key={i} className="text-sm">
                          <span className="text-slate-800">{hs.program}</span>
                          <span className="text-blue-600 ml-2 font-medium">
                            {hs.tier}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {card.travel_benefits.lounge_access?.length && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      {l("detail.loungeAccess")}
                    </h3>
                    <div className="space-y-1">
                      {card.travel_benefits.lounge_access.map((la, i) => (
                        <div key={i} className="text-sm text-slate-700">
                          {la.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {card.travel_benefits.other_benefits?.length && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      {l("detail.otherBenefits")}
                    </h3>
                    <div className="space-y-2">
                      {card.travel_benefits.other_benefits.map((ob, i) => (
                        <div key={i}>
                          <span className="text-sm text-slate-800 font-medium">
                            {ob.name}
                          </span>
                          <p className="text-xs text-slate-500">{ob.description}</p>
                        </div>
                      ))}
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
                    if (!val) return null;
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
                          <span className="block text-green-600 mt-0.5 font-medium">
                            ✓
                          </span>
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
              <p className="text-xs text-slate-400 mt-3">
                {l("detail.lastUpdated")}: {card.last_updated}
              </p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Chat Widget */}
          <ChatWidget cardName={card.name} cardId={card.card_id} locale={locale} />

        </div>
      </div>

      {/* Travel Products - full width at bottom */}
      <div className="mt-8">
        <TravelProducts lang={lang} />
      </div>
    </div>
  );
}
