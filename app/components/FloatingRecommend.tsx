"use client";

import { useState, useEffect } from "react";
import RecommendWidget from "./RecommendWidget";

export default function FloatingRecommend({ locale = "en" }: { locale?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-2xl px-5 py-3 transition-all hover:scale-105 active:scale-95 group"
        style={{ boxShadow: "0 8px 32px rgba(59, 130, 246, 0.5), 0 0 0 1px rgba(99,102,241,0.3)" }}
        aria-label="Open AI Card Finder"
      >
        {/* Animated sparkle icon */}
        <span className="text-xl leading-none flex-shrink-0 drop-shadow">✨</span>
        <span className="text-sm font-bold whitespace-nowrap">Find Your Card</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 flex flex-col"
      style={{ maxHeight: "calc(100vh - 80px)" }}
    >
      <RecommendWidget locale={locale} onClose={() => setIsOpen(false)} />
    </div>
  );
}
