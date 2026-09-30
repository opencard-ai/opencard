import assert from 'node:assert/strict';
import { assessCandidate, changeFingerprint, dedupeBatch, emptyLedger, expiryReport, isOfficialUrl, normalizeDate, normalizeExpiry, normalizeNumber, shouldNotify, updateLedger, type Candidate } from './gate';
import { classifyPending, planPendingArchive } from './pending-classify';

const now = Date.parse('2026-09-13T20:00Z');
const c: Candidate = {card_id:'chase-sapphire-reserve',fields:{'welcome_offer.bonus_points':100000},evidence:{url:'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve',checked_at:'2026-09-13T19:00Z',official:true,audience:'public'}};
const card = { welcome_offer:{bonus_points:100000} };

// --- existing gate behaviour
assert.equal(assessCandidate(c,card,true,now).status,'unchanged');
assert.equal(assessCandidate(c,card,true,now).coverage_action,'none');
assert.equal(assessCandidate(c,undefined,true,now).coverage_action,'none');
assert.equal(assessCandidate({...c,fields:{'welcome_offer.bonus_points':150000}},card,true,now).status,'review_delta');
assert.equal(assessCandidate({...c,evidence:{...c.evidence,audience:'targeted'}},card,true,now).status,'needs_verification');
assert.equal(assessCandidate({...c,evidence:{...c.evidence,checked_at:'2026-08-01'}},card,true,now).status,'needs_verification');
assert.equal(assessCandidate({...c,evidence:{...c.evidence,conflicts:true}},card,true,now).status,'needs_verification');
assert.equal(assessCandidate({...c,fields:{unexpected:5}},card,true,now).status,'needs_verification');
assert.equal(assessCandidate(c,card,true,now).fingerprint,assessCandidate({...c,evidence:{...c.evidence,checked_at:'2026-09-13T18:00Z'}},card,true,now).fingerprint);

// --- dedup across URLs: same card+field+value+audience => same fingerprint, regardless of evidence URL
const delta = {...c,fields:{'welcome_offer.bonus_points':150000}};
const viaChase = assessCandidate(delta,card,true,now);
const viaOtherChasePage = assessCandidate({...delta,evidence:{...delta.evidence,url:'https://www.chase.com/personal/credit-cards/sapphire/reserve?iCELL=61FY'}},card,true,now);
assert.equal(viaChase.fingerprint,viaOtherChasePage.fingerprint);
assert.equal(viaChase.changes[0].fingerprint,changeFingerprint('chase-sapphire-reserve','welcome_offer.bonus_points','150,000','public'));
assert.notEqual(viaChase.fingerprint,assessCandidate({...delta,evidence:{...delta.evidence,audience:'targeted'}},card,true,now).fingerprint);
assert.notEqual(viaChase.fingerprint,assessCandidate({...delta,fields:{'welcome_offer.bonus_points':125000}},card,true,now).fingerprint);
// ledger: first sighting notifies, repeat (even from another URL) is suppressed, status change re-notifies
let ledger = emptyLedger();
assert.equal(shouldNotify(viaChase,ledger),true);
ledger = updateLedger(ledger,[{...viaChase,notify:true}],'2026-09-13T20:00:00.000Z');
assert.equal(shouldNotify(viaOtherChasePage,ledger),false);
const entry = Object.values(ledger.entries)[0];
assert.equal(entry.first_seen,'2026-09-13T20:00:00.000Z'); assert.equal(entry.last_notified,'2026-09-13T20:00:00.000Z'); assert.equal(entry.status,'review_delta');
const later = updateLedger(ledger,[{...viaOtherChasePage,notify:false}],'2026-09-14T20:00:00.000Z');
assert.equal(Object.values(later.entries)[0].first_seen,'2026-09-13T20:00:00.000Z'); assert.equal(Object.values(later.entries)[0].last_seen,'2026-09-14T20:00:00.000Z');
assert.equal(Object.values(later.entries)[0].last_notified,'2026-09-13T20:00:00.000Z');
const unverifiedSame = assessCandidate({...delta,evidence:{...delta.evidence,conflicts:true}},card,true,now);
assert.equal(shouldNotify(unverifiedSame,ledger),true); // status changed review_delta -> needs_verification
assert.equal(shouldNotify(assessCandidate(c,card,true,now),emptyLedger()),false); // unchanged is never actionable
// same change from a blog URL and the official URL in one batch: only the verified one notifies, and the ledger keeps its status
const fromBlog = assessCandidate({...delta,evidence:{...delta.evidence,url:'https://www.doctorofcredit.com/x/'}},card,true,now);
assert.equal(fromBlog.fingerprint,viaChase.fingerprint);
const batch = dedupeBatch([{...fromBlog,notify:true},{...viaChase,notify:true}]);
assert.deepEqual(batch.map(r=>[r.status,r.notify,r.batch_duplicate_of]),[['needs_verification',false,1],['review_delta',true,null]]);
const batchLedger = updateLedger(emptyLedger(),batch,'2026-09-13T20:00:00.000Z');
assert.equal(Object.values(batchLedger.entries)[0].status,'review_delta');
const rerun = dedupeBatch([{...fromBlog,notify:shouldNotify(fromBlog,batchLedger)},{...viaChase,notify:shouldNotify(viaChase,batchLedger)}]);
assert.deepEqual(rerun.map(r=>r.notify),[false,false]);

