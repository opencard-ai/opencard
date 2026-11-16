import type { Metadata } from "next";
import Link from "next/link";
import { getAllCards } from "@/lib/cards";
import { getCardEditorial } from "@/lib/card-editorial";
import { type CardsParam, selectCompareCards, hasInvalidCompareIds, getCompareSuggestions, getPopularComparisons, getCompareMetadata, getComparePath } from "@/lib/compare-suggestions";
import CompareTable from "@/app/components/CompareTable";
import BackToSection from "@/app/components/BackToSection";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ cards?: CardsParam }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params;
  const { cards } = await searchParams;
  return getCompareMetadata(lang, cards, getAllCards());
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { cards: cardsParam } = await searchParams;

  const allCards = getAllCards();
  const selectedCards = selectCompareCards(cardsParam, allCards);
  const invalidIds = hasInvalidCompareIds(cardsParam, selectedCards);

  const labels: Record<string, { title: string; back: string; noCards: string; selected: string; invalid: string; popular: string; suggested: string; find: string; details: string; compare: string }> = {
    en: {
      selected: "Choose another card to compare with:",
      invalid: "We couldn’t find some requested cards. Choose another card or check the card IDs.",
      suggested: "Suggested comparisons",
      popular: "Popular comparisons",
      find: "Not sure? Find my next card",
      details: "View card details",
      compare: "Compare",
      title: "Compare Cards",
      back: "← Back to Cards",
      noCards: "Choose two cards to compare fees, rewards, and benefits.",
    },
    zh: {
      selected: "選擇另一張卡片來比較：",
      invalid: "找不到部分指定的卡片。請選擇其他卡片或檢查卡片 ID。",
      suggested: "建議比較",
      popular: "熱門比較",
      find: "還不確定？尋找適合我的卡片",
      details: "查看卡片詳情",
      compare: "比較",
      title: "卡片比較",
      back: "← 返回卡片列表",
      noCards: "選擇兩張卡片，比較年費、回饋與福利。",
    },
    "zh-cn": {
      selected: "选择另一张卡片来比较：",
      invalid: "找不到部分指定的卡片。请选择其他卡片或检查卡片 ID。",
      suggested: "建议比较",
      popular: "热门比较",
      find: "还不确定？寻找适合我的卡片",
      details: "查看卡片详情",
      compare: "比较",
      title: "卡片比较",
      back: "← 返回卡片列表",
      noCards: "选择两张卡片，比较年费、回馈与福利。",
    },
    es: {
      selected: "Elige otra tarjeta para comparar con:",
      invalid: "No encontramos algunas tarjetas solicitadas. Elige otra tarjeta o revisa los ID.",
      suggested: "Comparaciones sugeridas",
      popular: "Comparaciones populares",
      find: "¿No sabes cuál? Encuentra mi próxima tarjeta",
      details: "Ver detalles de la tarjeta",
      compare: "Comparar",
      title: "Comparar Tarjetas",
      back: "← Volver a Tarjetas",
      noCards: "Elige dos tarjetas para comparar cuotas, recompensas y beneficios.",
    },
  };
  const l = labels[lang] || labels.en;

  if (selectedCards.length < 2) {
    const selected = selectedCards[0];
    const suggestions = selected ? getCompareSuggestions(selected, allCards,
      getCardEditorial(selected.card_id)?.alternatives.map((alternative) => alternative.cardId)) : [];
    const pairs = selected ? suggestions.map((other) => [selected, other]) : getPopularComparisons(allCards);
    const linkClass = "flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-blue-700 font-medium hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800";

    return (
      <div className="max-w-2xl mx-auto py-10 sm:py-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">{l.title}</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          {selected ? <>{l.selected} <strong>{selected.name}</strong></> : l.noCards}
        </p>
        {invalidIds && <p className="text-slate-600 dark:text-slate-300 mb-6">{l.invalid}</p>}
        <section aria-label={selected ? l.suggested : l.popular} className="mb-6">
          {!selected && <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">{l.popular}</h2>}
          <div className="grid gap-3">
            {pairs.map(([first, second]) => (
              <Link key={`${first.card_id}-${second.card_id}`} href={`/${lang}${getComparePath([first.card_id, second.card_id])}`} className={linkClass}>
                {l.compare} {first.name} vs {second.name}
              </Link>
            ))}
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          {selected ? (
            <Link href={`/${lang}/cards/${selected.card_id}`} className={linkClass}>{l.details}</Link>
          ) : (
            <Link href={`/${lang}/find`} className="flex min-h-11 items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{l.find}</Link>
          )}
          <BackToSection href={`/${lang}#cards-section`} className={linkClass}>
            {l.back}
          </BackToSection>
        </div>
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
      {invalidIds && <p className="text-slate-600 dark:text-slate-300 mb-6">{l.invalid}</p>}
      <CompareTable cards={selectedCards} lang={lang} />
    </div>
  );
}
