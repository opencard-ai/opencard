import { localizedAlternates } from "@/lib/seo";
import { getOpenCards } from "@/lib/cards";
import FindWizard from "@/app/components/FindWizard";
import { locales } from "@/lib/i18n";
import type { Metadata } from "next";

export const dynamic = "force-static";
// ISR: daily, not hourly. Page data comes from data/cards/*.json, which only
// changes on deploy (and every deploy starts a fresh ISR cache), so hourly
// regeneration only burned ISR Write units (Hobby: 200k/month). 86400 keeps
// date-relative text (e.g. "reviewed N days ago") at most a day stale.
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const titles: Record<string, string> = {
    en: "Find your card — OpenCard",
    zh: "挑卡精靈 — OpenCard",
    es: "Encuentra tu tarjeta — OpenCard",
  };
  const descs: Record<string, string> = {
    en: "Three quick questions, five card recommendations.",
    zh: "回答 3 題,推薦 5 張卡。",
    es: "Tres preguntas, cinco recomendaciones.",
  };
  return { title: titles[lang] || titles.en, description: descs[lang] || descs.en, alternates: localizedAlternates(lang, "/find") };
}

export default async function FindPage({ params }: Props) {
  const { lang } = await params;
  const cards = getOpenCards();
  return <FindWizard cards={cards} lang={lang} />;
}
