import assert from 'node:assert/strict';
import { assessCandidate, expiryReport, emptyLedger, normalizeDate, updateLedger, isClosedToNewApplicants, DEFAULT_OFFICIAL_DOMAINS, type Candidate, type Confirmation } from './gate';
import { applyPlanToCard, confirmationsFor, planApply, sanityCheck, schemaCheck } from './apply-core';
import { autoExpiringEntries, buildCandidate, currentBonusVisible, extractValues, htmlToText, isErrorPage, samePage, stripQuery, type WatchEntry } from './collect';
import { readFileSync } from 'node:fs';
import { commitMessage, expectedLiveStrings, pageText, parseVercelState, publish, type PublishConfig, type PublishDeps } from './publish-core';
import { buildDigest, laEndOfDay } from './digest-core';
import { allFetchesFailed, buildDailySummary, holdKey, isMonday, newFetchFailures, newHolds } from './daily-core';
import { upsertLedger } from './state';

const runAt = Date.parse('2026-09-30T06:00:00Z');
const today = '2026-09-29';
const opts = { today, runAt };
const MS = 'https://www.morganstanley.com/what-we-do/wealth-management/cashplus';
const AMEX = 'https://apply.americanexpress.com/amex-morgan-stanley-credit-cards/?page_url=38';
const conf = (url: string, n: number, values: Record<string, unknown>, extra: Partial<Confirmation> = {}): Confirmation =>
  ({ url, fetch_id: `${url}#${n}`, checked_at: '2026-09-30T05:50:00Z', ok: true, official_domain: true, values, ...extra });

// ---------- collect: extraction + candidate building
const src = { url: AMEX, patterns: [{ regex: 'Earn ([\\d,]+) Membership Rewards\\S* Points after you spend \\$([\\d,]+) on purchases on your new Card in your first (\\d+) months', groups: { 'welcome_offer.bonus_points': 1, 'welcome_offer.spending_requirement': 2, 'welcome_offer.time_period_months': 3 } }] };
assert.deepEqual(extractValues('x Earn 80,000 Membership Rewards® Points after you spend $12,000 on purchases on your new Card in your first 6 months. y', src).values, { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000, 'welcome_offer.time_period_months': 6 });
assert.deepEqual(extractValues('Earn 80,000 Membership Rewards® Points after you spend $12,000 on purchases on your new Card in your first 6 months. Earn 150,000 Membership Rewards® Points after you spend $12,000 on purchases on your new Card in your first 6 months.', src).ambiguous, ['welcome_offer.bonus_points']);
const built = buildCandidate({ card_id: 'x', sources: [] }, [conf(MS, 1, { 'welcome_offer.bonus_points': 80000 }), conf(AMEX, 1, { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000 }), { ...conf(AMEX, 2, {}), ok: false }], '2026-09-30T05:50:00Z');
assert.deepEqual(built.fields, { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000 });
assert.equal(built.evidence.conflicts, false);
assert.equal(buildCandidate({ card_id: 'x', sources: [] }, [conf(MS, 1, { 'welcome_offer.bonus_points': 80000 }), conf(AMEX, 1, { 'welcome_offer.bonus_points': 90000 })], 'now').evidence.conflicts, true);

// ---------- guards
const two = [conf(MS, 1, { 'welcome_offer.bonus_points': 80000 }), conf(MS, 2, { 'welcome_offer.bonus_points': 80000 })];
assert.equal(confirmationsFor(two, 'welcome_offer.bonus_points', 80000, opts).independent, 2);
assert.equal(confirmationsFor([two[0], { ...two[0] }], 'welcome_offer.bonus_points', 80000, opts).independent, 1); // same fetch twice is not independent
assert.equal(confirmationsFor([two[0], conf('https://www.doctorofcredit.com/x', 3, { 'welcome_offer.bonus_points': 80000 })], 'welcome_offer.bonus_points', 80000, opts).independent, 1); // blog not counted
assert.equal(confirmationsFor([two[0], conf(MS, 2, { 'welcome_offer.bonus_points': 80000 }, { checked_at: '2026-09-27T00:00:00Z' })], 'welcome_offer.bonus_points', 80000, opts).independent, 1); // stale fetch not counted
assert.equal(confirmationsFor([two[0], conf(MS, 2, { 'welcome_offer.bonus_points': 80000 }, { ok: false })], 'welcome_offer.bonus_points', 80000, opts).independent, 1); // failed fetch not counted
assert.deepEqual(sanityCheck('welcome_offer.bonus_points', 50000, 200000, today), ['bonus_jump_over_3x']);
assert.deepEqual(sanityCheck('welcome_offer.bonus_points', 150000, 40000, today), ['bonus_jump_over_3x']);
assert.deepEqual(sanityCheck('welcome_offer.bonus_points', 50000, 200000, today, true), []);
assert.deepEqual(sanityCheck('welcome_offer.bonus_points', 150000, 80000, today), []);
assert.ok(sanityCheck('annual_fee', 0, 5000, today).includes('annual_fee_out_of_range'));
assert.ok(sanityCheck('welcome_offer.spending_requirement', 4000, 0, today).includes('spend_out_of_range'));
assert.deepEqual(sanityCheck('welcome_offer.expiry', '2026-09-30', '2026-09-01', today), ['expiry_in_past']);
assert.deepEqual(sanityCheck('welcome_offer.expiry', null, '2027-01-13', today), []);
assert.deepEqual(sanityCheck('welcome_offer.expiry', '2026-09-30', null, today), ['clearing_expiry_only_via_expiry_path']);
assert.deepEqual(sanityCheck('welcome_offer.time_period_months', 3, 30, today), ['time_period_out_of_range']);

