"use client";

import { useState, useEffect } from "react";
import MyCardsWidget from "./MyCardsWidget";
import RecommendWidget from "./RecommendWidget";
import ScrollFix from "./ScrollFix";
import { Suspense } from "react";

interface FloatingButtonsProps {
  lang: string;
}

export default function FloatingButtons({ lang }: FloatingButtonsProps) {
  const [compareBarVisible, setCompareBarVisible] = useState(false);

  useEffect(() => {
    const show = () => setCompareBarVisible(true);
    const hide = () => setCompareBarVisible(false);
    window.addEventListener("comparebar:show", show);
    window.addEventListener("comparebar:hide", hide);
    return () => {
      window.removeEventListener("comparebar:show", show);
      window.removeEventListener("comparebar:hide", hide);
    };
  }, []);

  const labels = {
    en: { benefits: "My Benefits" },
    zh: { benefits: "我的福利" },
    es: { benefits: "Mis Beneficios" },
  };
  const l = labels[lang as keyof typeof labels] || labels.en;

  return (
    <div
      className={`fixed right-3 sm:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none transition-all duration-300 ${
        compareBarVisible
          ? "bottom-[71px]"
          : "bottom-6"
      }`}
    >
      {/* 1. Recommend Cards (top) */}
      <div className="pointer-events-auto">
        <ScrollFix />
        <Suspense fallback={null}>
          <RecommendWidget lang={lang} />
        </Suspense>
      </div>

      {/* 2. My Cards widget */}
      <div className="pointer-events-auto">
        <MyCardsWidget lang={lang} />
      </div>

      {/* 3. My Benefits — links to My Cards page */}
      <div className="pointer-events-auto">
        <a
          href={`/${lang}/my-cards`}
          className="h-12 px-5 rounded-full shadow-lg bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-yellow-300 text-slate-700 shadow-md hover:shadow-lg hover:border-yellow-400 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
        >
          <span className="text-xl leading-none">✨</span>
          <span className="font-bold text-sm">{l.benefits}</span>
        </a>
      </div>
    </div>
  );
}
