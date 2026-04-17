"use client";

import { useRouter } from "next/navigation";

interface BackToCardsProps {
  lang: string;
  label: string;
}

export default function BackToCards({ lang, label }: BackToCardsProps) {
  const router = useRouter();

  const handleBack = () => {
    // Navigate to homepage card section
    router.push(`/${lang}#cards-section`);
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors bg-none border-0 cursor-pointer"
    >
      ← {label}
    </button>
  );
}
