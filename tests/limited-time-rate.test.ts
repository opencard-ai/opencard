import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardSeoMeta } from "../lib/card-seo";

// Real card record as the base. English hand-written OVERRIDES (lib/card-seo.ts) bypass the
// generated template, so the template checks use a fixture card_id that can never have one.
const card = JSON.parse(readFileSync(new URL("../data/cards/chase-ink-biz-unlimited.json", import.meta.url), "utf8"));
const FIXTURE_ID = "test-fixture-limited-time-rate";
const rates = [{ category: "All Purchases (Flat)", rate: 1.5 }, { category: "Lyft Rides", rate: 5, limited_time: true, ends: "2027-09-30" }];
const promo = { ...card, card_id: FIXTURE_ID, earning_rates: rates };
// "5%"/"5x" as a whole number, not the "1.5%" base rate.
const FIVE = /(^|[^.\d])5(%|x)/;
const permanent = { ...promo, earning_rates: [rates[0], { category: "Lyft Rides", rate: 5 }] };

// Guard: the fixture really goes through the template (no override short-circuit).
assert.match(cardSeoMeta(promo, "en", false).title, /^.+: .+, .+ \| OpenCard$/);

for (const lang of ["en", "zh", "es"]) {
  assert.ok(!FIVE.test(cardSeoMeta(promo, lang, false).title), `${lang}: limited-time promo rate never becomes the headline rate`);
  assert.ok(FIVE.test(cardSeoMeta(permanent, lang, false).title), `${lang}: a permanent 5% rate still does`);
}
assert.ok(/Up to 5/.test(cardSeoMeta(permanent, "en", false).title), "en template says 'Up to 5'");

// The live card (en override, and the zh template on the real id) must not advertise the promo either.
for (const lang of ["en", "zh"]) {
  assert.ok(!FIVE.test(cardSeoMeta({ ...card, earning_rates: rates }, lang, false).title), `real card ${lang}`);
}
