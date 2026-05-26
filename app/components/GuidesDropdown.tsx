"use client";
import { useState, useRef, useEffect } from "react";
import { GUIDES } from "@/lib/guides";

export default function GuidesDropdown({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
      >
        Guides
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
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-2 z-50">
          <a
            href={`/${lang}/guides`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            All Guides →
          </a>
          <div className="h-px bg-slate-100 dark:bg-slate-800 mx-3 my-1" />
          {GUIDES.map((g) => (
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
