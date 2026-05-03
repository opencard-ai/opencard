"use client";
import { Sparkles, CreditCard, Wand2 } from "lucide-react";
import { t } from "@/lib/i18n";

const WIZARD_CTA: Record<string, string> = {
  en: "Quick match",
  zh: "挑卡精靈",
  "zh-cn": "挑卡精灵",
  es: "Match rápido",
};

export default function HeroButtons({ lang }: { lang: string }) {
  const openMyCards = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("opencard_open_mycards"));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/?ask=Best%20card%20for%20my%20needs"
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl"
      >
        <Sparkles className="w-5 h-5" />
        <span className="font-bold text-sm">{t("home.heroAiCta", lang as any)}</span>
      </a>

      <a
        href={`/${lang}/find`}
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-white text-slate-700 border-2 border-blue-300 shadow-md hover:shadow-lg hover:border-blue-400"
      >
        <Wand2 className="w-5 h-5 text-blue-600" />
        <span className="font-bold text-sm">{WIZARD_CTA[lang] || WIZARD_CTA.en}</span>
      </a>

      <button
        onClick={openMyCards}
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300"
      >
        <CreditCard className="w-5 h-5" />
        <span className="font-bold text-sm">{t("home.heroMyCards", lang as any)}</span>
      </button>

      <a
        href={`/${lang}/#cards-section`}
        className="h-12 px-5 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 bg-white text-slate-700 border-2 border-slate-200 shadow-md hover:shadow-lg hover:border-slate-300 font-bold text-sm"
      >
        {t("home.heroBrowseAll", lang as any)}
      </a>
    </div>
  );
}
