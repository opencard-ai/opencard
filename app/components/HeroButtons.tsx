"use client";
import { t } from "@/lib/i18n";

export default function HeroButtons({ lang }: { lang: string }) {
  const locale = lang as "en" | "zh" | "es";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/?ask=Best%20card%20for%20my%20needs"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm px-5 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
      >
        {t("home.heroAiCta", lang as any)}
      </a>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("opencard_open_mycards"))}
        className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm px-5 py-2.5 rounded-full border-2 border-slate-200 shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
      >
        {t("home.heroMyCards", lang as any)}
      </button>
      <a
        href="#cards-section"
        className="text-sm text-slate-500 hover:text-slate-700 font-medium ml-1"
      >
        {t("home.heroBrowseAll", lang as any)}
      </a>
    </div>
  );
}
