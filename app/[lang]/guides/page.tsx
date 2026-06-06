/**
 * /[lang]/guides — index of long-form pillar guides.
 *
 * v1 (2026-05-24) ships with a single entry (Transferable Points 101) to
 * validate the MDX setup and AdSense compatibility. Additional guides are
 * registered in lib/guides.ts.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { getLocalizedGuides } from "@/lib/guides";
import { locales, t, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);
  const title = `${t("guides.kicker", safeLang)} — OpenCard`;
  const description = t("guides.description", safeLang);
  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/guides`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}/guides`])
      ),
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function GuidesIndex({ params }: Props) {
  const { lang } = await params;
  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);
  const guides = getLocalizedGuides(safeLang);
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 mb-2">
          {t("guides.kicker", safeLang)}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {t("guides.title", safeLang)}
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400 text-[15px] leading-relaxed">
          {t("guides.description", safeLang)}
        </p>
      </header>

      <ul className="space-y-6">
        {guides.map((guide) => (
          <li
            key={guide.slug}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 hover:border-amber-500/60 transition-colors"
          >
            <Link href={`/${safeLang}/guides/${guide.slug}`} className="block group">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-50 group-hover:text-amber-700 dark:group-hover:text-amber-300">
                {guide.title}
              </h2>
              <p className="mt-2 text-[14px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {guide.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-500">
                <span>{t("guides.updated", safeLang)} {guide.updated}</span>
                <span>·</span>
                <span>{guide.word_count.toLocaleString()} {t("guides.words", safeLang)}</span>
                {guide.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-xs text-slate-500 dark:text-slate-500">
        {t("guides.more", safeLang)}{" "}
        <Link
          href={`/${safeLang}/about`}
          className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
        >
          {t("guides.aboutLink", safeLang)}
        </Link>
        .
      </p>
    </main>
  );
}
