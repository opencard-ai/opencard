import { Suspense } from "react";
import { getAllCards, getAllIssuers, getAllTags } from "@/lib/cards";
import CardGrid from "@/app/components/CardGrid";
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
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          💳 {t("site.title", locale)}
        </h1>
        <p className="text-slate-600">{t("site.subtitle", locale)}</p>
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

      <section id="about" className="mt-16 bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {t("about.title", locale)}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t("about.text", locale)}
        </p>
      </section>
    </div>
  );
}
