// FORCE_UPDATE_KEY = "7214affe-c79d-4e23-921e-0d93a53a227e"
import { Suspense } from "react";
import { getAllCards, getAllIssuers, getAllTags } from "@/lib/cards";
import CardGrid from "@/app/components/CardGrid";
import TravelProducts from "@/app/components/TravelProducts";
import NewsFeed from "@/app/components/NewsFeed";
import { t, locales } from "@/lib/i18n";

export const dynamic = "force-dynamic";
 // 縮短快取時間從 1h 改為 1m 確保更新穩定

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const issuers = getAllIssuers();
  const tags = getAllTags();
  const locale = lang as any;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("home.title", lang as any)}</h1>
        <p className="text-slate-500 text-sm">{t("home.subtitle", lang as any, { count: cards.length })}</p>
      </div>

      {/* Quick Search CTA — prominent AI card finder entry */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 mb-6">
        <p className="text-blue-700 text-sm font-medium mb-2">
          {lang === "zh" ? "✨ 不知道哪張卡適合你？" : lang === "es" ? "✨ ¿No sabes qué tarjeta elegir?" : "✨ Not sure which card is right for you?"}
        </p>
        <form method="get" action={`/${lang}/cards`}>
          <div className="flex gap-2">
            <input
              type="text"
              name="search"
              placeholder={
                lang === "zh" ? "例如：超市現金回饋、機場貴賓室..."
                : lang === "es" ? "Ej: efectivo en supermercados, salas VIP..."
                : "e.g. grocery cash back, airport lounge access..."
              }
              className="flex-1 border border-blue-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {lang === "zh" ? "搜尋卡片" : lang === "es" ? "Buscar" : "Search Cards"}
            </button>
          </div>
        </form>
        <p className="text-xs text-blue-500 mt-2">
          {lang === "zh" ? "或試用 " : lang === "es" ? "O prueba el " : "Or try the "}
          <a href="#ai-finder" className="underline hover:no-underline font-medium">AI Card Finder →</a>
          {lang === "zh" ? " 智慧推薦" : lang === "es" ? " buscardor AI" : " for smart recommendations"}
        </p>
      </div>

      {/* Daily Finance News Feed — before card search */}
      <Suspense fallback={null}>
        <NewsFeed lang={lang} />
      </Suspense>

      {/* Divider */}
      <div className="flex items-center gap-4 mb-6 mt-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-sm text-slate-400 font-medium">{t("home.cardsAvailable", lang as any, { count: cards.length })}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Card Grid Header */}
      <section className="mb-4">
        <h2 className="text-xl font-bold text-slate-900 mb-1">{t("site.title", locale)}</h2>
        <p className="text-slate-500 text-sm">{t("site.subtitle", locale)}</p>
      </section>

      <Suspense
        fallback={
          <div className="text-center py-12 text-slate-500">
            {t("status.loading", locale)}
          </div>
        }
      >
        <CardGrid cards={cards} issuers={issuers} tags={tags} locale={locale} />
      </Suspense>

      <section id="about" className="mt-12 bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {t("about.title", locale)}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t("about.text", locale)}
        </p>
      </section>

      {/* Travel Products - bottom of page */}
      <div className="mt-10">
        <TravelProducts lang={lang} />
      </div>
    </div>
  );
}