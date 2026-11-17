import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BestMethodology from "@/app/components/BestMethodology";
import { BEST_CATEGORIES } from "@/lib/best-categories";
import { localizedAlternates } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  return ["en", "zh"].map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (lang !== "en" && lang !== "zh") notFound();
  return {
    title: lang === "zh"
      ? "依類別挑信用卡：商務卡、商店卡（對照官網） | OpenCard"
      : "Credit Cards by Category: Business & Store Cards Compared | OpenCard",
    description: lang === "zh"
      ? "商務卡、商店卡分類比較，每張都對照過發卡機構官網，寫清楚挑選標準，沒有推薦連結。"
      : "Category picks for business and store credit cards, each checked against the issuer's own pages, with the criteria we used and no affiliate links.",
    alternates: localizedAlternates(lang, "/best", ["en", "zh"]),
  };
}

export default async function BestPage({ params }: Props) {
  const { lang } = await params;
  if (lang !== "en" && lang !== "zh") notFound();
  const title = lang === "zh" ? "依類別挑信用卡" : "Credit cards by category";
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "首頁" : "Home", item: `https://opencardai.com/${lang}` },
      { "@type": "ListItem", position: 2, name: title, item: `https://opencardai.com/${lang}/best` },
    ],
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mb-8">{title}</h1>
      <ul className="space-y-6">
        {BEST_CATEGORIES.map((category) => (
          <li key={category.slug} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              <Link href={`/${lang}/best/${category.slug}`} className="hover:text-amber-700 dark:hover:text-amber-300">{category.title[lang]}</Link>
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">{category.intro[lang]}</p>
          </li>
        ))}
      </ul>
      <BestMethodology lang={lang} />
    </main>
  );
}
