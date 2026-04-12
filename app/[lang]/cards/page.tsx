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
  const titles: Record<string, { title: string; desc: string }> = {
    en: { title: `All Credit Cards (${cards.length}) – OpenCard AI`, desc: `Browse ${cards.length} US credit cards with AI recommendations. Compare welcome bonuses, earning rates, and annual fees.` },
    zh: { title: `所有信用卡 (${cards.length}) – OpenCard AI`, desc: `瀏覽 ${cards.length} 張美國信用卡。比較開卡禮、回饋率與年費。` },
    es: { title: `Todas las Tarjetas (${cards.length}) – OpenCard AI`, desc: `Explora ${cards.length} tarjetas de crédito de EE.UU. con recomendaciones AI.` },
  };
  const c = titles[lang] || titles.en;
  return { title: c.title, description: c.desc };
}

export default async function CardsIndexPage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const locale = lang as "en" | "zh" | "es";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          {locale === "zh" ? "所有信用卡" : locale === "es" ? "Todas las Tarjetas" : `All Credit Cards`}
          <span className="ml-2 text-base font-normal text-slate-400">({cards.length})</span>
        </h1>
        <p className="text-slate-500 text-sm">
          {locale === "zh" ? "用 AI 找到最適合你的卡。或直接瀏覽全部。" : locale === "es" ? "Usa el AI para encontrar tu tarjeta ideal, o navega todas." : "Use AI to find your ideal card, or browse all."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => {
          const bonus = card.welcome_offer?.bonus_points ?? 0;
          const bonusDisplay = bonus >= 1000 ? `${(bonus / 1000).toFixed(0)}K pts` : bonus > 0 ? `${bonus} pts` : "—";
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
                  <span className="text-xs text-slate-500">
                    {locale === "zh" ? "開卡禮" : locale === "es" ? "Bono" : "Welcome Bonus"}
                  </span>
                  <span className="text-sm font-bold text-blue-600">{bonusDisplay}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {locale === "zh" ? "年費" : locale === "es" ? "Cuota" : "Annual Fee"}
                  </span>
                  <span className={`text-sm font-medium ${card.annual_fee === 0 ? "text-green-600" : "text-slate-700"}`}>
                    {card.annual_fee === 0
                      ? (locale === "zh" ? "免年費" : locale === "es" ? "Sin cuota" : "No AF")
                      : `$${card.annual_fee}`}
                  </span>
                </div>
                {topRate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {locale === "zh" ? "回饋" : locale === "es" ? "Recompra" : "Earning"}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {topRate.rate}× {topRate.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-blue-500 font-medium group-hover:text-blue-700 transition-colors">
                  {locale === "zh" ? "查看詳情 →" : locale === "es" ? "Ver detalles →" : "View details →"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
