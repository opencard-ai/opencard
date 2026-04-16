"use client";
import { useEffect } from "react";

export default function ScrollAnchorHandler() {
  useEffect(() => {
    const BUFFER = 16; // extra gap below header

    const scrollToHash = (hash: string) => {
      const id = hash.slice(1);
      const el = document.getElementById(id) || document.querySelector(`[id="${id}"]`);
      if (!el) return;
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - BUFFER;
      window.scrollTo({ top: targetY });
    };

    // Handle initial page load with hash
    const hash = window.location.hash;
    if (hash) {
      // Use requestAnimationFrame to run after browser's native scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToHash(hash);
        });
      });
    }

    // Intercept all anchor clicks with hash hrefs (prevent native scroll)
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      e.preventDefault();
      scrollToHash(href);
      history.pushState(null, "", href);
    };

    document.addEventListener("click", handleAnchorClick, true); // use capture phase

    return () => {
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, []);

  return null;
}
