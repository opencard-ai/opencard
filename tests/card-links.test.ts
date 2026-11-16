import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { CARD_LINK_IDS, getCardLinks } from "../lib/card-links";

const allowedHosts = new Set([
  "ulta.com", "d.comenity.net", "capitalone.com", "verified.capitalone.com",
  "connect.secure.wellsfargo.com", "creditcards.chase.com", "chase.com",
  "cards.barclaycardus.com", "discover.com", "americanexpress.com",
]);

for (const id of CARD_LINK_IDS) {
  test(`${id}: official links have a card record and verification metadata`, () => {
    assert.ok(existsSync(new URL(`../data/cards/${id}.json`, import.meta.url)), `${id}: missing card record`);
    const links = getCardLinks(id);
    assert.ok(links);
    assert.match(links.verified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(links.source.trim());
    for (const value of [links.applyUrl, links.loginUrl, links.payUrl]) {
      if (!value) continue;
      const url = new URL(value);
      assert.equal(url.protocol, "https:");
      assert.ok(!value.includes("?"), `${id}: no query strings allowed`);
      assert.ok(allowedHosts.has(url.hostname.replace(/^www\./, "")), `${id}: unexpected issuer hostname`);
    }
  });
}

test("unknown card has no verified links", () => {
  assert.equal(getCardLinks("nonexistent"), undefined);
});
