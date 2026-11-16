import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BestMethodology from "@/app/components/BestMethodology";
import { BEST_CATEGORIES, getBestCategory } from "@/lib/best-categories";
import { getAllCards } from "@/lib/cards";
import { localizedAlternates } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  return ["en", "zh"].flatMap((lang) => BEST_CATEGORIES.map(({ slug }) => ({ lang, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  if (lang !== "en" && lang !== "zh") notFound();
  const category = getBestCategory(slug);
  if (!category) notFound();
  return {
    title: `${category.title[lang]} | OpenCard`,
    description: category.metaDescription[lang],
    alternates: localizedAlternates(lang, `/best/${slug}`, ["en", "zh"]),
  };
}

export default async function BestCategoryPage({ params }: Props) {
  const { lang, slug } = await params;
  if (lang !== "en" && lang !== "zh") notFound();
  const category = getBestCategory(slug);
  if (!category) notFound();
  const cards = new Map(getAllCards().map((card) => [card.card_id, card]));
  const picks = category.picks.flatMap((pick) => {
    const card = cards.get(pick.cardId);
    return card ? [{ pick, card }] : [];
  });
  const hubTitle = lang === "zh" ? "依類別挑信用卡" : "Credit cards by category";
  const baseUrl = `https://opencardai.com/${lang}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        itemListElement: picks.map(({ card }, index) => ({
          "@type": "ListItem", position: index + 1, name: card.name, url: `https://opencardai.com/en/cards/${card.card_id}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: lang === "zh" ? "首頁" : "Home", item: baseUrl },
          { "@type": "ListItem", position: 2, name: hubTitle, item: `${baseUrl}/best` },
          { "@type": "ListItem", position: 3, name: category.title[lang], item: `${baseUrl}/best/${slug}` },
        ],
      },
    ],
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-8 text-sm text-slate-500">
        <Link href={`/${lang}/best`} className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300">{hubTitle}</Link>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{category.title[lang]}</h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 leading-relaxed">{category.intro[lang]}</p>
      <section className="my-8">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">{lang === "zh" ? "我們怎麼挑" : "How we picked"}</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400">
          {category.criteria[lang].map((criterion) => <li key={criterion}>{criterion}</li>)}
        </ul>
      </section>
      <div className="space-y-6">
        {picks.map(({ pick, card }) => (
          <section key={pick.cardId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{pick.pick[lang]}</h2>
            <Link href={`/${lang}/cards/${card.card_id}`} className="mt-2 inline-block font-medium text-blue-600 hover:underline">{card.name}</Link>
            <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">{pick.summary[lang]}</p>
            <a href={pick.source} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              {lang === "zh" ? "資料來源：發卡機構官網" : "Source: issuer page"}
              <span className="sr-only">{lang === "zh" ? "（在新分頁開啟）" : " (opens in a new tab)"}</span>
            </a>
          </section>
        ))}
      </div>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-3">{lang === "zh" ? "申請前先看" : "Before you apply"}</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400">
          {category.caveats[lang].map((caveat) => <li key={caveat}>{caveat}</li>)}
        </ul>
      </section>
      <BestMethodology lang={lang} />
      <p className="mt-6 text-sm text-slate-500">{lang === "zh" ? "最後確認日期：" : "Last checked on the issuer's pages: "}<time dateTime={category.verified}>{category.verified}</time></p>
    </main>
  );
}