// ---------- planApply end to end on a Morgan-Stanley-like card
const msCard = { card_id: 'amex-morgan-stanley-platinum', name: 'Amex Morgan Stanley Platinum', annual_fee: 895, welcome_offer: { bonus_points: 150000, spending_requirement: 12000, time_period_months: 6, description: 'old', point_program: 'Amex Membership Rewards', estimated_value: 2550, is_elevated: true, elevated_until: '2026-07-08' }, sources: [] };
const cards = new Map<string, any>([[msCard.card_id, msCard]]);
const fetches = [conf(MS, 1, { 'welcome_offer.bonus_points': 80000 }), conf(MS, 2, { 'welcome_offer.bonus_points': 80000 }),
  conf(AMEX, 1, { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000, 'welcome_offer.time_period_months': 6, annual_fee: 895 }),
  conf(AMEX, 2, { 'welcome_offer.bonus_points': 80000, 'welcome_offer.spending_requirement': 12000, 'welcome_offer.time_period_months': 6, annual_fee: 895 })];
const candidate: Candidate = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches, '2026-09-30T05:50:00Z');
const report = (cand: Candidate, card: any = msCard) => ({ results: [assessCandidate(cand, card, false, runAt)], expiry: expiryReport([card], today) });
const plan = planApply(report(candidate), cards, opts);
assert.equal(plan.applied.length, 1);
assert.deepEqual(plan.applied[0].changes.map(c => [c.field, c.old_value, c.new_value]), [
  ['welcome_offer.bonus_points', 150000, 80000], ['welcome_offer.is_elevated', true, false], ['welcome_offer.expiry', '2026-07-08', null], ['welcome_offer.offer_status', null, 'public']]);
assert.deepEqual(plan.applied[0].kinds, ['offer_update', 'expiry_revert']);
assert.deepEqual(plan.applied[0].sources.sort(), [AMEX, MS].sort());
const after = applyPlanToCard(msCard, plan.applied[0], today);
assert.equal(after.welcome_offer.bonus_points, 80000); assert.equal(after.welcome_offer.is_elevated, false); assert.equal(after.welcome_offer.offer_status, 'public');
assert.equal('elevated_until' in after.welcome_offer, false); assert.equal(after.welcome_offer.estimated_value, 1360);
assert.equal(after.welcome_offer.description, 'Earn 80,000 Amex Membership Rewards bonus points after spending $12,000 on purchases in the first 6 months.');
assert.equal(after.last_verified, today); assert.equal(after.sources.length, 2); assert.deepEqual(schemaCheck(after), []);
assert.equal(msCard.welcome_offer.bonus_points, 150000); // pure

// only one official fetch -> held, and expiry revert still happens (old offer gone) but as expired_review_required
const oneFetch = buildCandidate({ card_id: msCard.card_id, sources: [] }, [fetches[0], { ...fetches[1], ok: false, values: {} }], '2026-09-30T05:50:00Z');
const planOne = planApply(report(oneFetch), cards, opts);
assert.ok(planOne.held.some(h => h.field === 'welcome_offer.bonus_points' && h.reasons.includes('needs_two_independent_official_fetches')));
assert.deepEqual(planOne.applied[0].changes.map(c => [c.field, c.new_value]), [['welcome_offer.is_elevated', false], ['welcome_offer.offer_status', 'expired_review_required']]);
assert.ok(planOne.expiry_review.some(h => h.reasons.includes('expired_no_confirmed_replacement_offer')));
// official pages unreachable -> no change at all, marked for review
const down = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches.map(f => ({ ...f, ok: false, values: {} })), '2026-09-30T05:50:00Z');
const planDown = planApply(report(down), cards, opts);
assert.equal(planDown.applied.length, 0); assert.deepEqual(planDown.expiry_review.map(h => h.reasons[0]), ['official_page_fetch_failed']);
// old elevated offer still shown officially -> no change
const still = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches.map(f => ({ ...f, values: { 'welcome_offer.bonus_points': 150000 } })), '2026-09-30T05:50:00Z');
const planStill = planApply(report(still), cards, opts);
assert.equal(planStill.applied.length, 0); assert.deepEqual(planStill.expiry_review.map(h => h.reasons[0]), ['expired_offer_still_shown_on_official_page']);
// expired card not in the watchlist -> review only
assert.deepEqual(planApply({ results: [], expiry: expiryReport([msCard], today) }, cards, opts).expiry_review.map(h => h.reasons[0]), ['expired_not_in_watchlist_no_official_fetch']);
// uncommitted local edits on the card -> hold
assert.ok(planApply(report(candidate), cards, opts, new Set([msCard.card_id])).held.every(h => h.reasons.includes('card_file_has_uncommitted_changes')));
// 3x jump held even with two fetches
const jump = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches.map(f => ({ ...f, values: { ...f.values, 'welcome_offer.bonus_points': 500000 } })), '2026-09-30T05:50:00Z');
assert.ok(planApply(report(jump), cards, opts).held.some(h => h.reasons.includes('bonus_jump_over_3x')));
// non-official primary evidence (needs_verification) is held, never applied
const blog: Candidate = { ...candidate, evidence: { ...candidate.evidence, url: 'https://www.doctorofcredit.com/x' } };
const planBlog = planApply({ results: [assessCandidate(blog, msCard, false, runAt)] }, cards, opts);
assert.equal(planBlog.applied.length, 0); assert.ok(planBlog.held[0].reasons.includes('official_claim_from_non_allowlisted_domain'));
// official pages disagree -> held
const mixed = { ...candidate, fields: { 'welcome_offer.bonus_points': 80000 }, evidence: { ...candidate.evidence, confirmations: [...fetches, conf(AMEX, 3, { 'welcome_offer.bonus_points': 90000 })] } };
assert.ok(planApply({ results: [assessCandidate(mixed, msCard, false, runAt)] }, cards, opts).held.some(h => h.reasons.includes('official_fetches_disagree')));

