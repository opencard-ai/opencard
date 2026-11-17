import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import CompareTable from "../app/components/CompareTable";
import { getAllCards } from "../lib/cards";
import { normalizeOtherBenefit, normalizeOtherBenefits } from "../lib/other-benefits";

test("normalizes strings, named objects, legacy benefit objects and description-only objects", () => {
  assert.deepEqual(normalizeOtherBenefit(" Free checked bag. Terms apply. "), { description: "Free checked bag. Terms apply." });
  assert.deepEqual(normalizeOtherBenefit({ name: " Bag ", description: " Free bag. " }), { name: "Bag", description: "Free bag." });
  assert.deepEqual(normalizeOtherBenefit({ benefit: "Bag", description: "Free bag." }), { name: "Bag", description: "Free bag." });
  assert.deepEqual(normalizeOtherBenefit({ description: "Free bag." }), { description: "Free bag." });
  assert.deepEqual(normalizeOtherBenefit({ name: "Bag" }), { name: "Bag", description: "" });
  assert.deepEqual(normalizeOtherBenefit({ benefit: "Bag" }), { name: "Bag", description: "" });
  assert.deepEqual(normalizeOtherBenefit({ name: "Bag", benefit: "Legacy", description: "Free bag." }), { name: "Bag", description: "Free bag." });
  assert.deepEqual(normalizeOtherBenefit({ name: " ", benefit: "Bag" }), { name: "Bag", description: "" });
});

test("skips null and empty entries, handles absent lists, preserves order and leaves input unchanged", () => {
  for (const value of [null, "", "  ", {}, { name: " ", benefit: "", description: " " }]) {
    assert.equal(normalizeOtherBenefit(value), null);
  }
  assert.deepEqual(normalizeOtherBenefits(undefined), []);
  assert.deepEqual(normalizeOtherBenefits(null), []);
  assert.deepEqual(normalizeOtherBenefits([]), []);
  const named = Object.freeze({ name: " Bag ", description: " Free bag. " });
  const values = Object.freeze([null, " First ", named, ""]);
  assert.deepEqual(normalizeOtherBenefits(values), [{ description: "First" }, { name: "Bag", description: "Free bag." }]);
  assert.equal(named.name, " Bag ");
  assert.equal(named.description, " Free bag. ");
});

const cards = getAllCards();

test("other benefits normalize safely for every card in the catalog", () => {
  assert.ok(cards.length > 0);
  for (const card of cards) {
    assert.doesNotThrow(() => {
      for (const benefit of normalizeOtherBenefits(card.travel_benefits?.other_benefits)) {
        assert.equal(typeof benefit.description, "string", card.card_id);
        assert.ok(benefit.name || benefit.description, card.card_id);
      }
    }, card.card_id);
  }
});

test("CompareTable renders every card paired with Chase Sapphire Preferred", () => {
  const preferred = cards.find((card) => card.card_id === "chase-sapphire-preferred");
  assert.ok(preferred);
  for (const card of cards) {
    assert.doesNotThrow(() => {
      const html = renderToString(createElement(CompareTable, { cards: [preferred, card], lang: "en" }));
      assert.ok(html.includes("<table"), card.card_id);
    }, card.card_id);
  }
});

test("CompareTable displays string and legacy benefits alongside named benefits", () => {
  const card = { ...cards[0], travel_benefits: { other_benefits: [
    "String benefit. Extra sentence.",
    { benefit: "Legacy benefit", description: "Legacy description. Extra sentence." },
    { name: "Named benefit", description: "Named description. Extra sentence." },
    null,
    " ",
  ] } };
  const html = renderToString(createElement(CompareTable, { cards: [card], lang: "en" }));
  for (const text of ["String benefit", "Legacy benefit", "Legacy description", "Named benefit", "Named description"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes("Extra sentence"));
});
