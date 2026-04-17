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

  return (
    <div
      className={`fixed right-3 sm:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none transition-all duration-300 ${
        compareBarVisible
          ? "bottom-[71px]"
          : "bottom-6"
      }`}
    >
      <div className="pointer-events-auto">
        <MyCardsWidget lang={lang} />
      </div>
      <div className="pointer-events-auto">
        <ScrollFix />
        <Suspense fallback={null}>
          <RecommendWidget lang={lang} />
        </Suspense>
      </div>
    </div>
  );
}
