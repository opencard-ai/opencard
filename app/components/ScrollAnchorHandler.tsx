"use client";
import { useEffect, useRef } from "react";

export default function ScrollAnchorHandler() {
  // Use a ref to track whether we've already handled the initial hash
  const handledRef = useRef(false);

  useEffect(() => {
    const BUFFER = 16;

    const scrollToHash = (hash: string) => {
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      // Calculate where to scroll so element appears right below header + buffer
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - BUFFER;
      window.scrollTo({ top: Math.max(0, targetY) });
    };

    const hash = window.location.hash;
    if (hash) {
      handledRef.current = true;
      // Delay to override browser's native hash scroll (runs after browser scrolls)
      const t1 = setTimeout(() => scrollToHash(hash), 50);
      const t2 = setTimeout(() => scrollToHash(hash), 200);
      const t3 = setTimeout(() => scrollToHash(hash), 500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, []);

  // Intercept all anchor clicks with hash hrefs
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      const hash = href;
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (!el) {
        // If element doesn't exist on this page, navigate
        window.location.href = href;
        return;
      }
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - BUFFER;
      window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      history.pushState(null, "", hash);
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, []);

  return null;
}