// ---------- Step 4: extractor helpers, hold-only entries, auto-added expiring cards, parsed-offer expiry guard
const bilt = { url: 'https://www.bilt.com/card', patterns: [{ regex: 'Sign-up bonus\\s*(?:\\d )?([\\d,]+) points and Gold Status\\s*After you spend \\$([\\d,]+) on purchases \\(excluding rent or mortgage\\) in your first (\\d+) days', groups: { 'welcome_offer.bonus_points': 1, 'welcome_offer.spending_requirement': 2, 'welcome_offer.time_period_months': 3 }, transforms: { 'welcome_offer.time_period_months': 'days_to_months' as const } }] };
assert.deepEqual(extractValues('Sign-up bonus 1 50,000 points and Gold Status After you spend $4,000 on purchases (excluding rent or mortgage) in your first 90 days.', bilt).values, { 'welcome_offer.bonus_points': 50000, 'welcome_offer.spending_requirement': 4000, 'welcome_offer.time_period_months': 3 });
assert.deepEqual(extractValues('Sign-up bonus 50,000 points and Gold Status After you spend $4,000 on purchases (excluding rent or mortgage) in your first 90 days.', bilt).values['welcome_offer.bonus_points'], 50000); // no footnote digit
assert.deepEqual(extractValues('Sign-up bonus 1 50,000 points and Gold Status After you spend $4,000 on purchases (excluding rent or mortgage) in your first 45 days.', bilt).ambiguous, ['welcome_offer.time_period_months']); // 45 days is not whole months
assert.deepEqual(extractValues('Earn 125k Bonus Points after $5k', { url: 'x', patterns: [{ regex: 'Earn (\\d+k) Bonus Points after \\$(\\d+k)', groups: { 'welcome_offer.bonus_points': 1, 'welcome_offer.spending_requirement': 2 } }] }).values, { 'welcome_offer.bonus_points': 125000, 'welcome_offer.spending_requirement': 5000 });
assert.equal(normalizeDate('November 4, 2026'), '2026-11-04'); assert.equal(normalizeDate('9/30/2026'), '2026-09-30'); assert.equal(normalizeDate('1/13/27'), '2027-01-13');
assert.equal(htmlToText('<p>Delta SkyMiles &#174; Reserve&#x27;s Card\u200b</p><b>$650</b>&nbsp;&curren;'), " Delta SkyMiles ® Reserve's Card $650 ¤");
assert.ok(samePage('https://www.bilt.com/card', 'https://www.bilt.com/card/')); assert.ok(samePage(AMEX, 'https://apply.americanexpress.com/amex-morgan-stanley-credit-cards/?page_url=99'));
assert.ok(!samePage('https://www.usbank.com/credit-cards/altitude-reserve-visa-infinite-credit-card.html', 'https://www.usbank.com/credit-cards.html'));
assert.equal(currentBonusVisible('Earn 150,000 Membership Rewards points', msCard), true); assert.equal(currentBonusVisible('Earn 150K Bonus Points', msCard), true);
assert.equal(currentBonusVisible('Earn 1,150,000 points or 150,0001', msCard), false); assert.equal(currentBonusVisible('Earn 80,000 points', msCard), false);
assert.equal(currentBonusVisible('Earn a $1,000 cash bonus', { welcome_offer: { cash_bonus: 1000 } }), true); assert.equal(currentBonusVisible('x', { welcome_offer: {} }), undefined);
assert.ok(isErrorPage('Loading Error Sorry, we are unable to load this page at this time. Please try again later.' + ' nav'.repeat(200))); assert.ok(!isErrorPage('Welcome Offer '.repeat(100)));

// auto-add: expiring/expired cards not on the watchlist, with an official URL in sources -> hold-only entries
const expCards = [
  { card_id: 'soon', welcome_offer: { bonus_points: 60000, is_elevated: true, expires: '2026-10-10' }, sources: [{ url: 'https://www.doctorofcredit.com/x' }, { url: 'https://www.chase.com/soon' }] },
  { card_id: 'past', welcome_offer: { bonus_points: 60000, offer_status: 'public_limited_time', expires: '2026-09-01' }, sources: ['https://www.citi.com/past'], application_url: 'https://www.citi.com/apply' },
  { card_id: 'handled', welcome_offer: { bonus_points: 60000, offer_status: 'expired_review_required', is_elevated: false, expires: '2026-09-01' }, sources: ['https://www.citi.com/h'] },
  { card_id: 'far', welcome_offer: { bonus_points: 60000, is_elevated: true, expires: '2026-11-04' }, sources: ['https://www.delta.com/far'] },
  { card_id: 'blog-only', welcome_offer: { bonus_points: 60000, is_elevated: true, expires: '2026-10-05' }, sources: ['https://www.uscreditcardguide.com/x', 'http://www.chase.com/insecure'] },
  { card_id: 'watched', welcome_offer: { bonus_points: 60000, is_elevated: true, expires: '2026-10-05' }, sources: ['https://www.chase.com/w'] },
];
const auto = autoExpiringEntries([{ card_id: 'watched', sources: [] }], expCards, '2026-09-30', DEFAULT_OFFICIAL_DOMAINS);
assert.deepEqual(auto.map(e => e.card_id).sort(), ['past', 'soon']);
assert.ok(auto.every(e => e.hold_only && e.auto_added && e.sources.every(src => src.patterns.length === 0)));
assert.deepEqual(auto.find(e => e.card_id === 'soon')!.sources.map(src => src.url), ['https://www.chase.com/soon']);
assert.deepEqual(auto.find(e => e.card_id === 'past')!.sources.map(src => src.url), ['https://www.citi.com/past', 'https://www.citi.com/apply']);

