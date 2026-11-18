import test from "node:test";
import assert from "node:assert/strict";
import { getCardById } from "../lib/cards";
import { cardSeoMeta } from "../lib/card-seo";
import { locales } from "../lib/i18n";

const ids = ["amex-amazon-biz", "amex-amazon-biz-prime", "synchrony-sears-mastercard"];
test("transferred snippets describe product history without fees, rates, or application wording in every locale", () => {
  for (const id of ids) {
    const card = getCardById(id)!;
    assert.equal(card.status, "transferred");
    for (const locale of locales) {
      const seo = cardSeoMeta(card, locale);
      const text = `${seo.title} ${seo.description}`;
      assert.doesNotMatch(text, /up to|annual fee|cuota anual|年費|年费|\d%|\$|apply|solicita/i);
      assert.match(seo.title, /OpenCard$/);
      if (id === "synchrony-sears-mastercard") {
        assert.match(text, /Citi ThankYou Mastercard/);
        assert.match(text, /2025-04-12/);
        assert.match(seo.title, /Renamed|更名|Renombrada/);
      } else {
        assert.match(text, /U\.S\. Bank/);
        assert.match(text, /2026-08-14/);
        assert.match(seo.title, /Transferred|已轉由|已转由|Transferida/);
        assert.match(seo.description, /American Express/);
      }
    }
  }
});

test("unknown transferred cards use localized closed-to-new-applicants fallback", () => {
  const card = { ...getCardById(ids[0])!, card_id: "future-transfer" };
  for (const locale of locales) {
    const seo = cardSeoMeta(card, locale, false);
    assert.doesNotMatch(`${seo.title} ${seo.description}`, /up to|annual fee|cuota anual|年費|年费|\d%|\$/i);
    assert.match(seo.title, /Closed to new applicants|停止受理新申請|停止受理新申请|Cerrada a nuevas solicitudes/i);
  }
});
