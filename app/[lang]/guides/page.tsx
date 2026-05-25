/**
 * /[lang]/guides — index of long-form pillar guides.
 *
 * v1 (2026-05-24) ships with a single entry (Transferable Points 101) to
 * validate the MDX setup and AdSense compatibility. Additional guides are
 * registered in lib/guides.ts.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { GUIDES } from "@/lib/guides";
import { locales, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const title = "Guides — OpenCard";
  const description =
    "Long-form guides on welcome offers, transferable points, and credit-card strategy. Hand-written, regularly refreshed against the OpenCard catalog.";
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
  // i18n note: guide titles + summaries are en-only in v1. Localized
  // versions will be authored as separate MDX files (e.g.
  // content/guides/zh/transferable-points-101.mdx) when the en corpus
  // proves out for AdSense.
  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 mb-2">
          Guides
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Credit card strategy, explained
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400 text-[15px] leading-relaxed">
          Plain-language guides written and maintained against the OpenCard
          catalog. No churning hype, no link-bait listicles — just the model
          you need to make actual decisions.
        </p>
      </header>

      <ul className="space-y-6">
        {GUIDES.map((guide) => (
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
                <span>Updated {guide.updated}</span>
                <span>·</span>
                <span>{guide.word_count.toLocaleString()} words</span>
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
        More guides coming. Suggestions? Drop a note via{" "}
        <Link
          href={`/${safeLang}/about`}
          className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
        >
          About
        </Link>
        .
      </p>
    </main>
  );
}
