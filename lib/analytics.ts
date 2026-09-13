"use client";

import { track } from "@vercel/analytics";

export function hasAnalyticsConsent() {
  try { return typeof window !== "undefined" && localStorage.getItem("opencard_cookie_consent") === "accepted"; }
  catch { return false; }
}

// Never queue pre-consent events or include email, prompts, credit profile, or card-instance IDs.
export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (!hasAnalyticsConsent()) return;
  try { track(name, properties); } catch { /* Measurement must not break a user action. */ }
}

function once(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (!hasAnalyticsConsent()) return;
  try {
    const key = `opencard_analytics_${name}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, String(Date.now()));
    trackEvent(name, properties);
  } catch { /* No durable storage: skip cohort milestones. */ }
}

export function trackCardAdded(cardId: string) {
  trackEvent("card_added", { card_id: cardId });
  once("first_card_added");
}

export function trackBenefitUsed(kind: "credit" | "free_night") {
  trackEvent("benefit_used", { kind });
  once("first_benefit_used", { kind });
}

export function trackCreditsViewed(cardCount: number) {
  trackEvent("credits_viewed", { card_count: cardCount });
}

export function trackMyCardsFirstVisit() {
  if (!hasAnalyticsConsent()) return;
  trackEvent("my_cards_viewed");
  try {
    const key = "opencard_analytics_my_cards_cohort";
    const now = Date.now();
    const saved = localStorage.getItem(key);
    if (!saved) {
      localStorage.setItem(key, String(now));
      trackEvent("my_cards_cohort_started");
      return;
    }
    const elapsedDays = (now - Number(saved)) / 86400000;
    // Exact elapsed-day windows, not visits 'within the last week'.
    if (elapsedDays >= 7 && elapsedDays < 8) once("my_cards_day7_return");
    if (elapsedDays >= 30 && elapsedDays < 31) once("my_cards_day30_return");
  } catch { /* Storage unavailable: view still measured with consent. */ }
}