// hold-only entry: a two-fetch-confirmed change is still held, never applied
const holdCand = buildCandidate({ card_id: msCard.card_id, hold_only: true, hold_reason: 'page_not_reliable', sources: [] }, fetches, '2026-09-30T05:50:00Z');
const planHold = planApply(report(holdCand), cards, opts);
assert.equal(planHold.applied.length, 0);
assert.ok(planHold.held.length && planHold.held.every(h => h.reasons[0] === 'hold_only_watch_entry' && h.reasons.includes('page_not_reliable')));
assert.deepEqual(planHold.expiry_review.map(h => h.reasons[0]), ['hold_only_watch_entry']);
// hold-only with failed fetches (e.g. product page redirected) -> one held item carrying the fetch error
const usb = { card_id: 'usb', name: 'USB', annual_fee: 400, welcome_offer: { bonus_points: 60000 } };
const usbCand = buildCandidate({ card_id: 'usb', hold_only: true, hold_reason: 'redirects', sources: [] }, [{ ...conf('https://www.usbank.com/ar.html', 1, {}), ok: false, error: 'redirected_to_other_page: https://www.usbank.com/credit-cards.html' }], '2026-09-30T05:50:00Z');
const planUsb = planApply({ results: [assessCandidate(usbCand, usb, false, runAt)] }, new Map([['usb', usb]]), opts);
assert.equal(planUsb.applied.length, 0); assert.ok(planUsb.held[0].reasons.some(r => r.startsWith('official_fetch_failed: redirected_to_other_page')));
// expiry guard: page fetched OK but the extractor read nothing -> review, never "offer gone"
const blank = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches.map(f => ({ ...f, values: {} })), '2026-09-30T05:50:00Z');
assert.deepEqual(planApply(report(blank), cards, opts).expiry_review.map(h => h.reasons[0]), ['official_page_offer_not_parsed']);
assert.equal(planApply(report(blank), cards, opts).applied.length, 0);
const blankVisible = buildCandidate({ card_id: msCard.card_id, sources: [] }, fetches.map(f => ({ ...f, values: {}, observed: { current_bonus_visible: true } })), '2026-09-30T05:50:00Z');
assert.deepEqual(planApply(report(blankVisible), cards, opts).expiry_review.map(h => h.reasons[0]), ['expired_offer_still_shown_on_official_page']);
// Marriott-style offer ending TODAY: not expired yet -> untouched today; reverted the day after once a new offer is confirmed
const mar = { card_id: 'amex-marriott-bevy', name: 'Bevy', annual_fee: 250, welcome_offer: { bonus_points: 125000, spending_requirement: 5000, time_period_months: 6, statement_credit: 150, point_program: 'Marriott Bonvoy', estimated_value: 950, offer_status: 'public_limited_time', is_elevated: true, expires: '2026-09-30', expires_at: '2026-09-30', elevated_until: '2026-09-30' } };
const marCards = new Map<string, any>([[mar.card_id, mar]]);
const MAR = 'https://www.marriott.com/credit-cards.mi';
const marSame = buildCandidate({ card_id: mar.card_id, sources: [] }, [conf(MAR, 1, { 'welcome_offer.bonus_points': 125000, 'welcome_offer.expiry': '2026-09-30' }), conf(MAR, 2, { 'welcome_offer.bonus_points': 125000, 'welcome_offer.expiry': '2026-09-30' })], '2026-09-30T14:00:00Z');
const todayOpts = { today: '2026-09-30', runAt: Date.parse('2026-09-30T14:05:00Z') };
const planToday = planApply({ results: [assessCandidate(marSame, mar, false, todayOpts.runAt)], expiry: expiryReport([mar], '2026-09-30') }, marCards, todayOpts);
assert.equal(expiryReport([mar], '2026-09-30').expired.length, 0); assert.equal(planToday.applied.length, 0); assert.equal(planToday.expiry_review.length, 0); assert.equal(planToday.held.length, 0);
const tomorrowOpts = { today: '2026-10-01', runAt: Date.parse('2026-10-01T14:05:00Z') };
const marNew = buildCandidate({ card_id: mar.card_id, sources: [] }, [conf(MAR, 1, { 'welcome_offer.bonus_points': 85000 }, { checked_at: '2026-10-01T14:00:00Z' }), conf(MAR, 2, { 'welcome_offer.bonus_points': 85000 }, { checked_at: '2026-10-01T14:00:01Z' })], '2026-10-01T14:00:00Z');
const planTomorrow = planApply({ results: [assessCandidate(marNew, mar, false, tomorrowOpts.runAt)], expiry: expiryReport([mar], '2026-10-01') }, marCards, tomorrowOpts);
assert.deepEqual(planTomorrow.applied[0].changes.map(c => [c.field, c.new_value]), [['welcome_offer.bonus_points', 85000], ['welcome_offer.is_elevated', false], ['welcome_offer.expiry', null], ['welcome_offer.offer_status', 'public']]);
const marAfter = applyPlanToCard(mar, planTomorrow.applied[0], '2026-10-01');
assert.ok(!('expires' in marAfter.welcome_offer) && !('expires_at' in marAfter.welcome_offer) && !('elevated_until' in marAfter.welcome_offer));
// airline programs are described in miles
const delta = { card_id: 'd', name: 'D', annual_fee: 150, welcome_offer: { bonus_points: 80000, statement_credit: 250, spending_requirement: 2000, time_period_months: 6, point_program: 'Delta SkyMiles', offer_status: 'public_limited_time', expires_at: '2026-11-04' } };
assert.equal(applyPlanToCard(delta, { card_id: 'd', kinds: ['offer_update'], changes: [{ field: 'welcome_offer.spending_requirement', old_value: 2000, new_value: 3000, fingerprint: 'f' }], sources: ['https://www.delta.com/x'], notes: [] }, today).welcome_offer.description,
  'Limited-time offer: Earn 80,000 Delta SkyMiles bonus miles after spending $3,000 on purchases in the first 6 months, plus a $250 statement credit. Offer ends 11/4/2026.');

