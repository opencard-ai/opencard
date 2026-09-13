"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { hasAnalyticsConsent, trackEvent, trackMyCardsFirstVisit } from "@/lib/analytics";
import { inject } from "@vercel/analytics";

const CONSENT_KEY = "opencard_cookie_consent";

function subscribe(callback: () => void) {
  window.addEventListener("opencard-cookie-consent", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("opencard-cookie-consent", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  try { return window.localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function getServerSnapshot() { return null; }

export default function Analytics() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const injected = useRef(false);
  const pathname = usePathname();
  const lastMeasuredRoute = useRef<string | null>(null);

  useEffect(() => {
    if (consent === "accepted" && !injected.current) {
      inject({ beforeSend: event => hasAnalyticsConsent() ? event : null });
      injected.current = true;
    }
  }, [consent]);

  useEffect(() => {
    if (consent !== "accepted") {
      lastMeasuredRoute.current = null;
      return;
    }
    if (lastMeasuredRoute.current === pathname) return;
    lastMeasuredRoute.current = pathname;
    if (pathname.endsWith("/my-cards")) trackMyCardsFirstVisit();
  }, [consent, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-issuer-outbound]") : null;
      if (link) trackEvent("issuer_outbound_clicked", { card_id: link.dataset.cardId || "unknown", link_type: link.dataset.issuerOutbound || "terms" });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("auxclick", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("auxclick", onClick);
    };
  }, []);

  return null;
}
