"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
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
  // Smart-pill behaviour, mobile only: pills start expanded so users discover
  // them, then collapse to icon-only after a few seconds idle. Tapping any pill
  // bumps them back to expanded. Desktop keeps full pills always.
  const [expanded, setExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track viewport so we can skip the collapse timer on desktop entirely.
  // matchMedia is an external store; setting initial state in the effect
  // is the standard idiom (SSR has no window).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 639px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const armCollapse = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS);
  }, []);

  const bump = useCallback(() => {
    setExpanded(true);
    if (isMobile) armCollapse();
  }, [armCollapse, isMobile]);

  // Reset to expanded whenever the viewport flips to desktop, then arm the
  // collapse timer on mobile. The setExpanded call is intentional cross-
  // viewport reset, not derived state — keep it in the effect.
  useEffect(() => {
    if (!isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    armCollapse();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isMobile, armCollapse]);

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
    "zh-cn": { benefits: "追踪福利" },
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
            className={`h-12 rounded-full shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900 border-2 border-blue-300 dark:border-blue-500 text-slate-700 dark:text-blue-100 hover:shadow-xl hover:border-blue-400 transition-[width,padding] duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 justify-center overflow-hidden ${
              expanded ? "w-[160px] px-5" : "w-12 px-0"
            }`}
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            {expanded && <span className="font-bold text-sm whitespace-nowrap">{l.benefits}</span>}
          </a>
        </div>
      </div>
    </div>
  );
}
