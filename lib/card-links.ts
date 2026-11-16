/**
 * Hand-verified on issuer pages. Kept out of data/cards/*.json on purpose:
 * that JSON is promoted from the Upstash fact store and would be overwritten.
 * Never put affiliate/referral/tracking URLs here; omit any URL you could not verify.
 */
export type CardLinks = {
  applyUrl?: string;
  loginUrl?: string;
  payUrl?: string;
  phone?: string;
  feeNotes?: string[];
  source: string;
  verified: string;
};

const LINKS: Record<string, CardLinks> = {
  "comenity-ulta-beauty-mastercard": {
    applyUrl: "https://www.ulta.com/rewards/credit-card",
    loginUrl: "https://d.comenity.net/ac/ultabeautyrewardscreditcard/public/home",
    phone: "1-866-257-9195",
    source: "https://www.ulta.com/rewards/credit-card (says you can pay your bill online and lists Comenity Capital Bank's number); Comenity account site",
    verified: "2026-11-16",
  },
  "capital-one-spark-cash-plus": {
    applyUrl: "https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/",
    loginUrl: "https://verified.capitalone.com/auth/signin",
    feeNotes: ["$150 annual fee, refunded every year you spend at least $150,000.", "Charge card: pay at least the minimum by the due date, otherwise Capital One charges a 2.99% late fee."],
    source: "https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/",
    verified: "2026-11-16",
  },
  "capital-one-spark-cash": {
    applyUrl: "https://www.capitalone.com/small-business/credit-cards/spark-cash/",
    loginUrl: "https://verified.capitalone.com/auth/signin",
    feeNotes: ["$0 intro annual fee for the first year, then $95."],
    source: "https://www.capitalone.com/small-business/credit-cards/spark-cash/",
    verified: "2026-11-16",
  },
  "capital-one-quicksilver": {
    applyUrl: "https://www.capitalone.com/credit-cards/quicksilver/",
    loginUrl: "https://verified.capitalone.com/auth/signin",
    source: "https://www.capitalone.com/credit-cards/quicksilver/",
    verified: "2026-11-16",
  },
  "wells-fargo-one-key-plus": {
    loginUrl: "https://connect.secure.wellsfargo.com/auth/login/present",
    source: "https://creditcards.wellsfargo.com/ (the One Key+ product page now redirects here; sign-on link from Wells Fargo's site)",
    verified: "2026-11-16",
  },
  "chase-ink-biz-cash": {
    applyUrl: "https://creditcards.chase.com/business-credit-cards/ink/cash",
    loginUrl: "https://www.chase.com/personal/mobile-online-banking/make-payment",
    source: "Chase product page + Chase 'Make a Payment' page",
    verified: "2026-11-16",
  },
  "chase-ink-biz-unlimited": {
    applyUrl: "https://creditcards.chase.com/business-credit-cards/ink/unlimited",
    loginUrl: "https://www.chase.com/personal/mobile-online-banking/make-payment",
    source: "Chase product page + Chase 'Make a Payment' page",
    verified: "2026-11-16",
  },
  "southwest-rapid-rewards-premier": {
    applyUrl: "https://creditcards.chase.com/travel-credit-cards/southwest/premier",
    loginUrl: "https://www.chase.com/personal/mobile-online-banking/make-payment",
    source: "Chase product page + Chase 'Make a Payment' page",
    verified: "2026-11-16",
  },
  "barclays-banana-republic-rewards-mastercard": {
    applyUrl: "https://cards.barclaycardus.com/banking/cards/banana-republic-encore-mastercard/",
    loginUrl: "https://cards.barclaycardus.com/",
    source: "Barclays US product page + Barclays US home (Log in)",
    verified: "2026-11-16",
  },
  "barclays-old-navy-navyist-rewards-mastercard": {
    applyUrl: "https://cards.barclaycardus.com/banking/cards/old-navy-encore-mastercard/",
    loginUrl: "https://cards.barclaycardus.com/",
    source: "Barclays US product page + Barclays US home (Log in)",
    verified: "2026-11-16",
  },
  "barclays-gap-good-rewards-mastercard": {
    applyUrl: "https://cards.barclaycardus.com/banking/cards/gap-encore-mastercard/",
    loginUrl: "https://cards.barclaycardus.com/",
    source: "Barclays US product page + Barclays US home (Log in)",
    verified: "2026-11-16",
  },
  "barclays-athleta-rewards-mastercard": {
    applyUrl: "https://cards.barclaycardus.com/banking/cards/athleta-encore-mastercard/",
    loginUrl: "https://cards.barclaycardus.com/",
    source: "Barclays US product page + Barclays US home (Log in)",
    verified: "2026-11-16",
  },
  "discover-it-miles": {
    applyUrl: "https://www.discover.com/credit-cards/travel/",
    loginUrl: "https://www.discover.com/login/",
    source: "Discover it Miles product page + Discover login page",
    verified: "2026-11-16",
  },
  "amex-marriott-bevy": {
    applyUrl: "https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-bevy/",
    source: "American Express product page",
    verified: "2026-11-16",
  },
};

export function getCardLinks(cardId: string): CardLinks | undefined {
  return Object.hasOwn(LINKS, cardId) ? LINKS[cardId] : undefined;
}

export const CARD_LINK_IDS: string[] = Object.keys(LINKS);
