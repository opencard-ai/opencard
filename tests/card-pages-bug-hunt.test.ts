import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET } from "../app/api/cards/route";
import { getAllCards, type CreditCard } from "../lib/cards";
import CompareTable from "../app/components/CompareTable";
import CardRow from "../app/components/CardRow";
import CardAccessLinks from "../app/components/CardAccessLinks";
import ElevatedOffersList from "../app/components/ElevatedOffersList";

const request = (query: string) => GET(new Request(`http://localhost/api/cards${query}`));

test("legacy cards API rejects malformed parameters without broadening the selection", async () => {
  for (const query of ["?card_id=", "?card_id=../bad", "?ids=", "?ids=,", "?ids=amex-gold,bad!", "?summary=true"]) {
    const response = await request(query);
    assert.equal(response.status, 400, query);
    assert.equal(typeof (await response.json()).error, "string");
  }
  const tooMany = Array.from({ length: 101 }, (_, i) => `unknown-${i}`).join(",");
  assert.equal((await request(`?ids=${tooMany}`)).status, 400);
});

test("legacy cards API preserves grouped, flat, single, batch and missing-card shapes", async () => {
  const grouped = await (await request("")).json();
  assert.ok(Array.isArray(grouped[0].cards));
  const flat = await (await request("?summary=1&issuer=Chase")).json();
  assert.ok(flat.length > 0);
  assert.ok(flat.every((card: CreditCard) => card.card_id && card.issuer === "Chase"));
  assert.equal((await (await request("?card_id=amex-gold")).json()).card_id, "amex-gold");
  assert.equal((await request("?card_id=nonexistent-card")).status, 404);
  assert.deepEqual(await (await request("?ids=nonexistent-card")).json(), []);
  const batch = await (await request("?ids=amex-gold,%20amex-gold")).json();
  assert.deepEqual(batch.map((card: CreditCard) => card.card_id), ["amex-gold"]);
});

test("legacy cards API reports unavailable catalog separately from a missing card", async (t) => {
  const read = t.mock.method(fs, "readdirSync", () => []);
  try {
    const response = await request("?card_id=amex-gold");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Card catalog unavailable" });
  } finally {
    read.mock.restore();
  }
});

test("comparison shows lounge names and row/column headers, including empty benefits", () => {
  const card = getAllCards().find(card => card.card_id === "chase-sapphire-preferred")!;
  const html = renderToStaticMarkup(createElement(CompareTable, {
    cards: [{ ...card, recurring_credits: [], travel_benefits: {
      lounge_access: [{ name: "Fixture Lounge", type: "membership" }],
    } }], lang: "en",
  }));
  assert.ok(html.includes("Fixture Lounge"));
  assert.match(html, /<th scope="row"[^>]*>Benefits &amp; Credits<\/th>/);
  assert.match(html, /<th scope="col"/);
  const empty = renderToStaticMarkup(createElement(CompareTable, {
    cards: [{ ...card, recurring_credits: [], travel_benefits: { lounge_access: [] } }], lang: "en",
  }));
  assert.match(empty, /space-y-3"><span[^>]*>—<\/span>/);
});

test("card rows, offers, comparison and fee links tolerate unknown annual fees", () => {
  const base = getAllCards().find(card => card.card_id === "chase-sapphire-preferred")!;
  for (const fee of [undefined, null, NaN]) {
    const card = { ...base, annual_fee: fee } as unknown as CreditCard;
    const html = [
      renderToStaticMarkup(createElement(CompareTable, { cards: [card], lang: "en" })),
      renderToStaticMarkup(createElement(CardRow, {
        card, lang: "en", locale: "en", isCompared: false, isMaxed: false, onToggleCompare: () => {},
      })),
      renderToStaticMarkup(createElement(CardAccessLinks, { card, lang: "en", l: key => key })),
      renderToStaticMarkup(createElement(ElevatedOffersList, { cards: [card], lang: "en" })),
    ].join("");
    assert.doesNotMatch(html, /\$(?:undefined|null|NaN)|−\$NaN/);
    assert.ok(html.includes("—"));
  }
});
