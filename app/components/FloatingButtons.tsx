"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import MyCardsWidget from "./MyCardsWidget";
import RecommendWidget from "./RecommendWidget";
import ScrollFix from "./ScrollFix";
import { Suspense } from "react";

interface FloatingButtonsProps {
  lang: string;
}

const COLLAPSE_DELAY_MS = 3000;

export default function FloatingButtons({ lang }: FloatingButtonsProps) {
  const [compareBarVisible, setCompareBarVisible] = useState(false);
  // Smart-pill behaviour: pills start expanded so users discover them, then
  // collapse to icon-only after a few seconds idle. Tapping any pill (or the
  // wrapper) bumps them back to expanded for another window.
  const [expanded, setExpanded] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armCollapse = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS);
  }, []);

  const bump = useCallback(() => {
    setExpanded(true);
    armCollapse();
  }, [armCollapse]);

  useEffect(() => {
    armCollapse();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [armCollapse]);

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
    en: { benefits: "Track Benefits" },
    zh: { benefits: "追蹤福利" },
    es: { benefits: "Seguir Beneficios" },
  };
  const l = labels[lang as keyof typeof labels] || labels.en;

  // On phones the cluster hugs the viewport right edge (small gutter). On
  // desktop, anchor it to the right edge of the centered max-w-5xl content
  // column so the pills don't drift far away from the page on wide displays.
  return (
    <div
      onPointerDownCapture={bump}
      className={`fixed inset-x-0 z-50 pointer-events-none transition-all duration-300 ${
        compareBarVisible ? "bottom-[71px]" : "bottom-6"
      }`}
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-6 flex flex-col items-end gap-3">
        <div className="pointer-events-auto">
          <ScrollFix />
          <Suspense fallback={null}>
            <RecommendWidget lang={lang} expanded={expanded} />
          </Suspense>
        </div>

        <div className="pointer-events-auto">
          <MyCardsWidget lang={lang} expanded={expanded} />
        </div>

        <div className="pointer-events-auto">
          <a
            href={`/${lang}/my-cards`}
            aria-label={l.benefits}
            title={l.benefits}
            className={`h-12 rounded-full shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 text-slate-700 hover:shadow-xl hover:border-blue-400 transition-[width,padding] duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 justify-center overflow-hidden ${
              expanded ? "w-[160px] px-5" : "w-12 px-0"
            }`}
          >
            <span className="text-xl leading-none">✨</span>
            {expanded && <span className="font-bold text-sm whitespace-nowrap">{l.benefits}</span>}
          </a>
        </div>
      </div>
    </div>
  );
}
