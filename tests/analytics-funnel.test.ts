import assert from 'node:assert/strict';
import { trackCardAdded, trackBenefitUsed, trackMyCardsFirstVisit, trackEvent } from '../lib/analytics';
const values = new Map<string, string>();
const events: string[] = [];
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
Object.assign(globalThis, { window: { va: (_: string, event: {name: string}) => events.push(event.name) }, localStorage: storage });
trackCardAdded('example'); trackMyCardsFirstVisit(); assert.equal(events.length, 0); assert.equal(values.size, 0);
for (const consent of ['rejected', 'managed']) { values.set('opencard_cookie_consent', consent); trackBenefitUsed('credit'); assert.equal(events.length, 0); }
values.set('opencard_cookie_consent', 'accepted');
trackCardAdded('example'); trackCardAdded('example'); assert.equal(events.filter(x => x === 'first_card_added').length, 1);
trackBenefitUsed('credit'); trackBenefitUsed('free_night'); assert.equal(events.filter(x => x === 'first_benefit_used').length, 1);
let now = 1000000000000; Date.now = () => now;
trackMyCardsFirstVisit(); now += 6.99 * 86400000; trackMyCardsFirstVisit(); assert(!events.includes('my_cards_day7_return'));
now += .02 * 86400000; trackMyCardsFirstVisit(); trackMyCardsFirstVisit(); assert.equal(events.filter(x => x === 'my_cards_day7_return').length, 1);
now = 1000000000000 + 30.5 * 86400000; trackMyCardsFirstVisit(); assert.equal(events.filter(x => x === 'my_cards_day30_return').length, 1);
values.delete('opencard_analytics_my_cards_day7_return'); now = 1000000000000 + 8 * 86400000; trackMyCardsFirstVisit(); assert.equal(events.filter(x => x === 'my_cards_day7_return').length, 1);
values.set('opencard_cookie_consent', 'rejected'); const count = events.length; trackEvent('no'); assert.equal(events.length, count);
Object.assign(globalThis, { localStorage: { getItem() { throw Error('disabled'); } } }); assert.doesNotThrow(() => trackMyCardsFirstVisit());
console.log('PASS consent, milestones, exact retention windows, storage failure');
