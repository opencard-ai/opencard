import { getAllCards } from "@/lib/cards";
import { locales } from "@/lib/i18n";
import CardsGrid from "./CardsGrid";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map(lang => ({ lang }));
}

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const titles: Record<string, { title: string; desc: string }> = {
    en: { title: `All Credit Cards (${cards.length}) – OpenCard AI`, desc: `Browse ${cards.length} US credit cards with AI recommendations. Compare welcome bonuses, earning rates, and annual fees.` },
    zh: { title: `所有信用卡 (${cards.length}) – OpenCard AI`, desc: `瀏覽 ${cards.length} 張美國信用卡。比較開卡禮、回饋率與年費。` },
    es: { title: `Todas las Tarjetas (${cards.length}) – OpenCard AI`, desc: `Explora ${cards.length} tarjetas de crédito de EE.UU. con recomendaciones AI.` },
  };
  const c = titles[lang] || titles.en;
  return { title: c.title, description: c.desc };
}

export default async function CardsIndexPage({ params }: Props) {
  const { lang } = await params;
  const cards = getAllCards();
  const locale = lang as "en" | "zh" | "es";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          {locale === "zh" ? "所有信用卡" : locale === "es" ? "Todas las Tarjetas" : `All Credit Cards`}
          <span className="ml-2 text-base font-normal text-slate-400">({cards.length})</span>
        </h1>
        <p className="text-slate-500 text-sm">
          {locale === "zh" ? "用 AI 找到最適合你的卡。或直接瀏覽全部。" : locale === "es" ? "Usa el AI para encontrar tu tarjeta ideal, o navega todas." : "Use AI to find your ideal card, or browse all."}
        </p>
      </div>

      <CardsGrid cards={cards} lang={locale} />
    </div>
  );
}
