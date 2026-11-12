/** Public browser excerpts are observations, NOT full DOM parser/publisher acceptance. No requests or data writes. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { extractValues, buildCandidate, type WatchEntry } from './collect';
import { planApply } from './apply-core';
const facts=JSON.parse(fs.readFileSync(new URL('./fixtures/public-browser-parity-20261107.json',import.meta.url),'utf8'));
const watch=JSON.parse(fs.readFileSync(new URL('./watchlist.json',import.meta.url),'utf8')).cards as WatchEntry[];
for (const index of [1,3]) test(`partial issuer observation${index} never fabricates zero/offer and remains manual review`,()=>{
 const fact=facts.products[index],entry=watch.find(e=>e.sources.some(s=>s.url===fact.requested_url))!,source=entry.sources.find(s=>s.url===fact.requested_url)!;
 const extracted=extractValues(fact.visible_offer_quote,source);assert.equal(Object.hasOwn(extracted.values,'welcome_offer.bonus_points'),false);assert.equal(Object.hasOwn(extracted.values,'welcome_offer.spending_requirement'),false);assert.equal(Object.hasOwn(extracted.values,'welcome_offer.time_period_months'),false);
 const candidate=buildCandidate({...entry,hold_only:true,hold_reason:'partial_browser_render_not_parser_acceptance'},[{url:source.url,fetch_id:'public-excerpt-only',checked_at:'2026-11-07T18:59:00-08:00',ok:true,official_domain:true,values:extracted.values}],'2026-11-07T18:59:00-08:00');
 const plan=planApply({results:[{card_id:'synthetic-only',status:'review_delta',changes:[],evidence:candidate.evidence}]},new Map(),{today:'2026-11-07',runAt:Date.parse('2026-11-07T18:59:00-08:00'),officialDomains:['citi.com','americanexpress.com']});assert.equal(plan.applied.length,0);assert.ok(plan.held.some(h=>h.reasons.includes('hold_only_watch_entry')));
});
test('partner facts remain explicit alternatives, not replacement direct-source parser success',()=>{for(const i of [2,4]){const f=facts.products[i];assert.match(f.page_status,/comparison|fallback/);assert.notEqual(f.requested_url,facts.products[i-1].requested_url);assert.match(facts.products[i-1].page_status,/partially rendered/);}assert.match(facts.products[4].bonuspoints,/Free Night Reward/);assert.equal(facts.products[4].offerexpiry,'1/13/27');});
