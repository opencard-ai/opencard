"use client";
import { useEffect } from "react";

const BUFFER = 16;

function getHeaderHeight() {
  const header = document.querySelector("header");
  return header?.offsetHeight || 0;
}

function scrollToHash(hash: string) {
  const id = hash.slice(1);
  const el = document.getElementById(id);
  if (!el) return;
  const headerHeight = getHeaderHeight();
  const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - BUFFER;
  window.scrollTo({ top: Math.max(0, targetY) });
}

export default function ScrollAnchorHandler() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      // Delay to override browser's native hash scroll
      const t1 = setTimeout(() => scrollToHash(hash), 50);
      const t2 = setTimeout(() => scrollToHash(hash), 200);
      const t3 = setTimeout(() => scrollToHash(hash), 500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, []);

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      const id = href.slice(1);
      const el = document.getElementById(id);
      if (!el) {
        window.location.href = href;
        return;
      }
      const headerHeight = getHeaderHeight();
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - BUFFER;
      window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      history.pushState(null, "", href);
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, []);

  return null;
}
