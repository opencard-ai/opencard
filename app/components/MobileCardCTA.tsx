"use client";

import { useEffect, useRef } from "react";

/** Links back to the unchanged offer + disclosure, rather than bypassing it. */
export default function MobileCardCTA({ target, label, disclosureLabel }: {
  target: string;
  label: string;
  disclosureLabel: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // CookieConsentBanner owns the shared consent height, including SSR CSS fallback.
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--card-cta-height", `${bar.current?.getBoundingClientRect().height ?? 0}px`);
    };
    const observer = new ResizeObserver(update);
    if (bar.current) observer.observe(bar.current);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--card-cta-height");
    };
  }, []);

  return (
    <div ref={bar} data-mobile-card-cta="" className="sm:hidden fixed inset-x-0 z-[60] border-t border-slate-200 bg-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" style={{ bottom: "var(--card-cookie-height, 0px)" }}>
      <a href={`#${target}`} className="flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        {label} · {disclosureLabel}
      </a>
    </div>
  );
}