// ---------- publish / rollback with mocked git + vercel + fetch
const cfg: PublishConfig = { branch: 'main', remote: 'origin', vercelProject: 'opencard', vercelScope: 'team', siteBase: 'https://opencardai.com', checks: [['npm', 'run', 'validate'], ['npm', 'run', 'build']], deployTimeoutMs: 60000, deployPollMs: 1000, liveTimeoutMs: 3000, livePollMs: 1000 };
const appliedCard = { card_id: msCard.card_id, file: 'data/cards/amex-morgan-stanley-platinum.json', changes: plan.applied[0].changes, sources: plan.applied[0].sources };
function mockDeps(o: { failCheck?: string; vercel?: string[]; livePage?: string; pushFails?: number } = {}) {
  const calls: string[][] = []; let clock = 0; let sha = 0; let pushFails = o.pushFails ?? 0; const vercel = [...(o.vercel ?? ['● Ready'])];
  const deps: PublishDeps = {
    run(cmd, args) {
      calls.push([cmd, ...args]);
      const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
      if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return ok('main\n');
      if (cmd === 'git' && args[0] === 'status') return ok(` M ${appliedCard.file}\n`);
      if (cmd === 'git' && args[0] === 'rev-parse') return ok(`sha${sha}\n`);
      if (cmd === 'git' && (args[0] === 'commit' || args[0] === 'revert')) { sha++; return ok(); }
      if (cmd === 'git' && args[0] === 'push') return pushFails-- > 0 ? { code: 1, stdout: '', stderr: 'rejected' } : ok();
      if (cmd === 'git' && args[0] === 'rev-list') return ok(Array.from({ length: sha }, (_, i) => `sha${i + 1}`).join('\n'));
      if (cmd === 'vercel') return ok(`https://opencard-x.vercel.app ${vercel.length > 1 ? vercel.shift() : vercel[0]}`);
      if (o.failCheck && [cmd, ...args].join(' ') === o.failCheck) return { code: 1, stdout: '', stderr: 'boom' };
      return ok();
    },
    fetchText: async () => ({ status: 200, text: o.livePage ?? '<div>Welcome Offer</div><div>80,000<!-- --> pts</div> Spend $<!-- -->12,000 within <!-- -->6<!-- --> months <p>$895 Annual Fee</p>' }),
    readCard: () => after,
    sleep: async ms => { clock += ms; },
    now: () => new Date(runAt + clock),
    log: () => {},
  };
  return { deps, calls };
}
const noForce = (calls: string[][]) => assert.ok(!calls.some(c => c.join(' ').includes('--force') || c.join(' ').includes(' -f ') || c.some(a => a.startsWith('+'))));
(async () => {
  // success: one commit per card, pushed, deploy Ready, live verified, ledger published
  let m = mockDeps({ vercel: ['● Building', '● Ready'] });
  let res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'published'); assert.deepEqual(res.commits, [{ card_id: msCard.card_id, sha: 'sha1' }]);
  assert.ok(m.calls.some(c => c[0] === 'git' && c[1] === 'commit' && c.at(-1) === appliedCard.file));
  assert.equal(m.calls.filter(c => c[1] === 'revert').length, 0);
  assert.ok(res.ledger.every(l => l.status === 'published' && l.commit === 'sha1')); noForce(m.calls);
  // checks fail -> no commit, files restored
  m = mockDeps({ failCheck: 'npm run build' });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'checks_failed'); assert.equal(m.calls.filter(c => c[1] === 'commit').length, 0);
  assert.ok(m.calls.some(c => c[1] === 'checkout' && c.includes(appliedCard.file))); assert.ok(res.ledger.every(l => l.status === 'publish_failed'));
  // deploy error -> revert + push
  m = mockDeps({ vercel: ['● Error'] });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'deploy_failed'); assert.ok(m.calls.some(c => c[1] === 'revert' && c.includes('sha1')));
  assert.equal(m.calls.filter(c => c[1] === 'push').length, 2); assert.ok(res.ledger.every(l => l.status === 'rolled_back')); noForce(m.calls);
  // deploy never ready -> timeout -> revert
  m = mockDeps({ vercel: ['● Building'] });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'deploy_failed'); assert.ok(m.calls.some(c => c[1] === 'revert'));
  // live page still shows old values -> revert
  m = mockDeps({ livePage: '<div>150,000 pts</div> Spend $12,000 within 6 months $895 Annual Fee' });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'live_check_failed'); assert.ok(m.calls.some(c => c[1] === 'revert')); assert.equal(res.events[0].type, 'rolled_back');
  // push rejected once -> rebase (autostash) + retry, still no force
  m = mockDeps({ pushFails: 1 });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'published'); assert.ok(m.calls.some(c => c[1] === 'pull' && c.includes('--rebase'))); noForce(m.calls);
  // push always rejected -> push_failed, no revert of unpushed work
  m = mockDeps({ pushFails: 5 });
  res = await publish([appliedCard], cfg, m.deps);
  assert.equal(res.status, 'push_failed'); assert.equal(m.calls.filter(c => c[1] === 'revert').length, 0);
  // nothing to publish
  assert.equal((await publish([], cfg, mockDeps().deps)).status, 'nothing_to_publish');

  // helpers
  assert.deepEqual(expectedLiveStrings(after), ['80,000 pts', 'Spend $12,000 within 6 months', '$895 Annual Fee']);
  assert.ok(pageText('Spend $<!-- -->12,000 within <!-- -->6<!-- --> months').includes('Spend $12,000 within 6 months'));
  assert.equal(parseVercelState('x ● Ready y'), 'ready'); assert.equal(parseVercelState('● Error'), 'error'); assert.equal(parseVercelState('● Building'), 'pending'); assert.equal(parseVercelState('No deployments found'), 'unknown');
  const msg = commitMessage(appliedCard);
  assert.ok(msg.subject.startsWith('offer-watch(amex-morgan-stanley-platinum): bonus_points 150,000 -> 80,000')); assert.ok(msg.body.includes(MS) && msg.body.includes(AMEX));

  // ---------- digest
  const ledger = upsertLedger(emptyLedger(), [{ key: 'k1', card_id: 'amex-foo', field: 'welcome_offer.bonus_points', value: 90000, status: 'needs_verification', reasons: ['needs_two_independent_official_fetches'] }], '2026-09-28T00:00:00Z');
  const digest = buildDigest([
    { ts: '2026-09-29T10:00:00Z', type: 'published', card_id: msCard.card_id, changes: [{ field: 'welcome_offer.bonus_points', old_value: 150000, new_value: 80000 }], commit: 'abcdef123' },
    { ts: '2026-09-25T10:00:00Z', type: 'rolled_back', card_id: 'amex-bar', reasons: ['live_check_failed: x'], revert_commits: ['1234567aaa'] },
    { ts: '2026-09-01T10:00:00Z', type: 'published', card_id: 'too-old', changes: [] },
  ], ledger, today);
  assert.ok(digest.length < 1800); assert.ok(digest.includes('點數 150,000→80,000')); assert.ok(digest.includes('未取得兩次官方頁面確認')); assert.ok(digest.includes('已回滾')); assert.ok(!digest.includes('too-old'));
  const many = Array.from({ length: 200 }, (_, i) => ({ ts: '2026-09-29T10:00:00Z', type: 'published' as const, card_id: `card-${i}-with-a-long-identifier`, changes: [{ field: 'welcome_offer.bonus_points', old_value: 100000, new_value: 120000 }], commit: 'abcdef1' }));
  const long = buildDigest(many, ledger, today);
  assert.ok(long.length <= 1800, `digest too long: ${long.length}`); assert.ok(long.includes('…另有'));
  // PT day boundary: 22:56 PT on 09-29 is 05:56Z on 09-30 and belongs to the 09-29 digest
  assert.equal(new Date(laEndOfDay('2026-09-29')).toISOString(), '2026-09-30T06:59:59.999Z');
  assert.equal(new Date(laEndOfDay('2026-12-01')).toISOString(), '2026-12-02T07:59:59.999Z');
  const late = buildDigest([{ ts: '2026-09-30T05:56:13Z', type: 'published', card_id: 'late-card', changes: [] }, { ts: '2026-09-23T06:30:00Z', type: 'published', card_id: 'edge-old', changes: [] }], emptyLedger(), today);
  assert.ok(late.includes('late-card')); assert.ok(!late.includes('edge-old')); assert.ok(late.includes('2026-09-23 ～ 2026-09-29'));
  // ---------- daily wrapper helpers
  const heldA = { card_id: 'a', field: 'welcome_offer.bonus_points', value: 90000, reasons: ['needs_two_independent_official_fetches'], fingerprint: 'fa' };
  const expB = { card_id: 'b', field: 'welcome_offer.expiry', reasons: ['official_page_offer_not_parsed'] };
  const prevLedger = upsertLedger(emptyLedger(), [
    { key: 'fa', card_id: 'a', field: heldA.field, value: 90000, status: 'needs_verification', reasons: heldA.reasons },
    { key: holdKey(expB, 'expiry_review'), card_id: 'b', field: expB.field, value: null, status: 'needs_verification', reasons: expB.reasons },
  ], '2026-09-29T00:00:00Z');
  assert.deepEqual(newHolds({ held: [heldA], expiry_review: [expB] }, prevLedger), []); // same holds as yesterday -> nothing new
  assert.deepEqual(newHolds({ held: [{ ...heldA, reasons: ['bonus_jump_over_3x'] }], expiry_review: [] }, prevLedger).map(h => h.card_id), ['a']); // reason changed -> new
  assert.deepEqual(newHolds({ held: [{ ...heldA, fingerprint: 'fz' }], expiry_review: [expB] }, emptyLedger()).map(h => h.kind), ['held', 'expiry_review']);
  const failCands: any[] = [
    { card_id: 'down', fields: {}, evidence: { confirmations: [{ ok: false, error: 'issuer_error_or_block_page' }, { ok: false, error: 'http_503' }] } },
    { card_id: 'half', fields: {}, evidence: { confirmations: [{ ok: false, error: 'x' }, { ok: true }] } },
    { card_id: 'hold', fields: {}, evidence: { hold_only: true, confirmations: [{ ok: false, error: 'redirected_to_other_page: u' }] } },
  ];
  assert.deepEqual(allFetchesFailed(failCands), { down: ['issuer_error_or_block_page', 'http_503'] });
  assert.deepEqual(newFetchFailures({ down: ['x'], other: ['y'] }, { down: ['x'] }), { other: ['y'] });
  assert.equal(buildDailySummary({ today, events: [], stepFailures: [], holds: [], fetchFailures: {} }), 'NO_REPLY');
  const s1 = buildDailySummary({ today, events: [{ ts: 'x', type: 'published', card_id: 'amex-delta-gold', changes: [{ field: 'welcome_offer.spending_requirement', old_value: 2000, new_value: 3000 }], commit: 'abcdef1234' }],
    stepFailures: [{ step: 'collect', detail: 'collect 失敗' }], holds: [{ card_id: 'us-bank-altitude-reserve', field: null, reasons: ['hold_only_watch_entry', 'official_product_page_redirects_to_generic_card_list'], kind: 'held' }], fetchFailures: { 'amex-x': ['http_503'] } });
  assert.ok(s1.includes('消費門檻 2,000→3,000（abcdef1）') && s1.includes('僅供參考，不自動套用') && s1.includes('collect：collect 失敗') && s1.includes('amex-x：所有官方頁面抓取失敗'), s1);
  const manyHolds = Array.from({ length: 150 }, (_, i) => ({ card_id: `card-number-${i}-long-identifier`, field: 'welcome_offer.bonus_points', value: 100000 + i, reasons: ['needs_two_independent_official_fetches'], kind: 'held' as const }));
  const s2 = buildDailySummary({ today, events: [], stepFailures: [], holds: manyHolds, fetchFailures: {} });
  assert.ok(s2.length <= 1800 && s2.includes('…另有'), String(s2.length));
  const dg = '# 週報\n' + '- 項目\n'.repeat(400);
  const s3 = buildDailySummary({ today, events: [], stepFailures: [], holds: manyHolds, fetchFailures: {}, digest: dg });
  assert.ok(s3.length <= 1800 && s3.includes('# 週報'), String(s3.length));
  assert.equal(buildDailySummary({ today, events: [], stepFailures: [], holds: [], fetchFailures: {}, digest: '# 週報\n- 無' }), '# 週報\n- 無'); // Monday, nothing new -> digest only
  assert.ok(isMonday('2026-10-05') && !isMonday('2026-09-30'));
  assert.ok(buildDailySummary({ today, events: [], stepFailures: [], holds: [], fetchFailures: {}, planned: [{ card_id: 'amex-delta-gold', changes: [{ field: 'welcome_offer.spending_requirement', old_value: 2000, new_value: 3000 }] }] }).includes('預計套用'));
  // ---------- watchlist extractors: optional add-ons (statement credit / free night / "Offer ends") never break a match
  const watch: WatchEntry[] = JSON.parse(readFileSync(new URL('./watchlist.json', import.meta.url), 'utf8')).cards;
  const W = (card: string, host: string) => { const s = watch.find(w => w.card_id === card)!.sources.find(x => new URL(x.url).host.includes(host)); assert.ok(s, `${card} ${host}`); return s!; };
  const ex = (card: string, host: string, text: string) => { const r = extractValues(text, W(card, host)); assert.deepEqual(r.ambiguous, [], `${card} ${host} ambiguous`); return r.values; };
  const B = 'welcome_offer.bonus_points', SPD = 'welcome_offer.spending_requirement', MON = 'welcome_offer.time_period_months', CR = 'welcome_offer.statement_credit', EXP = 'welcome_offer.expiry';
  // marriott.com hub
  assert.deepEqual(ex('amex-marriott-bevy', 'marriott.com', 'Marriott Bonvoy Bevy® American Express® Card Earn 125,000 Bonus Points plus a $150 statement credit $250 Annual Fee'), { [B]: 125000, [CR]: 150, annual_fee: 250 });
  assert.deepEqual(ex('amex-marriott-bevy', 'marriott.com', 'Marriott Bonvoy Bevy® American Express® Card Earn 85,000 Bonus Points † $250 Annual Fee'), { [B]: 85000, [CR]: null, annual_fee: 250 });
  assert.deepEqual(ex('amex-marriott-brilliant', 'marriott.com', 'Marriott Bonvoy Brilliant® American Express® Card Earn 100,000 Bonus Points † $650 Annual Fee'), { [B]: 100000, [CR]: null, annual_fee: 650 });
  // marriott.com card page
  const mp = watch.find(w => w.card_id === 'amex-marriott-bevy')!.sources.filter(x => x.url.includes('marriott.com'))[1];
  assert.deepEqual(extractValues('Earn 125k Bonus Points plus a $150 statement credit after you use your new Card to make $5k in purchases within the first 6 months. Offer ends 9/30/2026. $250 Annual Fee*.', mp).values,
    { [B]: 125000, [CR]: 150, [SPD]: 5000, [MON]: 6, [EXP]: '2026-09-30', annual_fee: 250 });
  assert.deepEqual(extractValues('Earn 85k Bonus Points after you use your new Card to make $5K in purchases within the first 6 months of Card Membership.† $250 Annual Fee*.', mp).values,
    { [B]: 85000, [CR]: null, [SPD]: 5000, [MON]: 6, annual_fee: 250 }); // no credit, no "Offer ends": matched, credit null, expiry untouched
  // americanexpress.com Marriott
  assert.deepEqual(ex('amex-marriott-bevy', 'americanexpress.com', 'Earn 125,000 Marriott Bonvoy® Bonus Points Plus A $150 Statement Creditafter you use your new Card to make $5,000 in purchases within the first 6 months of Card Membership. Offer ends 09/30/26.'),
    { [B]: 125000, [CR]: 150, [SPD]: 5000, [MON]: 6, [EXP]: '2026-09-30' });
  assert.deepEqual(ex('amex-marriott-brilliant', 'americanexpress.com', 'Earn 100,000 Marriott Bonvoy® Bonus Pointsafter you use your new Card to make $6,000 in purchases within the first 6 months of Card Membership.†'),
    { [B]: 100000, [CR]: null, [SPD]: 6000, [MON]: 6 });
  // Delta Gold on Amex: statement credit sentence present / absent
  const dgOld = 'Earn a $250 Statement Creditand the bonus miles, once you meet that same spend requirement for the bonus miles.†Offer ends 11/4/2026.Apply and find out your welcome offerAs High As 80,000 Bonus Milesafter you spend $3,000 in purchases on your new Card within the first 6 months of Card Membership.';
  assert.deepEqual(ex('amex-delta-gold', 'americanexpress.com', dgOld), { [CR]: 250, [B]: 80000, [SPD]: 3000, [MON]: 6 });
  assert.deepEqual(ex('amex-delta-gold', 'americanexpress.com', 'Apply and find out your welcome offerAs High As 80,000 Bonus Milesafter you spend $3,000 in purchases on your new Card within the first 6 months of Card Membership.'), { [CR]: null, [B]: 80000, [SPD]: 3000, [MON]: 6 });
  // delta.com personal: "plus earn a Statement Credit" optional, "Offer ends" optional
  assert.deepEqual(ex('amex-delta-gold', 'delta.com', 'Delta SkyMiles® Gold Amex Card LIMITED TIME OFFER Your welcome offer could be as high as 80,000 Bonus Miles plus earn a Statement Credit of $250 after spending $3,000 in eligible purchases on your new Card within the first 6 months of Card Membership. Terms apply. Offer ends November 4, 2026.'),
    { [B]: 80000, [CR]: 250, [SPD]: 3000, [MON]: 6, [EXP]: '2026-11-04' });
  assert.deepEqual(ex('amex-delta-gold', 'delta.com', 'Delta SkyMiles® Gold Amex Card Earn 50,000 Bonus Miles after you spend $2,000 in eligible purchases on your new Card within the first 6 months of Card Membership.'),
    { [B]: 50000, [CR]: null, [SPD]: 2000, [MON]: 6 });
  // Hilton: free night in front / absent, "Offer ends" optional; free nights are tolerated, not extracted
  assert.deepEqual(ex('amex-hilton-honors', 'americanexpress.com', 'Earn a Free Night Reward + 70,000 Hilton Honors Bonus Points after you spend $2,000 in eligible purchases on the Card within the first 6 months of Card Membership. Offer ends 1/13/2027.'), { [B]: 70000, [SPD]: 2000, [MON]: 6, [EXP]: '2027-01-13' });
  assert.deepEqual(ex('amex-hilton-honors', 'americanexpress.com', 'Earn 70,000 Hilton Honors Bonus Points after you spend $2,000 in eligible purchases on the Card within the first 6 months of Card Membership.'), { [B]: 70000, [SPD]: 2000, [MON]: 6 });
  // sanity + apply: an officially confirmed removed add-on is allowed and deletes the key; null bonus is still rejected
  assert.deepEqual(sanityCheck('welcome_offer.statement_credit', 150, null, today), []);
  assert.deepEqual(sanityCheck('welcome_offer.bonus_points', 150000, null, today), ['not_numeric']);
  const bevyOld = { card_id: 'amex-marriott-bevy', name: 'Bevy', annual_fee: 250, welcome_offer: { bonus_points: 125000, statement_credit: 150, spending_requirement: 5000, time_period_months: 6, description: 'old', point_program: 'Marriott Bonvoy', estimated_value: 950 }, sources: [] };
  const MH = 'https://www.marriott.com/credit-cards.mi', MA = 'https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-bevy/';
  const bevyFetches = [conf(MH, 1, { [B]: 85000, [CR]: null, annual_fee: 250 }), conf(MH, 2, { [B]: 85000, [CR]: null, annual_fee: 250 }), conf(MA, 1, { [B]: 85000, [CR]: null, [SPD]: 5000, [MON]: 6 }), conf(MA, 2, { [B]: 85000, [CR]: null, [SPD]: 5000, [MON]: 6 })];
  const bevyCand = buildCandidate({ card_id: bevyOld.card_id, sources: [] }, bevyFetches, '2026-09-30T05:50:00Z');
  const bevyPlan = planApply(report(bevyCand, bevyOld), new Map<string, any>([[bevyOld.card_id, bevyOld]]), opts);
  assert.deepEqual(bevyPlan.held, []);
  assert.deepEqual(bevyPlan.applied[0].changes.filter(c => c.field === CR).map(c => [c.old_value, c.new_value]), [[150, null]]);
  const bevyNew = applyPlanToCard(bevyOld, bevyPlan.applied[0], today);
  assert.ok(!('statement_credit' in bevyNew.welcome_offer)); assert.equal(bevyNew.welcome_offer.bonus_points, 85000);
  // card already without a credit + points-only page -> unchanged (no proposal)
  assert.equal(assessCandidate(bevyCand, { ...bevyOld, welcome_offer: { ...bevyOld.welcome_offer, bonus_points: 85000, statement_credit: undefined } }, false, runAt).status, 'unchanged');
  // tracking query strings never make a hold look new
  assert.equal(stripQuery('https://www.usbank.com/credit-cards.html?sid=cr121711#x'), 'https://www.usbank.com/credit-cards.html');
  const holdRep = (err: string) => ({ results: [{ card_id: 'us-bank-altitude-reserve', status: 'needs_verification', changes: [], evidence: { hold_only: true, hold_reason: 'r', confirmations: [{ ...conf('https://www.usbank.com/x', 1, {}), ok: false, error: err }] } }], expiry: [] });
  const h1 = planApply(holdRep('redirected_to_other_page: https://www.usbank.com/credit-cards.html?sid=cr121711') as any, new Map(), opts).held;
  const h2 = planApply(holdRep('redirected_to_other_page: https://www.usbank.com/credit-cards.html') as any, new Map(), opts).held;
  assert.deepEqual(h1, h2);
  const holdLedger = upsertLedger(emptyLedger(), h1.map(h => ({ key: holdKey(h, 'held'), card_id: h.card_id, field: h.field, value: null, status: 'needs_verification', reasons: h.reasons })), '2026-09-30T18:30:00Z');
  assert.deepEqual(newHolds({ held: h2, expiry_review: [] }, holdLedger), []);
  // review --write keeps apply/publish fields on existing ledger entries
  const res0 = { ...assessCandidate(bevyCand, bevyOld, false, runAt), notify: false };
  const k0 = res0.changes[0].fingerprint;
  const kept = updateLedger({ version: 1, updated_at: null, entries: { [k0]: { card_id: 'amex-marriott-bevy', field: res0.changes[0].field, value: res0.changes[0].new_value, audience: null, status: 'needs_verification', first_seen: 'a', last_seen: 'a', last_notified: null, reasons: ['x'], commit: 'abc', published_at: 'p' } } }, [res0], 'now');
  assert.deepEqual([kept.entries[k0].reasons, kept.entries[k0].commit, kept.entries[k0].published_at, kept.entries[k0].first_seen], [['x'], 'abc', 'p', 'a']);
  // ---------- cards closed to new applicants: not watched, not auto-added, no expiry review
  assert.ok(isClosedToNewApplicants({ status: 'discontinued' }) && isClosedToNewApplicants({ discontinued: true }) && !isClosedToNewApplicants({ status: 'active' }) && !isClosedToNewApplicants(undefined));
  const closedCard = { card_id: 'closed-x', status: 'discontinued', welcome_offer: { bonus_points: 50000, expires: '2026-10-05', is_elevated: true }, sources: [{ url: 'https://www.usbank.com/credit-cards/x.html' }] };
  const openCard = { ...closedCard, card_id: 'open-x', status: 'active' };
  assert.deepEqual(expiryReport([closedCard, openCard], today).expiring_soon.map(i => i.card_id), ['open-x']);
  assert.deepEqual(autoExpiringEntries([], [closedCard, openCard], today, DEFAULT_OFFICIAL_DOMAINS).map(e => e.card_id), ['open-x']);
  assert.ok(!watch.some(w => w.card_id === 'us-bank-altitude-reserve'));
  console.log('offer-watch pipeline: passed');
})().catch(error => { console.error(error); process.exit(1); });