// --- numeric normalization: numeric strings vs numbers are not deltas
assert.equal(normalizeNumber('$1,000'),1000); assert.equal(normalizeNumber('100k'),100000); assert.equal(normalizeNumber(' 95 '),95); assert.equal(normalizeNumber(''),null);
assert.equal(assessCandidate({...c,fields:{'welcome_offer.bonus_points':'100,000'}},card,true,now).status,'unchanged');
const cashCard = { annual_fee: 95, welcome_offer:{ cash_bonus: 1000, spending_requirement: 10000, time_period_months: 3, is_elevated: false } };
const cash = {...c,card_id:'capital-one-spark-cash',evidence:{...c.evidence,url:'https://www.capitalone.com/small-business/credit-cards/spark-cash/'}};
assert.equal(assessCandidate({...cash,fields:{annual_fee:'$95','welcome_offer.cash_bonus':'$1,000','welcome_offer.spend_requirement':'10000','welcome_offer.time_period_months':'3','welcome_offer.is_elevated':'false'}},cashCard,true,now).status,'unchanged');
const cashDelta = assessCandidate({...cash,fields:{'welcome_offer.cash_bonus':'1500','welcome_offer.is_elevated':true,'welcome_offer.normal_bonus_points':'1000'}},cashCard,true,now);
assert.equal(cashDelta.status,'review_delta');
assert.deepEqual(cashDelta.changes.map(ch=>ch.field),['welcome_offer.cash_bonus','welcome_offer.is_elevated','welcome_offer.normal_bonus_points']);
// cosmetic fields are ignored (not deltas, not "unknown")
const cosmetic = assessCandidate({...c,fields:{'welcome_offer.bonus_points':100000,'welcome_offer.last_verified':'2026-09-13','welcome_offer.notes':['x'],'welcome_offer.confidence':'high',next_review:'2026-10-01'}},card,true,now);
assert.equal(cosmetic.status,'unchanged'); assert.deepEqual(cosmetic.unknownFields,[]); assert.equal(cosmetic.ignoredFields.length,4);

// --- expiry normalization
assert.equal(normalizeDate('2026-07-15T13:41:49.975000+00:00'),'2026-07-15'); assert.equal(normalizeDate('9/30/2026'),'2026-09-30'); assert.equal(normalizeDate('1/13/27'),'2027-01-13');
assert.deepEqual(normalizeExpiry({expires:'2026-09-30',expires_at:'2026-09-30',expiry_date:'2026-09-30T00:00:00Z'}),{value:'2026-09-30',sources:{expires:'2026-09-30',expires_at:'2026-09-30',expiry_date:'2026-09-30'},conflict:false});
assert.deepEqual(normalizeExpiry({expires:'2026-10-05',elevated_until:'2026-09-30'}).value,'2026-09-30');
assert.equal(normalizeExpiry({expires:'2026-10-05',elevated_until:'2026-09-30'}).conflict,true);
assert.equal(normalizeExpiry({expires:null}).value,null);
const hilton = { welcome_offer:{ bonus_points: 70000, expires:'2027-01-13', elevated_until:'2027-01-13' } };
const hc = {...c,card_id:'amex-hilton-honors',evidence:{...c.evidence,url:'https://www.hilton.com/en/hilton-honors/credit-cards/'}};
assert.equal(assessCandidate({...hc,fields:{'welcome_offer.bonus_points':70000,'welcome_offer.expires_at':'1/13/2027'}},hilton,true,now).status,'unchanged');
const moved = assessCandidate({...hc,fields:{'welcome_offer.expiry_date':'2027-02-28'}},hilton,true,now);
assert.equal(moved.status,'review_delta'); assert.equal(moved.changes[0].field,'welcome_offer.expiry'); assert.equal(moved.changes[0].old_value,'2027-01-13');
assert.ok(assessCandidate({...hc,fields:{'welcome_offer.expires':'2027-01-13','welcome_offer.expires_at':'2027-02-01'}},hilton,true,now).reasons.includes('conflicting_alias_values:welcome_offer.expiry'));
const exp = expiryReport([
  { card_id:'a-expired-elevated', welcome_offer:{ expires:'2026-09-07', is_elevated:true, offer_status:'public_limited_time' } },
  { card_id:'b-expired-handled', welcome_offer:{ expires:'2026-07-29', is_elevated:false, offer_status:'expired_review_required' } },
  { card_id:'c-soon', welcome_offer:{ expires_at:'2026-09-30', offer_status:'public_limited_time' } },
  { card_id:'d-focus', welcome_offer:{ elevated_until:'2026-10-20' } },
  { card_id:'e-far', welcome_offer:{ expiry_date:'2027-01-13' } },
  { card_id:'f-none', welcome_offer:{ expires:null } },
  { card_id:'g-conflict', welcome_offer:{ expires:'2026-10-01', elevated_until:'2026-09-30', is_elevated:true } },
],'2026-09-29');
assert.deepEqual(exp.expired.map(i=>[i.card_id,i.priority,i.days_left]),[['b-expired-handled','low',-62],['a-expired-elevated','high',-22]].sort((x,y)=>(x[2] as number)-(y[2] as number)));
assert.deepEqual(exp.expiring_soon.map(i=>[i.card_id,i.days_left,i.priority]),[['c-soon',1,'high'],['g-conflict',1,'high']]);
assert.deepEqual(exp.focus.map(i=>[i.card_id,i.days_left]),[['d-focus',21]]);
assert.deepEqual(exp.alias_conflicts.map(i=>i.card_id),['g-conflict']);
assert.equal(exp.summary.expired_high_priority,1);

