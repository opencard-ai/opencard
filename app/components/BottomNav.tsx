"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "opencard_existing_cards";

const LABELS = {
  en: { home: "Home", cards: "Cards", mine: "My Cards", compare: "Compare" },
  zh: { home: "首頁", cards: "卡片", mine: "我的", compare: "比較" },
  es: { home: "Inicio", cards: "Tarjetas", mine: "Mis", compare: "Comparar" },
};

interface Item {
  href: string;
  icon: string;
  key: keyof typeof LABELS["en"];
  match: (path: string) => boolean;
  badge?: number;
}

interface Props {
  lang: string;
}

export default function BottomNav({ lang }: Props) {
  const pathname = usePathname();
  const labels = LABELS[lang as keyof typeof LABELS] || LABELS.en;
  const [myCardsCount, setMyCardsCount] = useState(0);

  // Track local card count for the badge.
  useEffect(() => {
    const read = () => {
      try {
        const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        setMyCardsCount(Array.isArray(v) ? v.length : 0);
      } catch {
        setMyCardsCount(0);
      }
    };
    read();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string[] | undefined>).detail;
      if (Array.isArray(detail)) {
        setMyCardsCount(detail.length);
      } else {
        read();
      }
    };
    window.addEventListener("opencard_cards_updated", handler);
    return () => window.removeEventListener("opencard_cards_updated", handler);
  }, []);

  const items: Item[] = [
    {
      href: `/${lang}`,
      icon: "🏠",
      key: "home",
      match: (p) => p === `/${lang}` || p === `/${lang}/`,
    },
    {
      href: `/${lang}/cards`,
      icon: "💳",
      key: "cards",
      match: (p) => p.startsWith(`/${lang}/cards`) && !p.includes("my-cards"),
    },
    {
      href: `/${lang}/my-cards`,
      icon: "✓",
      key: "mine",
      match: (p) => p.startsWith(`/${lang}/my-cards`),
      badge: myCardsCount,
    },
    {
      href: `/${lang}/compare`,
      icon: "📊",
      key: "compare",
      match: (p) => p.startsWith(`/${lang}/compare`),
    },
  ];

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary navigation"
    >
      <ul className="flex items-stretch justify-around h-14">
        {items.map((it) => {
          const active = it.match(pathname || "");
          return (
            <li key={it.key} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-slate-900" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <span className="text-lg leading-none">{it.icon}</span>
                <span className={`text-[10px] leading-tight ${active ? "font-semibold" : ""}`}>
                  {labels[it.key]}
                </span>
                {typeof it.badge === "number" && it.badge > 0 && (
                  <span
                    className="absolute top-1.5 right-1/2 translate-x-[18px] min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold leading-4 text-center"
                    aria-label={`${it.badge} cards`}
                  >
                    {it.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
