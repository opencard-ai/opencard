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
import { GUIDES, getGuide, getLocalizedGuide } from "@/lib/guides";
import { locales, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string; slug: string }>;
};

export async function generateStaticParams() {
  // Cross-product locale × slug. v1 has 4 locales × 1 guide = 4 pages.
  return locales.flatMap((lang) =>
    GUIDES.map((g) => ({ lang, slug: g.slug }))
  );
}

export const dynamicParams = false;

async function loadGuideArticle(slug: string, lang: Locale) {
  if (lang !== "en") {
    try {
      const localized = await import(`@/content/guides/${lang}/${slug}.mdx`);
      return localized.default;
    } catch {
      // Not every legacy guide is translated yet. Fall back to the canonical
      // English article so localized routes still render instead of 404ing.
    }
  }
  const canonical = await import(`@/content/guides/${slug}.mdx`);
  return canonical.default;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const localizedGuide = getLocalizedGuide(guide, lang);
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
  const localizedGuide = getLocalizedGuide(guide, safeLang);
  const Article = await loadGuideArticle(slug, safeLang);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <nav className="mb-8 text-[13px] text-slate-500 dark:text-slate-500">
        <Link
          href={`/${safeLang}/guides`}
          className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
        >
          ← All guides
        </Link>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-500 mb-3">
          <span>Updated {localizedGuide.updated}</span>
          <span>·</span>
          <span>{localizedGuide.word_count.toLocaleString()} words</span>
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

      <article>
        <Article />
      </article>

      <hr className="my-12 border-slate-200 dark:border-slate-800" />

      <footer className="text-[13px] text-slate-500 dark:text-slate-500 space-y-2">
        <p>
          First published {localizedGuide.published}
          {localizedGuide.updated !== localizedGuide.published && (
            <> · Last updated {localizedGuide.updated}</>
          )}
          .
        </p>
        <p>
          Found something wrong or out of date?{" "}
          <Link
            href={`/${safeLang}/about`}
            className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
          >
            Let us know
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
