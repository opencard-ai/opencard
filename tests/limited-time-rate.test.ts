import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardSeoMeta } from "../lib/card-seo";

const card = JSON.parse(readFileSync(new URL("../data/cards/chase-ink-biz-unlimited.json", import.meta.url), "utf8"));
const promo = { ...card, earning_rates: [{ category: "All Purchases (Flat)", rate: 1.5 }, { category: "Lyft Rides", rate: 5, limited_time: true, ends: "2027-09-30" }] };
assert.ok(!/Up to 5/.test(cardSeoMeta(promo, "en", false).title), "limited-time promo rate never becomes the headline rate");
const permanent = { ...promo, earning_rates: [promo.earning_rates[0], { category: "Lyft Rides", rate: 5 }] };
assert.ok(/Up to 5/.test(cardSeoMeta(permanent, "en", false).title), "a permanent 5% rate still does");
