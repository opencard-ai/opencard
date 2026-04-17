"use client";

import { useRouter } from "next/navigation";

interface BackToCardsProps {
  lang: string;
  label: string;
}

export default function BackToCards({ lang, label }: BackToCardsProps) {
  const router = useRouter();

  const handleBack = () => {
    // Go to homepage card section and scroll to it
    router.push(`/${lang}#cards-section`);
    // Scroll after navigation
    setTimeout(() => {
      const el = document.getElementById("cards-section");
      if (el) {
        const offset = 73; // header height + buffer
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }, 100);
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors bg-none border-0 cursor-pointer"
    >
      {label}
    </button>
  );
}
