import { getAllCards } from "@/lib/cards";
import FindWizard from "@/app/components/FindWizard";
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
    en: "Find your card — OpenCard",
    zh: "挑卡精靈 — OpenCard",
    es: "Encuentra tu tarjeta — OpenCard",
  };
  const descs: Record<string, string> = {
    en: "Three quick questions, five card recommendations.",
    zh: "回答 3 題,推薦 5 張卡。",
    es: "Tres preguntas, cinco recomendaciones.",
  };
  return { title: titles[lang] || titles.en, description: descs[lang] || descs.en };
}

export default async function FindPage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  return <FindWizard cards={cards} lang={lang} />;
}
