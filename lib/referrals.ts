import type { CreditCard } from "@/lib/cards";

export interface ReferralOffer {
  program: "amex" | "chase-freedom" | "chase-marriott";
  issuer: string;
  referralUrl: string;
  termsUrl?: string;
}

const AMEX_REFERRAL: ReferralOffer = {
  program: "amex",
  issuer: "American Express",
  referralUrl: "https://americanexpress.com/en-us/referral/platinum-card?ref=KOCHECwBoT&xl=cp15",
  termsUrl: "https://www.americanexpress.com/en-US/referral/terms/MGM/DEFAULT/137?offer=A0000HXJ0A&iacode=2X&mgmeeProductId=137&mgmeeOfferId=d17ef7a4-20f4-4bed-b8aa-e266f90c9ef6&mgmeeIacode=2X",
};

const CHASE_FREEDOM_REFERRAL: ReferralOffer = {
  program: "chase-freedom",
  issuer: "Chase",
  referralUrl: "https://www.referyourchasecard.com/18a/Q4HFPQL1O3",
};

const CHASE_MARRIOTT_REFERRAL: ReferralOffer = {
  program: "chase-marriott",
  issuer: "Chase",
  referralUrl: "https://www.referyourchasecard.com/252w/1SMM8AZUBD",
};

const CHASE_FREEDOM_CARD_IDS = new Set([
  "chase-freedom-unlimited",
  "chase-freedom-flex",
]);

const CHASE_MARRIOTT_CARD_IDS = new Set([
  "chase-marriott-boundless",
  "marriott-bonvoy-bold",
  "marriott-bonvoy-bountiful",
]);

export function getReferralOfferForCard(card: CreditCard): ReferralOffer | null {
  if (card.status === "discontinued") return null;
  if (card.issuer === AMEX_REFERRAL.issuer) return AMEX_REFERRAL;
  if (CHASE_FREEDOM_CARD_IDS.has(card.card_id)) return CHASE_FREEDOM_REFERRAL;
  if (CHASE_MARRIOTT_CARD_IDS.has(card.card_id)) return CHASE_MARRIOTT_REFERRAL;
  return null;
}
