import { getCardById } from "@/lib/cards";
import CompareTable from "@/app/components/CompareTable";
import BackToSection from "@/app/components/BackToSection";
import { locales } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ cards?: string }>;
};

export default async function ComparePage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { cards: cardsParam } = await searchParams;

  const cardIds = cardsParam
    ? cardsParam.split(",").filter(Boolean)
    : [];
  const selectedCards = cardIds
    .map((id) => getCardById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const labels: Record<string, { title: string; back: string; noCards: string }> = {
    en: {
      title: "Compare Cards",
      back: "← Back to Cards",
      noCards: "Select at least 2 cards to compare. Go back and choose cards to compare.",
    },
    zh: {
      title: "卡片比較",
      back: "← 返回卡片列表",
      noCards: "請選擇至少 2 張卡片進行比較。返回列表頁挑選卡片。",
    },
    es: {
      title: "Comparar Tarjetas",
      back: "← Volver a Tarjetas",
      noCards: "Selecciona al menos 2 tarjetas para comparar. Vuelve y elige tarjetas.",
    },
  };
  const l = labels[lang] || labels.en;

  if (selectedCards.length < 2) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">{l.title}</h1>
        <p className="text-slate-500 mb-8">{l.noCards}</p>
        <BackToSection
          href={`/${lang}#cards-section`}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold"
        >
          {l.back}
        </BackToSection>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <BackToSection
          href={`/${lang}#cards-section`}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          {l.back}
        </BackToSection>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          {l.title}: {selectedCards.map((c) => c.name).join(" vs. ")}
        </h1>
      </div>
      <CompareTable cards={selectedCards} lang={lang} />
    </div>
  );
}
