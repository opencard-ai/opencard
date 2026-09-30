import assert from 'node:assert/strict';
import { assessCandidate, expiryReport, emptyLedger, type Candidate, type Confirmation } from './gate';
import { applyPlanToCard, confirmationsFor, planApply, sanityCheck, schemaCheck } from './apply-core';
import { buildCandidate, extractValues } from './collect';
import { commitMessage, expectedLiveStrings, pageText, parseVercelState, publish, type PublishConfig, type PublishDeps } from './publish-core';
import { buildDigest } from './digest-core';
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
  console.log('offer-watch pipeline: passed');
})().catch(error => { console.error(error); process.exit(1); });
