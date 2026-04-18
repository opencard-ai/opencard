"use client";

import { track } from "@vercel/analytics";

export function trackCardAdded(cardId: string) {
  track("card_added", { card_id: cardId });
}

export function trackCreditsViewed(cardCount: number) {
  track("credits_viewed", { card_count: cardCount });
}

export function trackMyCardsFirstVisit() {
  // Check if this is a returning visitor (visited My Cards in last 7 days)
  const lastVisit = localStorage.getItem("opencard_my_cards_last_visit");
  const now = Date.now();
  const isReturning = lastVisit ? now - parseInt(lastVisit) < 7 * 24 * 60 * 60 * 1000 : false;
  localStorage.setItem("opencard_my_cards_last_visit", now.toString());
  track("my_cards_viewed", { returning: isReturning });
}
