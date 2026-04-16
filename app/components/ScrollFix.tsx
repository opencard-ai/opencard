"use client";
import { useEffect } from "react";

export default function ScrollFix() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const fix = () => {
      const el = document.getElementById(hash);
      if (!el) return;
      const header = document.querySelector("header");
      const headerH = header?.offsetHeight ?? 57;
      const BUFFER = 16;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerH - BUFFER;
      if (Math.abs(window.scrollY - targetY) > 2) {
        window.scrollTo({ top: targetY });
      }
    };

    // Use double rAF to run after browser's native hash scroll and React hydration
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(fix);
      setTimeout(fix, 500);
      setTimeout(fix, 1000);
    });
    return () => { cancelAnimationFrame(id1); };
  }, []);

  return null;
}
