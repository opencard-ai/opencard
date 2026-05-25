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
import { GUIDES, getGuide } from "@/lib/guides";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: `${guide.title} — OpenCard`,
    description: guide.summary,
    alternates: {
      canonical: `/${lang}/guides/${slug}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}/guides/${slug}`])
      ),
    },
    openGraph: {
      title: guide.title,
      description: guide.summary,
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

  // Dynamic import per Next.js MDX docs. The string template must include
  // the .mdx extension and a literal-friendly prefix so the bundler can
  // statically enumerate possible imports.
  const { default: Article } = await import(`@/content/guides/${slug}.mdx`);
  const safeLang = (locales as readonly string[]).includes(lang)
    ? (lang as Locale)
    : ("en" as Locale);

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
      </header>

      <article>
        <Article />
      </article>

      <hr className="my-12 border-slate-200 dark:border-slate-800" />

      <footer className="text-[13px] text-slate-500 dark:text-slate-500 space-y-2">
        <p>
          First published {guide.published}
          {guide.updated !== guide.published && (
            <> · Last updated {guide.updated}</>
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
