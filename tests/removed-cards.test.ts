import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { removedCards } from "../lib/removed-cards";
import { removedCardCopy } from "../lib/removed-card-copy";
import { getCardById, isClosedToNewApplicants } from "../lib/cards";
import { isIndexableCard } from "../lib/indexable-cards";
import { isAdEligiblePath } from "../lib/ad-eligibility";
import { locales } from "../lib/i18n";
import sitemap from "../app/sitemap";
import nextConfig from "../next.config";

const renames = [
  ["capital-one-savor-one", "capital-one-savorone"],
  ["usbank-cash-plus", "us-bank-cash-plus"],
  ["wellsfargo-autograph", "wells-fargo-autograph"],
  ["wellsfargo-active-cash", "wells-fargo-active-cash"],
  ["usbank-altitude-go", "us-bank-altitude-go"],
  ["usbank-altitude-connect", "us-bank-altitude-connect"],
  ["usbank-altitude-reserve", "us-bank-altitude-reserve"],
  ["discover-it-student", "discover-it-student-cash-back"],
  ["discover-it-cash-back", "discover-it"],
  ["citi-premier", "citi-strata-premier"],
];

test("removed-card copy stays neutral in every locale", () => {
  const claims = /annual fee|cash ?back|best|recommend|年費|年费|回饋|返现|cuota|reembolso|mejor|推薦|推荐/i;
  for (const locale of locales) {
    for (const [key, value] of Object.entries(removedCardCopy[locale])) {
      const strings = typeof value === "function" ? removedCards.map(({ name }) => value(name)) : [value];
      for (const copy of strings) assert.doesNotMatch(copy, claims, `${locale}.${key}`);
    }
  }
});

test("removed-card page stays dynamic and contains no external or affiliate links", () => {
  const source = fs.readFileSync("app/[lang]/removed-card/[card_id]/page.tsx", "utf8");
  assert.match(source, /^export const dynamic = "force-dynamic";/m);
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+generateStaticParams/);
  assert.doesNotMatch(source, /href\s*=\s*\{?\s*["'`]\s*(?:[a-z][a-z\d+.-]*:|\/\/)/i);
  assert.doesNotMatch(source, /rel\s*=\s*\{?\s*["'`][^"'`]*\bsponsored\b/i);
  assert.doesNotMatch(source, /AffiliateLink/);
  assert.doesNotMatch(source, /(?:import|export)\b[^;]*\bfrom\s*["'][^"']*referral[^"']*["']|import\s*\(\s*["'][^"']*referral[^"']*["']\s*\)/i);
});

test("removed cards have only current, open, indexable alternatives and no discovery entries or ads", () => {
  const entries = sitemap();
  assert.deepEqual(Object.keys(removedCardCopy).sort(), [...locales].sort());
  for (const card of removedCards) {
    assert.ok(!fs.existsSync(`data/cards/${card.id}.json`));
    assert.equal(getCardById(card.id), null);
    assert.match(card.removedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(card.alternatives.length >= 3 && card.alternatives.length <= 4);
    assert.equal(new Set(card.alternatives).size, card.alternatives.length);
    for (const id of card.alternatives) {
      const alternative = getCardById(id);
      assert.ok(alternative, id);
      assert.ok(isIndexableCard(alternative), id);
      assert.ok(!isClosedToNewApplicants(alternative), id);
    }
    assert.ok(entries.every(({ url }) => !url.includes(card.id) && !url.includes("/removed-card/")));
    for (const locale of locales) {
      assert.ok(removedCardCopy[locale].description(card.name).includes(card.name));
      assert.equal(isAdEligiblePath(`/${locale}/cards/${card.id}`, []), false);
      assert.equal(isAdEligiblePath(`/${locale}/removed-card/${card.id}`, []), false);
    }
  }
});

test("clear renames use 301 for both URL variants; removed cards have no redirects", async () => {
  const redirects = await nextConfig.redirects!();
  for (const card of removedCards) assert.ok(redirects.every(({ source }) => !source.includes(card.id)));
  for (const [old, current] of renames) {
    assert.ok(!fs.existsSync(`data/cards/${old}.json`), old);
    assert.ok(getCardById(current), current);
    for (const prefix of ["/:lang/cards/", "/cards/"]) {
      const redirect = redirects.find(({ source }) => source === `${prefix}${old}`);
      assert.ok(redirect, old);
      assert.equal(redirect.destination, `${prefix}${current}`);
      assert.equal(redirect.statusCode, 301);
      assert.equal(redirect.permanent, undefined);
    }
  }
  // Existing legacy redirects retain Next's permanent (308) behavior.
  for (const redirect of redirects.filter(({ statusCode }) => statusCode !== 301)) {
    assert.equal(redirect.permanent, true);
  }
});
