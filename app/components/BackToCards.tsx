import Link from "next/link";

interface BackToCardsProps {
  lang: string;
  label: string;
}

export default function BackToCards({ lang, label }: BackToCardsProps) {
  return (
    <Link
      href={`/${lang}#cards-section`}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors bg-none border-0 cursor-pointer"
    >
      {label}
    </Link>
  );
}
