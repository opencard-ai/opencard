/**
 * Short hand-written editor's notes for high-visibility card pages.
 * Each note was checked against the card record and the issuer's official
 * page on 2026-10-18. Keep notes factual; avoid temporary offer amounts
 * unless the record carries them.
 */
export type EditorNote = { note: string; reviewed: string };

const NOTES: Record<string, EditorNote> = {
  "amex-biz-platinum": {
    reviewed: "2026-10-18",
    note: "The as-high-as welcome offer is the headline, but it requires $20,000 in purchases in three months — a pace only real business spending supports. The 5x rates apply to flights and prepaid hotels booked on AmexTravel.com, and everyday business spending earns 2x only in key business categories or on purchases of $5,000 or more. After year one, the $895 fee rests on credits such as the semiannual hotel credit and the quarterly Indeed credit, which only count if your business already spends there.",
  },
  "amex-platinum": {
    reviewed: "2026-10-18",
    note: "Most of the credits in our record are tied to specific merchants, and several reset monthly (Uber Cash, Walmart+, digital entertainment) or quarterly (Resy, lululemon), so unused periods are simply lost. Treat the $895 fee as the price of airport lounge access — Centurion Lounges and Priority Pass — and value a credit only if you were already that merchant's customer. Outside flights and prepaid hotels, it earns 1x.",
  },
  "amex-gold": {
    reviewed: "2026-10-18",
    note: "Correction: our record previously listed airport lounge access and hotel elite status for this card. The official Amex page shows neither, so we removed them. The Gold's case rests on 4x at restaurants (up to $50,000 a year) and US supermarkets (up to $25,000 a year), plus monthly Uber Cash, Dunkin', and dining credits. If you won't use the monthly credits, judge the $325 fee on the 4x categories alone.",
  },
  "chase-sapphire-preferred": {
    reviewed: "2026-10-18",
    note: "With a 1x base rate, the Preferred earns most of its value in its 3x categories — dining, gas and EV charging, streaming, and online groceries — and 5x on Chase Travel. The $100 hotel credit only applies to hotel stays booked through Chase Travel, so count it only if you'd book there anyway. Correction: our record previously showed Priority Pass for this card; the official Chase page lists no lounge benefit, so we removed it.",
  },
  "chase-sapphire-reserve": {
    reviewed: "2026-10-18",
    note: "At $795, the Reserve's math leans on the $300 Chase Travel credit and the 8x rate on Chase Travel and The Edit. Most of the other credits — The Edit hotel credit, Exclusive Tables dining, StubHub — are semiannual or monthly and tied to specific merchants. Compare it with the Preferred, not with having no card: the $700 fee difference has to be covered by benefits you'd really use, such as Priority Pass and Sapphire Lounge access.",
  },
  "capital-one-venture-x": {
    reviewed: "2026-10-18",
    note: "The $395 fee is largely offset by the $300 annual Capital One Travel credit — but only if you book through Capital One Travel. Correction: our record previously showed 1x on general purchases; the official Capital One page says 2x miles on every purchase, and we've updated it. That flat 2x, plus Priority Pass and Capital One Lounge access, is what separates it from cheaper travel cards.",
  },
  "citi-strata-elite": {
    reviewed: "2026-10-18",
    note: "Correction: we rebuilt this card's earning table from the official Citi page — 12x on hotels, car rentals, and attractions and 6x on air booked through cititravel.com, 6x at restaurants on Citi Nights (Friday and Saturday, 6 p.m. to 6 a.m. ET), 3x at restaurants otherwise, and 1.5x on everything else. We also added Priority Pass Select and four Admirals Club passes a year. The $595 fee still depends on using the hotel, Splurge, and Blacklane credits.",
  },
  "barclays-old-navy-navyist-rewards-mastercard": {
    reviewed: "2026-10-18",
    note: "This is the Old Navy Encore Mastercard. Its value is concentrated at Old Navy and Gap Inc. brands (5 points per $1) and other eligible apparel retailers (3 points per $1); everything else earns 1 point. The welcome offer is 30% off a first Old Navy purchase rather than a cash bonus, so it suits regular Old Navy and Gap shoppers better than it works as a primary card.",
  },
  "boa-student-customized-cash-rewards": {
    reviewed: "2026-10-18",
    note: "The 6% rate is a first-year figure (3% plus a 3% first-year boost) on one category you choose, and it shares a $2,500 quarterly cap with grocery-store and wholesale-club purchases. Correction: our record listed 3% at grocery stores, but its own terms note says 2%, so we use 2%. The $200 bonus needs $1,000 in purchases in the first 90 days — a modest threshold, but not a reason to spend more than you planned.",
  },
  "us-bank-cash-plus": {
    reviewed: "2026-10-18",
    note: "Cash+ pays 5% only after you choose and activate two categories each quarter, and only on the first $2,000 of combined purchases in those categories per quarter. Pick categories where you already have steady bills — the list includes home utilities and cell phone service — and use a different card once you hit the cap. The 2% everyday category is also your choice.",
  },
};

export function getEditorNote(cardId: string): EditorNote | undefined {
  return NOTES[cardId];
}

export const EDITOR_NOTE_CARD_IDS = Object.keys(NOTES);
