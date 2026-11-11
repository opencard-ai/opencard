import { localizedAlternates } from "@/lib/seo";
import { getOpenCards } from "@/lib/cards";
import ElevatedOffersList from "@/app/components/ElevatedOffersList";
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
    en: "Top welcome offers — OpenCard",
    zh: "高額開卡禮 — OpenCard",
    es: "Mejores bonos de bienvenida — OpenCard",
  };
  const descs: Record<string, string> = {
    en: "Highest-value sign-up bonuses on the market right now, ranked by estimated value.",
    zh: "目前市場上最有價值的開卡獎勵,按估值排序。",
    es: "Los bonos de inscripción de mayor valor disponibles ahora.",
  };
  return { title: titles[lang] || titles.en, description: descs[lang] || descs.en, alternates: localizedAlternates(lang, "/elevated-offers") };
}

export default async function ElevatedOffersPage({ params }: Props) {
  const { lang } = await params;
  const cards = getOpenCards();
  return <ElevatedOffersList cards={cards} lang={lang} />;
}
