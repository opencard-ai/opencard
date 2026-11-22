import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCardById, isClosedToNewApplicants } from "@/lib/cards";
import { isIndexableCard } from "@/lib/indexable-cards";
import { locales, type Locale } from "@/lib/i18n";
import { getNotFoundLinks } from "@/lib/not-found";
import { getRemovedCard } from "@/lib/removed-cards";
import { removedCardCopy } from "@/lib/removed-card-copy";

// Render fresh HTML for the route handler, which serves it with status 410.
// This HTML is served at /{lang}/cards/{id}; layout components rendering
// pathname-derived markup would cause hydration mismatches.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; card_id: string }> };

function getLocale(lang: string): Locale {
  return locales.find((locale) => locale === lang) ?? "en";
}

// The route handler self-fetches with an internal header; middleware blocks direct requests.
// Do not add removed ids to generateStaticParams or discovery surfaces.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, card_id } = await params;
  const card = getRemovedCard(card_id);
  const copy = removedCardCopy[getLocale(lang)];
  return pageMetadata(lang, `/cards/${card_id}`, {
    title: copy.title,
    description: card ? copy.description(card.name) : undefined,
    robots: { index: false, follow: true },
  });
}

export default async function RemovedCardPage({ params }: Props) {
  const { lang, card_id } = await params;
  const card = getRemovedCard(card_id);
  if (!card) notFound();
  const locale = getLocale(lang);
  const copy = removedCardCopy[locale];
  const alternatives = card.alternatives.flatMap((id) => {
    const alternative = getCardById(id);
    return alternative && isIndexableCard(alternative) && !isClosedToNewApplicants(alternative) ? [alternative] : [];
  });
  const links = getNotFoundLinks(locale).filter(({ href }) =>
    [`/${locale}/find`, `/${locale}#cards-section`, `/${locale}`].includes(href));

  return (
    <section aria-labelledby="removed-card-heading" className="max-w-2xl mx-auto px-4 py-12 sm:py-16 text-center">
      <h1 id="removed-card-heading" className="mb-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{copy.heading}</h1>
      <p className="mb-8 text-slate-600 dark:text-slate-400">{copy.description(card.name)}</p>
      {alternatives.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{copy.alternatives}</h2>
          <ul className="text-left divide-y divide-slate-200 dark:divide-slate-700">
            {alternatives.map((alternative) => (
              <li key={alternative.card_id}>
                <Link href={`/${locale}/cards/${alternative.card_id}`} className="flex min-h-12 items-center px-3 py-3 text-blue-700 underline underline-offset-4 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
                  {alternative.name} — {alternative.issuer}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map(({ href, label }, index) => (
          <li key={href} className={index === 0 ? "sm:col-span-2" : undefined}>
            <Link href={href} className={`flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 ${index === 0 ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600" : "border border-slate-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"}`}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
