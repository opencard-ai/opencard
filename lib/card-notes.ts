/**
 * Short hand-written editor's notes for high-visibility card pages.
 * Each note was checked against the card record and the issuer's official
 * page on 2026-10-18 (first ten) or 2026-10-19 (the rest). Keep notes factual; avoid temporary offer amounts
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
    reviewed: "2026-10-19",
    note: "This is the Old Navy Encore Mastercard. Barclays' \"5X\" means 25 points per $1 at Old Navy and other Gap Inc. brands (5x the 5 points non-cardholders earn), 15 points per $1 at other eligible apparel stores and 5 points per $1 elsewhere. At 500 points per $1 reward that works out to about 5%, 3% and 1%, but rewards can only be spent at Gap Inc. brands or in the Encore Market. The welcome offer is 30% off a first Old Navy purchase rather than a cash bonus, so it suits regular Gap Inc. shoppers better than it works as a primary card.",
  },
  "boa-student-customized-cash-rewards": {
    reviewed: "2026-10-19",
    note: "The 6% rate is a first-year figure (3% plus a 3% first-year boost) on one category you choose, and it shares a $2,500 quarterly cap with grocery-store and wholesale-club purchases. The $200 bonus needs $1,000 in purchases in the first 90 days — a modest threshold, but not a reason to spend more than you planned.",
  },
  "us-bank-cash-plus": {
    reviewed: "2026-10-18",
    note: "Cash+ pays 5% only after you choose and activate two categories each quarter, and only on the first $2,000 of combined purchases in those categories per quarter. Pick categories where you already have steady bills — the list includes home utilities and cell phone service — and use a different card once you hit the cap. The 2% everyday category is also your choice.",
  },
  "boa-customized-cash-rewards": {
    reviewed: "2026-10-19",
    note: "The 6% rate is first-year only (3% after that) on one category you choose, and it shares a $2,500 quarterly cap with the 2% grocery-store and wholesale-club rate — so heavy grocery spending eats into your 3% room. The category defaults to gas and EV charging, and you can change it once a calendar month, so set it on day one.",
  },
  "spirit-airlines-mastercard": {
    reviewed: "2026-10-19",
    note: "Don't apply for this card. Spirit Airlines stopped flying in May 2026, and Bank of America's page for this card was no longer available when we checked. The miles, companion and fee figures in our record describe the old product and no longer apply. If you already hold it, watch for mail from Bank of America about what your account becomes, and check any autopays or saved card numbers before the account changes.",
  },
  "barclays-banana-republic-rewards-mastercard": {
    reviewed: "2026-10-19",
    note: "This is the Banana Republic Encore Mastercard. It earns 25 points per $1 at Gap Inc. brands, 15 at other eligible apparel stores and 5 elsewhere (Barclays calls these 5X, 3X and 1X). With 500 points per $1 reward, that is about 5%, 3% and 1% back, redeemable only at Gap Inc. brands or in the Encore Market. The welcome offer is 20% off your first purchase at Banana Republic with the new card, not a cash bonus. The 33.49% variable purchase APR makes carrying a balance expensive.",
  },
  "chase-united-explorer": {
    reviewed: "2026-10-19",
    note: "The Explorer earns its $150 fee (waived in year one) mainly through the free first checked bag for you and one companion on your reservation — but only when the ticket is bought with the card. Two United Club passes a year and the long list of credits (United Hotels, rideshare, Avis/Budget, Instacart, JSX) add value only if you already use those merchants. Skip it if you fly United less than twice a year; the 1x rate on everyday spending is weak.",
  },
  "chase-ink-biz-unlimited": {
    reviewed: "2026-10-19",
    note: "A flat 1.5% on everything with no annual fee and no cap, which beats 2%-up-to-$50,000 cards only once you spend about $100,000 a year. The bonus is large but needs $6,000 in three months, and Chase says it may not be available if you've had this or another no-fee Chase business card. Points are most useful paired with a Chase card that can transfer them.",
  },
  "amex-delta-reserve": {
    reviewed: "2026-10-19",
    note: "At $650, the Reserve is a Sky Club card: 15 visits per Medallion year, unlimited after $75,000 in annual spending. The yearly Companion Certificate (after renewal, taxes and fees of $22 to $250 extra) and the MQD Headstart help Medallion chasers. The Resy, rideshare and Delta Stays credits are monthly or booking-specific, so count only the ones you'd use. If you don't fly Delta out of a Sky Club airport several times a year, the Gold or Platinum version costs far less.",
  },
  "amex-blue-biz-cash": {
    reviewed: "2026-10-19",
    note: "2% cash back on the first $50,000 of purchases each calendar year, then 1%, credited to your statement automatically — no redemption to manage. That beats a flat 1.5% card until about $100,000 a year in spending; above that, a no-cap card wins. The cap resets on January 1, not your card anniversary. There's a 2.7% foreign transaction fee, so keep overseas supplier payments on another card. Rental car coverage is secondary and excludes Australia, Italy and New Zealand.",
  },
  "us-bank-harley-davidson": {
    reviewed: "2026-10-19",
    note: "A niche card for Harley riders: 3x at Harley-Davidson and gas stations, 2x at restaurants, bars and lodging booked directly, plus a point per mile ridden for H.O.G. members (up to 50,000 a year). Points expire after three years, so redeem regularly. The 5% foreign transaction fee makes it a poor choice for rides abroad, and outside the Harley ecosystem a no-fee 2% card will beat it. The 0% intro APR runs nine billing cycles.",
  },
  "pnc-cash-rewards-visa": {
    reviewed: "2026-10-19",
    note: "The 4% gas, 3% dining and 2% grocery rates share one $8,000 annual cap, after which everything earns 1% — roughly $667 a month of combined gas, dining and grocery spending before the bonus runs out. It's best for PNC customers with moderate spending, or someone using the 15-month 0% balance transfer offer (transfers must be made within 90 days). The current bonus is $250 after $1,000 in purchases in three months. Rewards don't expire.",
  },
  "amex-delta-gold-biz": {
    reviewed: "2026-10-19",
    note: "No fee in year one, then $150. The main value is free first and second checked bags on domestic Delta flights and the $200 Delta flight credit after $10,000 in a calendar year. 2x at restaurants, U.S. shipping and U.S. advertising is fine but capped. There's no lounge access. If your business doesn't fly Delta at least a couple of times a year with checked bags, a 2% flat card will earn more.",
  },
  "amex-delta-skymiles-reserve-biz": {
    reviewed: "2026-10-19",
    note: "The $650 business Reserve mirrors the personal card: 15 Sky Club visits per Medallion year (unlimited after $75,000), a Companion Certificate after renewal, and MQD Headstart and Boost for status. Its business twist is 1.5x on transit, U.S. shipping and office supply, and 1.5x on everything after $150,000 a year. The welcome offer needs very high spending in six months. Worth it only if Sky Club access and Medallion status matter to how you travel for work.",
  },
  "chase-southwest-premier-biz": {
    reviewed: "2026-10-19",
    note: "For a $149 fee you get 6,000 anniversary points, a first checked bag free for you and up to eight companions on your reservation, and Group 5 boarding. 2x at gas stations and restaurants only applies to the first $8,000 combined each anniversary year. Employee cards don't get the free-bag benefit, so it fits owners who fly Southwest themselves.",
  },
  "amex-marriott-bonvoy-biz": {
    reviewed: "2026-10-19",
    note: "The yearly Free Night Award (up to 35,000 points, after renewal) roughly covers the fee if you'd book that stay anyway; a second one comes after $60,000 in a calendar year. You also get automatic Gold Elite status, 15 Elite Night Credits (stackable with one personal Marriott card) and a 7% discount on eligible standard rates. The 4x categories — restaurants worldwide plus U.S. gas, wireless and shipping — help a little, but 2x elsewhere is ordinary.",
  },
  "wells-fargo-one-key": {
    reviewed: "2026-10-19",
    note: "Rewards come as OneKeyCash, usable only on Expedia, Hotels.com and Vrbo — so this suits people who already book there. You earn 3% on those sites and at gas stations, grocery stores and restaurants, and 1.5% on everything else. The welcome offer is $250 OneKeyCash after $2,000 in three months, and the card is a Mastercard with cell phone protection, primary rental car coverage and trip cancellation coverage. No annual fee and no foreign transaction fee.",
  },
  "amex-blue-cash-preferred": {
    reviewed: "2026-10-19",
    note: "6% at U.S. supermarkets (on up to $6,000 a year) and on select U.S. streaming is the reason to pay the $95 fee, which is waived in year one. Against a no-fee card paying 3% at supermarkets, the extra 3% covers the fee at about $3,200 a year in grocery spending. The one statement credit is the Disney Streaming Credit: $10 a month ($120 a year) at Disney+, Hulu or ESPN, with enrollment. Rewards come as Reward Dollars, and there's a 2.7% foreign transaction fee.",
  },
};

export function getEditorNote(cardId: string): EditorNote | undefined {
  return NOTES[cardId];
}

export const EDITOR_NOTE_CARD_IDS = Object.keys(NOTES);
