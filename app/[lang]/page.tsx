// FORCE_UPDATE_KEY = "7214affe-c79d-4e23-921e-0d93a53a227e"
import { Suspense } from "react";
import HeroButtons from "@/app/components/HeroButtons";
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
        <p className="text-xs text-slate-400 mt-1">
          {lang === "zh" ? "📌 本站僅涵蓋美國信用卡，優惠資訊以美國居民為主" : lang === "es" ? "📌 Este sitio cubre solo tarjetas de crédito de EE.UU." : "📌 This site covers US credit cards only"}
        </p>
      </div>

      {/* Hero AI Section */}
      <div className="mb-6 space-y-3">
        <p className="text-slate-600 text-sm">{t("site.subtitle", locale)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/?ask=Best%20card%20for%20my%20needs"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm px-5 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            {t("home.heroAiCta", lang as any)}
          </a>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("opencard_open_mycards"))}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm px-5 py-2.5 rounded-full border-2 border-slate-200 shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            {t("home.heroMyCards", lang as any)}
          </button>
          <a
            href="#cards-section"
            className="text-sm text-slate-500 hover:text-slate-700 font-medium"
          >
            {t("home.heroBrowseAll", lang as any)}
          </a>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            t("home.heroChip1", lang as any),
            t("home.heroChip2", lang as any),
            t("home.heroChip3", lang as any),
            t("home.heroChip4", lang as any),
          ].map((chip, i) => (
            <a
              key={i}
              href={`/?ask=${encodeURIComponent(chip)}`}
              className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors"
            >
              {chip}
            </a>
          ))}
        </div>
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
      <section id="cards-section" className="mb-4">
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