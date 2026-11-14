import test from "node:test";
import assert from "node:assert/strict";
import { getCardById, type CreditCard } from "../lib/cards";
import {
  getReferralOfferForCard,
  isCardOpenForReferral,
  REFERRAL_EXCLUDED_CARD_IDS,
} from "../lib/referrals";

const AMEX_PLATINUM_REFERRAL_URL =
  "https://americanexpress.com/en-us/referral/platinum-card?ref=KOCHECwBoT&xl=cp15";
const AMEX_PLATINUM_TERMS_URL =
  "https://www.americanexpress.com/en-US/referral/terms/MGM/DEFAULT/137?offer=A0000HXJ0A&iacode=2X&mgmeeProductId=137&mgmeeOfferId=d17ef7a4-20f4-4bed-b8aa-e266f90c9ef6&mgmeeIacode=2X";

function stub(partial: Pick<CreditCard, "card_id" | "issuer"> & Partial<CreditCard>): CreditCard {
  return partial as CreditCard;
}

const expectedAmex = {
  program: "amex" as const,
  issuer: "American Express",
  referralUrl: AMEX_PLATINUM_REFERRAL_URL,
  termsUrl: AMEX_PLATINUM_TERMS_URL,
};

test("transferred cards return no referral", () => {
  const amazonBiz = getCardById("amex-amazon-biz");
  const amazonPrime = getCardById("amex-amazon-biz-prime");
  assert.ok(amazonBiz && amazonPrime);
  assert.equal(amazonBiz.status, "transferred");
  assert.equal(amazonPrime.status, "transferred");
  assert.equal(getReferralOfferForCard(amazonBiz), null);
  assert.equal(getReferralOfferForCard(amazonPrime), null);
  assert.equal(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-transferred", issuer: "American Express", status: "transferred" })),
    null,
  );
});

test("Morgan Stanley card ids return no referral", () => {
  assert.deepEqual(
    [...REFERRAL_EXCLUDED_CARD_IDS].sort(),
    ["amex-morgan-stanley-blue", "amex-morgan-stanley-platinum"],
  );
  for (const id of REFERRAL_EXCLUDED_CARD_IDS) {
    const live = getCardById(id);
    assert.ok(live, id);
    assert.equal(getReferralOfferForCard(live), null, id);
    // Exclusion holds even if the record looks like a normal open Amex card.
    assert.equal(
      getReferralOfferForCard(stub({ card_id: id, issuer: "American Express", status: "active" })),
      null,
      `${id} active stub`,
    );
  }
});

test("discontinued cards still return no referral", () => {
  const live = getCardById("amex-everyday-preferred");
  assert.ok(live);
  assert.equal(live.status, "discontinued");
  assert.equal(getReferralOfferForCard(live), null);
  assert.equal(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-discontinued", issuer: "American Express", status: "discontinued" })),
    null,
  );
  assert.equal(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-legacy-flag", issuer: "American Express", discontinued: true })),
    null,
  );
});

test("cards not open for application (invitation_only or unknown closed status) return no referral", () => {
  assert.equal(isCardOpenForReferral({ status: "invitation_only" }), false);
  assert.equal(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-invite", issuer: "American Express", status: "invitation_only" })),
    null,
  );
  assert.equal(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-unknown", issuer: "American Express", status: "waitlist" })),
    null,
  );
});

test("a normal Amex card still gets the same Platinum referral", () => {
  const gold = getCardById("amex-gold");
  const plat = getCardById("amex-platinum");
  assert.ok(gold && plat);
  assert.deepEqual(getReferralOfferForCard(gold), expectedAmex);
  assert.deepEqual(getReferralOfferForCard(plat), expectedAmex);
  assert.deepEqual(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-open", issuer: "American Express" })),
    expectedAmex,
  );
  assert.deepEqual(
    getReferralOfferForCard(stub({ card_id: "amex-fixture-active", issuer: "American Express", status: "active" })),
    expectedAmex,
  );
});

test("non-Amex referral behavior is unchanged", () => {
  const freedom = getCardById("chase-freedom-unlimited");
  const boundless = getCardById("chase-marriott-boundless");
  const sapphire = getCardById("chase-sapphire-preferred");
  const bilt = getCardById("bilt-blue");
  const venture = getCardById("capital-one-venture-x");
  const sears = getCardById("synchrony-sears-mastercard");
  assert.ok(freedom && boundless && sapphire && bilt && venture && sears);

  assert.deepEqual(getReferralOfferForCard(freedom), {
    program: "chase-freedom",
    issuer: "Chase",
    referralUrl: "https://www.referyourchasecard.com/18a/Q4HFPQL1O3",
  });
  assert.deepEqual(getReferralOfferForCard(boundless), {
    program: "chase-marriott",
    issuer: "Chase",
    referralUrl: "https://www.referyourchasecard.com/252w/1SMM8AZUBD",
  });
  assert.deepEqual(getReferralOfferForCard(sapphire), {
    program: "chase-sapphire",
    issuer: "Chase",
    referralUrl: "https://www.referyourchasecard.com/19y/25IOS0TVN4",
  });
  assert.deepEqual(getReferralOfferForCard(bilt), {
    program: "bilt",
    issuer: "Bilt",
    referralUrl: "https://www.bilt.com/card?invite=VDUW7X53",
    termsUrl: "https://www.bilt.com/terms/bilt-card-offer-terms",
  });
  assert.equal(getReferralOfferForCard(venture), null);
  assert.equal(sears.status, "transferred");
  assert.equal(getReferralOfferForCard(sears), null);
});
