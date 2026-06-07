"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";

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

  if (consent !== "accepted") return null;

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
