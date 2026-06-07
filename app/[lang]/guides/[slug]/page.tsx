/**
 * /[lang]/guides/[slug] — single pillar guide.
 *
 * Loads `content/guides/<slug>.mdx` via dynamic import per the Next.js 16
 * App Router pattern (node_modules/next/dist/docs/01-app/02-guides/mdx.md
 * § Dynamic imports). `dynamicParams = false` so unknown slugs 404.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getGuidesForLocale, getGuide, getLocalizedGuide, hasLocalizedGuide } from "@/lib/guides";
import { locales, t, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string; slug: string }>;
};

export async function generateStaticParams() {
  return locales.flatMap((lang) =>
    getGuidesForLocale(lang).map((g) => ({ lang, slug: g.slug }))
  );
}

export const dynamicParams = false;

async function loadGuideArticle(slug: string, lang: Locale) {
  if (lang !== "en") {
    const localized = await import(`@/content/guides/${lang}/${slug}.mdx`);
    return localized.default;
  }
  const canonical = await import(`@/content/guides/${slug}.mdx`);
  return canonical.default;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);
  if (!hasLocalizedGuide(guide, safeLang)) return {};
  const localizedGuide = getLocalizedGuide(guide, safeLang);
  return {
    title: `${localizedGuide.title} — OpenCard`,
    description: localizedGuide.summary,
    alternates: {
      canonical: `/${lang}/guides/${slug}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}/guides/${slug}`])
      ),
    },
    openGraph: {
      title: localizedGuide.title,
      description: localizedGuide.summary,
      type: "article",
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { lang, slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);
  if (!hasLocalizedGuide(guide, safeLang)) notFound();
  const localizedGuide = getLocalizedGuide(guide, safeLang);
  const Article = await loadGuideArticle(slug, safeLang);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <nav className="mb-8 text-[13px] text-slate-500 dark:text-slate-500">
        <Link
          href={`/${safeLang}/guides`}
          className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
        >
          {t("guides.back", safeLang)}
        </Link>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-500 mb-3">
          <span>{safeLang === "zh" ? "作者" : safeLang === "zh-cn" ? "作者" : safeLang === "es" ? "Autor" : "Written by"} <Link href={`/${safeLang}/about#methodology`} className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300">Kacey</Link></span>
          <span>·</span>
          <span>{safeLang === "zh" ? "已審核" : safeLang === "zh-cn" ? "已审核" : safeLang === "es" ? "Revisado" : "Reviewed"} {localizedGuide.updated}</span>
          <span>·</span>
          <span>{t("guides.updated", safeLang)} {localizedGuide.updated}</span>
          <span>·</span>
          <span>{localizedGuide.word_count.toLocaleString()} {t("guides.words", safeLang)}</span>
          {localizedGuide.tags?.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </header>

      <aside className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>{safeLang === "zh" ? "編輯聲明：" : safeLang === "zh-cn" ? "编辑声明：" : safeLang === "es" ? "Nota editorial: " : "Editorial note: "}</strong>
        {safeLang === "zh"
          ? "本文由 OpenCard 編輯團隊獨立撰寫與維護，未由任何金融機構提供、委託、審核或背書。內容僅供資訊參考，不構成財務建議。"
          : safeLang === "zh-cn"
            ? "本文由 OpenCard 编辑团队独立撰写与维护，未由任何金融机构提供、委托、审核或背书。内容仅供信息参考，不构成财务建议。"
            : safeLang === "es"
              ? "Este contenido es escrito y mantenido independientemente por OpenCard. No es proporcionado, encargado, revisado ni respaldado por ninguna institución financiera. Es solo información, no asesoría financiera."
              : "This content is written and maintained independently by OpenCard. It is not provided, commissioned, reviewed, or endorsed by any financial institution. It is informational only and not financial advice."}
      </aside>

      <article>
        <Article />
      </article>

      <hr className="my-12 border-slate-200 dark:border-slate-800" />

      <footer className="text-[13px] text-slate-500 dark:text-slate-500 space-y-2">
        <p>
          {safeLang === "zh" ? "作者：" : safeLang === "zh-cn" ? "作者：" : safeLang === "es" ? "Autor: " : "Author: "}
          <Link href={`/${safeLang}/about#methodology`} className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300">Kacey</Link> · {safeLang === "zh" ? "編輯審核：OpenCard Editorial" : safeLang === "zh-cn" ? "编辑审核：OpenCard Editorial" : safeLang === "es" ? "Revisión editorial: OpenCard Editorial" : "Editorial review: OpenCard Editorial"}
        </p>
        <p>
          {t("guides.firstPublished", safeLang)} {localizedGuide.published}
          {localizedGuide.updated !== localizedGuide.published && (
            <> · {t("guides.lastUpdated", safeLang)} {localizedGuide.updated}</>
          )}
          .
        </p>
        <p>
          {t("guides.feedback", safeLang)}{" "}
          <Link
            href={`/${safeLang}/about`}
            className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
          >
            {t("guides.letUsKnow", safeLang)}
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
