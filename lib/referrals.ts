import type { CreditCard } from "@/lib/cards";

export interface ReferralOffer {
  issuer: string;
  referralUrl: string;
  termsUrl: string;
}

const AMEX_REFERRAL: ReferralOffer = {
  issuer: "American Express",
  referralUrl: "https://americanexpress.com/en-us/referral/platinum-card?ref=KOCHECwBoT&xl=cp15",
  termsUrl: "https://www.americanexpress.com/en-US/referral/terms/MGM/DEFAULT/137?offer=A0000HXJ0A&iacode=2X&mgmeeProductId=137&mgmeeOfferId=d17ef7a4-20f4-4bed-b8aa-e266f90c9ef6&mgmeeIacode=2X",
};

export function getReferralOfferForCard(card: CreditCard): ReferralOffer | null {
  if (card.issuer !== AMEX_REFERRAL.issuer || card.status === "discontinued") return null;
  return AMEX_REFERRAL;
}
