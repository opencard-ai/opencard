"use client";
import { useState, useRef, useEffect } from "react";
import { getLocalizedGuides } from "@/lib/guides";
import { locales, t, type Locale } from "@/lib/i18n";

export default function GuidesDropdown({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";
  const guides = getLocalizedGuides(locale);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1 rounded-md px-2 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
      >
        {t("nav.guides", locale)}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-[60] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-none sm:overflow-visible">
          <a
            href={`/${lang}/guides`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("guides.all", locale)} →
          </a>
          <div className="h-px bg-slate-100 dark:bg-slate-800 mx-3 my-1" />
          {guides.map((g) => (
            <a
              key={g.slug}
              href={`/${lang}/guides/${g.slug}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                {g.title}
              </span>
              <span className="block text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {g.summary}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
