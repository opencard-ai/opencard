"use client";
import { t } from "@/lib/i18n";

export default function HeroButtons({ lang }: { lang: string }) {
  const openMyCards = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("opencard_open_mycards"));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* AI 推薦按鈕 - 和 RecommendWidget 懸浮按鈕一致 */}
      <a
        href="/?ask=Best%20card%20for%20my%20needs"
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl"
      >
        <span className="text-xl leading-none">✨</span>
        <span className="font-bold text-sm">{t("home.heroAiCta", lang as any)}</span>
      </a>

      {/* 我的卡片按鈕 - 和 MyCardsWidget 懸浮按鈕一致 */}
      <button
        onClick={openMyCards}
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300"
      >
        <span className="text-xl leading-none">💳</span>
        <span className="font-bold text-sm">{t("home.heroMyCards", lang as any)}</span>
      </button>

      {/* 瀏覽所有卡片 */}
      <a
        href={`/${lang}/#cards-section`}
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300 font-bold text-sm"
      >
        {t("home.heroBrowseAll", lang as any)}
      </a>
    </div>
  );
}
