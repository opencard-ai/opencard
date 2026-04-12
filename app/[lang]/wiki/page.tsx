import { getAllCards } from "@/lib/cards";
import { t, locales } from "@/lib/i18n";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map(lang => ({ lang }));
}

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const titles = {
    en: { title: "Credit Card Wiki – OpenCard AI", desc: `Compare ${cards.length} US credit cards: welcome bonuses, earning rates, annual fees, and travel benefits. Updated daily.` },
    zh: { title: "信用卡維基 - OpenCard AI", desc: `比較 ${cards.length} 張美國信用卡：開卡禮、回饋結糟、年費、旅遊福利，每日更新。` },
    es: { title: "Wiki de Tarjetas de Crédito – OpenCard AI", desc: `Compara ${cards.length} tarjetas de crédito de EE.UU.: bonos de bienvenida, tasas de recompra, cuotas anuales y beneficios de viaje.` },
  };
  const c = titles[lang as keyof typeof titles] || titles.en;
  return {
    title: c.title,
    description: c.desc,
    alternates: { languages: { en: "/en/wiki", zh: "/zh/wiki", es: "/es/wiki" } },
  };
}

export default async function WikiIndexPage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const locale = lang as "en" | "zh" | "es";

  const labels = {
    en: {
      title: "Credit Card Wiki",
      subtitle: "Compare the best US credit cards — bonuses, earning rates, annual fees, and travel benefits. Updated daily from bank and aggregator sources.",
      allCards: "All Cards",
      annualFee: "Annual Fee",
      welcomeBonus: "Welcome Bonus",
      earning: "Earning",
      issuer: "Issuer",
      apply: "Apply",
      learnMore: "Learn More",
      noAnnualFee: "No Annual Fee",
    },
    zh: {
      title: "信用卡維基",
      subtitle: "比較美國最佳信用卡——開卡禮、回饋率、年費、旅遊福利。每日從銀行及聚合網站更新。",
      allCards: "所有卡片",
      annualFee: "年費",
      welcomeBonus: "開卡禮",
      earning: "回饋",
      issuer: "發卡機構",
      apply: "申請",
      learnMore: "了解更多",
      noAnnualFee: "免年費",
    },
    es: {
      title: "Wiki de Tarjetas",
      subtitle: "Compara las mejores tarjetas de crédito de EE.UU.: bonos de bienvenida, tasas de recompra, cuotas anuales y beneficios de viaje.",
      allCards: "Todas",
      annualFee: "Cuota",
      welcomeBonus: "Bono",
      earning: "Recompra",
      issuer: "Emisor",
      apply: "Solicitar",
      learnMore: "Más info",
      noAnnualFee: "Sin cuota",
    },
  };

  const l = labels[locale] || labels.en;

  // Group cards by issuer
  const byIssuer: Record<string, typeof cards> = {};
  for (const card of cards) {
    if (!byIssuer[card.issuer]) byIssuer[card.issuer] = [];
    byIssuer[card.issuer].push(card);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{l.title}</h1>
        <p className="text-slate-500 text-sm max-w-2xl">{l.subtitle}</p>
      </div>

      {/* Issuer groups */}
      {Object.entries(byIssuer).map(([issuer, issuerCards]) => (
        <section key={issuer} className="mb-10">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">{issuer}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {issuerCards.map(card => {
              const bonus = card.welcome_offer?.bonus_points ?? 0;
              const bonusDisplay = bonus >= 1000 ? `${(bonus / 1000).toFixed(0)}K pts` : bonus > 0 ? `${bonus} pts` : "—";
              const topRate = card.earning_rates?.[0];

              return (
                <Link
                  key={card.card_id}
                  href={`/${lang}/wiki/${card.card_id}`}
                  className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                        {card.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{card.network}</p>
                    </div>
                    <span className="text-2xl">💳</span>
                  </div>

                  <div className="space-y-1.5">
                    {/* Welcome Bonus */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{l.welcomeBonus}</span>
                      <span className="text-sm font-bold text-blue-600">{bonusDisplay}</span>
                    </div>
                    {/* Annual Fee */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{l.annualFee}</span>
                      <span className={`text-sm font-medium ${card.annual_fee === 0 ? "text-green-600" : "text-slate-700"}`}>
                        {card.annual_fee === 0 ? l.noAnnualFee : `$${card.annual_fee}`}
                      </span>
                    </div>
                    {/* Top Earning Rate */}
                    {topRate && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{l.earning}</span>
                        <span className="text-sm font-medium text-slate-700">
                          {topRate.rate}× {topRate.category}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-xs text-blue-500 font-medium group-hover:text-blue-700 transition-colors">
                      {l.learnMore} →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-400 text-center mt-8">
        {locale === "zh" ? "資料每日更新。歡迎來自 US Credit Card Guide 及銀行官網。" : locale === "es" ? "Datos actualizados diariamente desde US Credit Card Guide y fuentes bancarias." : "Data updated daily from US Credit Card Guide and bank sources."}
      </p>
    </div>
  );
}
