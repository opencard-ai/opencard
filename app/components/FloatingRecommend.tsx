"use client";

import { useState, useEffect } from "react";
import RecommendWidget from "./RecommendWidget";

export default function FloatingRecommend({ locale = "en" }: { locale?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSeen, setHasSeen] = useState(false);

  // Show floating button after user has scrolled past the hero area
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200) {
        setHasSeen(true);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Also show if user hasn't interacted with the embedded widget
  useEffect(() => {
    const handleClick = () => setHasSeen(true);
    window.addEventListener("scroll", handleClick, { passive: true });
    return () => window.removeEventListener("scroll", handleClick);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-2xl w-16 h-16 flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
        style={{ boxShadow: "0 8px 32px rgba(59, 130, 246, 0.4)" }}
        aria-label="Open AI Card Finder"
      >
        <span className="text-2xl">🧠</span>
        {/* Tooltip */}
        <span className="absolute right-full mr-3 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          AI Card Finder
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96" style={{ maxHeight: "calc(100vh - 80px)" }}>
      <RecommendWidget locale={locale} />
    </div>
  );
}
