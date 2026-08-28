"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

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
  return window.localStorage.getItem(CONSENT_KEY);
}

function getServerSnapshot() {
  return null;
}

export default function AdSenseScript() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  // Keep the AdSense review surface intentionally narrow. Product tools,
  // card templates, noindex pages, and translated articles must not request
  // advertising code even when the visitor has accepted optional cookies.
  const isHighValueRoute = /^\/(en|zh|zh-cn|es)\/?$/.test(pathname)
    || /^\/en\/guides(?:\/[^/]+)?\/?$/.test(pathname)
    || /^\/(en|zh|zh-cn|es)\/(about|methodology)\/?$/.test(pathname);

  if (consent !== "accepted" || !isHighValueRoute) return null;

  return (
    <Script
      id="google-adsense"
      async
      strategy="afterInteractive"
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9241929717890328"
      crossOrigin="anonymous"
    />
  );
}
