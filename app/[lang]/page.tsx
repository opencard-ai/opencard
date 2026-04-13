import { Suspense } from "react";
import { getAllCards, getAllIssuers, getAllTags } from "@/lib/cards";
import CardGrid from "@/app/components/CardGrid";
import TravelProducts from "@/app/components/TravelProducts";
import NewsFeed from "@/app/components/NewsFeed";
import { t, locales } from "@/lib/i18n";

export const dynamic = "force-static";
export const revalidate = 3600;

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
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Find Your Perfect Card</h1>
        <p className="text-slate-500">Browse {cards.length} cards from top issuers</p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-sm text-slate-400 font-medium">{cards.length} cards available</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Card Grid Header */}
      <section className="mb-6">
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

      {/* Daily Finance News Feed */}
      <Suspense fallback={null}>
        <NewsFeed />
      </Suspense>

      <section id="about" className="mt-16 bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {t("about.title", locale)}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t("about.text", locale)}
        </p>
      </section>

      {/* Travel Products - 主頁底部嵌入 */}
      <div className="mt-12">
        <TravelProducts lang={lang} />
      </div>
    </div>
  );
}