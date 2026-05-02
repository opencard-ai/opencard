import { getAllCards } from "@/lib/cards";
import ElevatedOffersList from "@/app/components/ElevatedOffersList";
import { locales } from "@/lib/i18n";
import type { Metadata } from "next";

export const dynamic = "force-static";
export const revalidate = 3600;

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
  return { title: titles[lang] || titles.en, description: descs[lang] || descs.en };
}

export default async function ElevatedOffersPage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  return <ElevatedOffersList cards={cards} lang={lang} />;
}