// --- official-domain allowlist
assert.equal(isOfficialUrl('https://www.americanexpress.com/us/credit-cards/card/hilton-honors/'),true);
assert.equal(isOfficialUrl('https://creditcards.aa.com/credit-cards/'),true);
assert.equal(isOfficialUrl('https://cards.barclaycardus.com/banking/cards/jetblue-premier-card/'),true);
assert.equal(isOfficialUrl('https://fakeaa.com/offer'),false);
assert.equal(isOfficialUrl('https://americanexpress.com.evil.example/offer'),false);
assert.equal(isOfficialUrl('https://www.doctorofcredit.com/x/'),false);
assert.equal(isOfficialUrl('https://offers.barclaysus.com/x',['barclays*.com']),true);
assert.equal(isOfficialUrl('https://barclays.evil.net/x',['barclays*.com']),false);
const blog = assessCandidate({...delta,evidence:{...delta.evidence,url:'https://www.doctorofcredit.com/chase-sapphire-reserve-150k/'}},card,true,now);
assert.equal(blog.status,'needs_verification'); assert.ok(blog.reasons.includes('official_claim_from_non_allowlisted_domain')); assert.equal(blog.official_domain,false);
assert.equal(assessCandidate({...delta,evidence:{...delta.evidence,url:'https://www.doctorofcredit.com/x/'}},card,true,now,{officialDomains:['doctorofcredit.com']}).status,'review_delta');
assert.equal(viaChase.official_domain,true);

// --- pending queue classification
const woBefore = { bonus_points: 60000, spending_requirement: 3000, time_period_months: 3, description: 'a', notes: ['x'], last_verified: '2026-06-01' };
assert.equal(classifyPending({ card_id:'x', diff:{ changes:[] } }).klass,'no_changes');
assert.equal(classifyPending({ card_id:'x', diff:{ changes:[{ path:'welcome_offer', before: woBefore, after:{ ...woBefore, bonus_points:'60,000', description:'b', notes:['y'], last_verified:'2026-07-01' } }] } }).klass,'cosmetic_only');
assert.equal(classifyPending({ card_id:'x', diff:{ changes:[{ path:'welcome_offer', before: woBefore, after:{ ...woBefore, bonus_points: 75000 } }] } }).klass,'substantive');
const dupA = { card_id:'x', run_id:'2026-07-03T00-00-00Z-x', diff:{ changes:[{ path:'welcome_offer', before: woBefore, after:{ ...woBefore, bonus_points: 75000, notes:['old'] } }] } };
const dupB = { card_id:'x', run_id:'2026-07-08T00-00-00Z-x', diff:{ changes:[{ path:'welcome_offer', before: woBefore, after:{ ...woBefore, bonus_points: 75000, notes:['new'] } }] } };
const plan = planPendingArchive([{ file:'a.json', artifact: dupA }, { file:'b.json', artifact: dupB }, { file:'c.json', artifact:{ card_id:'y', diff:{ changes:[] } } }]);
assert.deepEqual(plan.map(p=>[p.file,p.action,p.reason]),[['a.json','archive','duplicate_of:b.json'],['b.json','keep','substantive'],['c.json','archive','no_changes']]);

console.log('offer review gate: passed');
