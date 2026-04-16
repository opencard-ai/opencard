"use client";
import { useEffect } from "react";

export default function ScrollAnchorHandler() {
  useEffect(() => {
    // Intercept all anchor clicks that have hash hrefs
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      e.preventDefault();
      const hash = href.slice(1);
      const el = document.getElementById(hash) || document.querySelector(`[id="${hash}"]`);
      if (!el) return;
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top: targetY, behavior: "smooth" });
      // Update URL without triggering native scroll
      history.pushState(null, "", href);
    };

    // Handle initial page load with hash (browser scrolls before React mounts)
    const handleLoad = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const el = document.getElementById(hash) || document.querySelector(`[id="${hash}"]`);
      if (!el) return;
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top: targetY });
    };

    document.addEventListener("click", handleAnchorClick);
    window.addEventListener("load", handleLoad);
    // Also handle hashchange for programmatic navigation
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const el = document.getElementById(hash) || document.querySelector(`[id="${hash}"]`);
      if (!el) return;
      const header = document.querySelector("header");
      const headerHeight = header?.offsetHeight || 0;
      const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    });

    return () => {
      document.removeEventListener("click", handleAnchorClick);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  return null;
}
