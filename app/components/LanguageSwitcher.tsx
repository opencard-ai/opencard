"use client";

import { useRouter, usePathname } from "next/navigation";
import { locales, localeNames } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  // Extract current locale from pathname (e.g. /en/cards/chase-sapphire -> en)
  const currentLocale = (pathname.split("/")[1] || "en") as Locale;

  const switchLocale = (newLocale: Locale) => {
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  return (
    <div className="relative inline-block">
      <select
        value={currentLocale}
        onChange={(e) => switchLocale(e.target.value as Locale)}
        className="appearance-none bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-600 cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeNames[loc]}
          </option>
        ))}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
        ▾
      </span>
    </div>
  );
}
