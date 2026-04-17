"use client";

interface BackToCardsProps {
  lang: string;
  label: string;
}

export default function BackToCards({ lang, label }: BackToCardsProps) {
  const handleBack = () => {
    // Use window.location to reliably navigate with hash scroll
    window.location.href = `/${lang}#cards-section`;
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
