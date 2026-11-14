import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatVariableOffer,
  formatVariableOfferMax,
  formatWelcomeBonus,
  isVariableOffer,
  welcomeBonusKind,
  welcomeBonusPoints,
  welcomeBonusDollarFallback,
} from "../lib/welcome-offer";
import { t, locales } from "../lib/i18n";
import { buildCardAnalysis } from "../lib/card-analysis";
import type { CreditCard, WelcomeOffer } from "../lib/cards";

const delta: WelcomeOffer = {
  bonus_points: 0,
  bonus_value: "Varies",
  offer_status: "as_high_as_ymmv",
  spending_requirement: 6000,
  time_period_months: 6,
  point_program: "Delta SkyMiles",
};

test("isVariableOffer detects as-high-as offers", () => {
  assert.equal(isVariableOffer(delta), true);
  assert.equal(isVariableOffer({ offer_status: "as_high_as_ymmv" }), true);
  assert.equal(isVariableOffer({ bonus_value: "Varies" }), true);
  assert.equal(isVariableOffer({ bonus_value: " varies " }), true);
  assert.equal(isVariableOffer({ bonus_value: "$750" }), false);
  assert.equal(isVariableOffer({ offer_status: "public" }), false);
  assert.equal(isVariableOffer(undefined), false);
  assert.equal(isVariableOffer(null), false);
});

test("variable offers keep sorting and scoring as 0", () => {
  assert.equal(welcomeBonusKind(delta), "none");
  assert.equal(formatWelcomeBonus(delta), null);
  assert.equal(welcomeBonusPoints(delta), 0);
  assert.equal(welcomeBonusDollarFallback(delta), 0);
  assert.equal(welcomeBonusPoints({ ...delta, bonus_points_max: 85000 }), 0);
  assert.equal(welcomeBonusDollarFallback({ ...delta, bonus_points_max: 85000 }), 0);
});

test("formatVariableOfferMax follows the points/cash rules", () => {
  assert.equal(formatVariableOfferMax(delta), null);
  assert.equal(formatVariableOfferMax({ ...delta, bonus_points_max: 0 }), null);
  assert.equal(formatVariableOfferMax({ ...delta, bonus_points_max: 85000 }), "85,000 pts");
  assert.equal(formatVariableOfferMax({ ...delta, bonus_points_max: 85000 }, "zh", "點"), "85,000 點");
  // Under 1,000 is a dollar amount.
  assert.equal(formatVariableOfferMax({ ...delta, bonus_points_max: 200 }), "$200");
  // Cash-style program is a dollar amount.
  assert.equal(formatVariableOfferMax({ ...delta, point_program: "Cash Back", bonus_points_max: 1500 }), "$1,500");
  // Explicit bonus_type wins.
  assert.equal(formatVariableOfferMax({ ...delta, bonus_type: "cash", bonus_points_max: 2000 }), "$2,000");
  assert.equal(formatVariableOfferMax({ ...delta, bonus_type: "points", bonus_points_max: 500 }), "500 pts");
});

test("formatVariableOffer labels in every locale", () => {
  assert.equal(formatVariableOffer(delta), "Varies by applicant, see issuer offer");
  assert.equal(formatVariableOffer({ ...delta, bonus_points_max: 85000 }), "As high as 85,000 pts · varies by applicant");
  assert.equal(formatVariableOffer({ ...delta, bonus_points_max: 85000 }, "zh"), "最高 85,000 點・因人而異");
  assert.equal(formatVariableOffer({ ...delta, bonus_points_max: 200 }, "es"), "Hasta $200 · varía según el solicitante");
  assert.equal(formatVariableOffer(delta, "zh"), "因人而異，請見發卡銀行官方優惠");
  assert.equal(formatVariableOffer(delta, "zh-cn"), "因人而异，请见发卡银行官方优惠");
  assert.equal(formatVariableOffer(delta, "xx"), "Varies by applicant, see issuer offer");
  assert.equal(formatVariableOffer({ bonus_points: 0 }), null);
  assert.equal(formatVariableOffer(undefined), null);
  for (const l of locales) {
    for (const key of ["detail.offerAsHighAs", "detail.offerVaries"]) {
      assert.notEqual(t(key, l), key, `${key} missing for ${l}`);
    }
    const label = formatVariableOffer(delta, l)!;
    assert.ok(label && !/no welcome|無開卡禮|无开卡奖励|sin oferta/i.test(label), `${l}: ${label}`);
  }
});

test("Delta business cards on main render as variable offers", () => {
  for (const id of ["amex-delta-gold-biz", "amex-delta-skymiles-platinum-biz", "amex-delta-skymiles-reserve-biz"]) {
    const card = JSON.parse(readFileSync(new URL(`../data/cards/${id}.json`, import.meta.url), "utf8")) as CreditCard;
    const w = card.welcome_offer!;
    if (welcomeBonusKind(w) !== "none") continue; // data later moved to a fixed amount
    assert.equal(isVariableOffer(w), true, id);
    const label = formatVariableOffer(w, "en")!;
    assert.match(label, /varies by applicant/i, id);
    const analysis = buildCardAnalysis(card, [card]);
    assert.equal(analysis.estimate.welcomeVaries, true, id);
    assert.equal(analysis.estimate.welcomeValue, 0, id);
    const text = [analysis.estimate.welcomeNote, ...analysis.faq.map((f) => f.answer)].join("\n");
    assert.doesNotMatch(text, /No welcome bonus is listed/, id);
    assert.doesNotMatch(text, /welcome bonus valued at \$0/, id);
  }
});
