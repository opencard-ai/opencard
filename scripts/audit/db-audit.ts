/** Deterministic card-database audit (read-only). Writes artifacts/audit/<date>-db-audit.{json,md}.
 *   npx tsx scripts/audit/db-audit.ts [--today YYYY-MM-DD] [--urls artifacts/audit/<date>-url-check.json]
 * URL reachability comes from scripts/audit/url-check.ts (optional input). */
import fs from 'node:fs';
import path from 'node:path';
import { expiryReport } from '../offer-watch/gate';
import { recomputeEstimatedValue } from '../../lib/cpp-rates';
import { INDEXABLE_CARD_IDS } from '../../lib/indexable-cards';

type Card = Record<string, any>;
type Sev = 'high' | 'medium' | 'low';
interface Finding { card_id: string; type: string; severity: Sev; field?: string; detail: string; value?: unknown }

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const today = arg('--today') || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const DIR = 'data/cards';
const cards: Card[] = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const findings: Finding[] = [];
const add = (card: Card, type: string, severity: Sev, detail: string, field?: string, value?: unknown) => findings.push({ card_id: card.card_id, type, severity, field, detail, value });
const closed = (c: Card) => c.status === 'discontinued' || c.discontinued === true;
const dayDiff = (iso: string) => (Date.parse(today) - Date.parse(String(iso).slice(0, 10))) / 86400000;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim();

export const OFFICIAL = ['americanexpress.com', 'chase.com', 'citi.com', 'aa.com', 'capitalone.com', 'usbank.com', 'bankofamerica.com', 'barclaycardus.com', 'barclays.com', 'barclaycard.com', 'wellsfargo.com', 'bilt.com', 'biltrewards.com', 'discover.com', 'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'delta.com', 'united.com', 'southwest.com', 'alaskaair.com', 'jetblue.com', 'aircanada.com', 'morganstanley.com',
  'synchrony.com', 'syf.com', 'mysynchrony.com', 'comenity.net', 'bread.com', 'breadfinancial.com', 'navyfederal.org', 'penfed.org', 'usaa.com', 'pnc.com', 'td.com', 'tdbank.com', 'truist.com', 'goldmansachs.com', 'apple.com', 'robinhood.com', 'petalcard.com', 'mission-lane.com', 'missionlane.com', 'creditonebank.com', 'firstbankcard.com', 'fnbo.com', 'cardless.com', 'imprint.co', 'x1.co', 'venmo.com', 'paypal.com', 'amazon.com', 'target.com', 'costco.com', 'sams club.com', 'samsclub.com', 'kohls.com', 'macys.com', 'luxurycard.com', 'jpmorgan.com', 'privatebank.jpmorgan.com', 'hsbc.com', 'us.hsbc.com', 'citizensbank.com', 'regions.com', 'fifththird.com', 'key.com', 'bmo.com', 'firsttechfed.com', 'alliantcreditunion.org', 'becu.org', 'dcu.org', 'sofi.com', 'upgrade.com', 'chime.com', 'coinbase.com', 'gemini.com', 'americanairlines.com', 'emirates.com', 'aerlingus.com', 'iberia.com', 'cathaypacific.com', 'britishairways.com', 'flyfrontier.com', 'spirit.com', 'hawaiianairlines.com', 'royalcaribbean.com', 'celebritycruises.com', 'norwegiancreditcard.com', 'wyndhamhotels.com', 'choicehotels.com', 'verizon.com', 'att.com', 'tmobile.com', 'brex.com', 'ramp.com', 'mercury.com', 'atmosrewards.com', 'carecredit.com', 'ulta.com', 'kayak.com', 'oldnavy.gap.com', 'gap.com', 'bananarepublic.gap.com', 'athleta.gap.com', 'gapcard.com', 'aarp.org', 'pnc.com', 'truist.com', 'sears.com', 'searscard.com', 'shopyourway.com', 'bestbuy.com', 'ebay.com', 'lowes.com', 'homedepot.com', 'nordstrom.com', 'starbucks.com', 'harley-davidson.com', 'disney.com', 'disneyrewards.com', 'uber.com', 'amtrak.com', 'priceline.com', 'expedia.com', 'hotels.com', 'quicksilver.capitalone.com'];
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const isOfficial = (u: string) => { const h = hostOf(u); return !!h && OFFICIAL.some(d => h === d || h.endsWith('.' + d)); };
const urlsOf = (c: Card): string[] => arr(c.sources).map((s: any) => (typeof s === 'string' ? s : s?.url)).filter((u: unknown): u is string => typeof u === 'string');

// issuer brands whose portals/currencies should not appear on another issuer's card
const ISSUER_TERMS: Array<{ issuer: RegExp; terms: RegExp; label: string }> = [
  { issuer: /chase|jpmorgan|j\.?p\.? morgan/i, terms: /\bChase Travel\b|\bUltimate Rewards\b|\bChase Offers\b/i, label: 'Chase' },
  { issuer: /american express|amex/i, terms: /\bAmex Travel\b|\bMembership Rewards\b|\bAmerican Express Travel\b|\bAmex Offers\b/i, label: 'Amex' },
  { issuer: /capital one/i, terms: /\bCapital One Travel\b|\bCapital One Lounge\b/i, label: 'Capital One' },
  { issuer: /citi/i, terms: /\bCiti Travel\b|\bThankYou\b/i, label: 'Citi' },
  { issuer: /u\.?s\.? bank/i, terms: /\bU\.?S\.? Bank Travel Center\b|\bAltitude Rewards\b/i, label: 'U.S. Bank' },
  { issuer: /wells fargo/i, terms: /\bWells Fargo Rewards\b|\bAutograph Travel\b/i, label: 'Wells Fargo' },
  { issuer: /bank of america|boa/i, terms: /\bPreferred Rewards\b|\bBank of America Travel Center\b/i, label: 'Bank of America' },
];
// Known-ended benefits: [regex, note, issuer filter]
const ENDED: Array<{ rx: RegExp; note: string; issuer?: RegExp }> = [
  { rx: /\bgogo\b|boingo/i, note: 'Gogo/Boingo Wi-Fi card benefits largely ended (e.g. Altitude Reserve Apr 2022)' },
  { rx: /\bsaks\b/i, note: 'Amex Platinum Saks credit discontinued 2026 (repo migrate-clean-rc script)', issuer: /american express/i },
  { rx: /priority pass[^.]{0,60}restaurant|restaurant[^.]{0,60}priority pass/i, note: 'Priority Pass restaurant credits removed for Chase (2023) and Capital One cardholders', issuer: /chase|capital one/i },
  { rx: /global entry[^.]{0,80}\$100\b|\$100\b[^.]{0,80}(global entry|tsa precheck)/i, note: 'Global Entry fee is $120 since Oct 2024; many issuers raised the credit to $120 (verify per card)' },
];
const textFields = (c: Card): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  const push = (f: string, v: unknown) => { if (typeof v === 'string' && v) out.push([f, v]); };
  push('welcome_offer.description', c.welcome_offer?.description);
  arr(c.earning_rates).forEach((r: any, i: number) => { push(`earning_rates[${i}].category`, r?.category); push(`earning_rates[${i}].notes`, r?.notes); });
  arr(c.recurring_credits).forEach((r: any, i: number) => { push(`recurring_credits[${i}].name`, r?.name); push(`recurring_credits[${i}].description`, r?.description); });
  arr(c.travel_benefits?.other_benefits).forEach((b: any, i: number) => { push(`travel_benefits.other_benefits[${i}]`, `${b?.name ?? ''}: ${b?.description ?? ''}`); });
  arr(c.travel_benefits?.lounge_access).forEach((b: any, i: number) => push(`travel_benefits.lounge_access[${i}]`, typeof b === 'string' ? b : `${b?.name ?? ''} ${b?.type ?? ''} ${b?.discount ?? ''}`));
  return out;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const NUM = (s: string) => Number(s.replace(/,/g, '')) * (/k$/i.test(s) ? 1000 : 1);

for (const c of cards) {
  const wo = c.welcome_offer || {};
  // ---- duplicates inside a card
  for (const [f, v] of [['earning_rates', c.earning_rates], ['recurring_credits', c.recurring_credits], ['travel_benefits.lounge_access', c.travel_benefits?.lounge_access], ['travel_benefits.other_benefits', c.travel_benefits?.other_benefits], ['sources', c.sources]] as const)
    if (v !== undefined && v !== null && !Array.isArray(v)) add(c, 'schema_type', 'medium', `${f} is ${typeof v}, expected array: ${JSON.stringify(v).slice(0, 100)}`, f);
  const rc: any[] = arr(c.recurring_credits);
  const keys = new Map<string, number>();
  rc.forEach(r => { if (r?.credit_key) keys.set(r.credit_key, (keys.get(r.credit_key) || 0) + 1); });
  for (const [k, n] of keys) if (n > 1) add(c, 'duplicate_credit', 'high', `credit_key "${k}" appears ${n}x`, 'recurring_credits');
  for (let i = 0; i < rc.length; i++) for (let j = i + 1; j < rc.length; j++) {
    const a = rc[i], b = rc[j];
    if (!a || !b || a.is_free_night || b.is_free_night) continue;
    const sameMoney = Number(a.amount) > 0 && a.amount === b.amount && a.frequency === b.frequency;
    const core = (x: any) => norm(x.name).replace(/\$?\d+|\b(annual|yearly|credit|credits|statement|the|up to|per year|monthly)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const ca = core(a), cb = core(b);
    const nameSim = !!ca && !!cb && (ca === cb || ca.includes(cb) || cb.includes(ca));
    const catSame = a.category === b.category;
    if ((sameMoney && nameSim) || (nameSim && catSame && a.frequency === b.frequency)) add(c, 'duplicate_credit', 'high', `"${a.name}" ($${a.amount}/${a.frequency}) and "${b.name}" ($${b.amount}/${b.frequency}) look like the same credit`, 'recurring_credits', [a.credit_key, b.credit_key]);
  }
  for (const r of rc) {
    const d = String(r?.description ?? '') + ' ' + String(r?.name ?? '');
    if (r?.frequency === 'annual' && Number(r.amount) > 0 && Number(r.amount) <= 50 && /\bmonthly\b|\/\s?month|per month|each month|a month/i.test(d) && !/\$\s?\d+\s*(?:\/|per)\s*(?:year|yr)/i.test(String(r.description ?? '').slice(0, 15)))
      add(c, 'credit_frequency_mismatch', 'high', `"${r.name}" amount $${r.amount} frequency=annual but description says monthly: "${String(r.description).slice(0, 110)}"`, 'recurring_credits', r.credit_key);
  }
  const er: any[] = arr(c.earning_rates);
  const cats = new Map<string, number>();
  er.forEach(r => { const k = norm(r?.category); cats.set(k, (cats.get(k) || 0) + 1); });
  for (const [k, n] of cats) if (n > 1 && k) add(c, 'duplicate_earning_rate', 'medium', `earning category "${k}" listed ${n}x`, 'earning_rates');
  const ob: any[] = arr(c.travel_benefits?.other_benefits);
  const obn = new Map<string, number>();
  ob.forEach(b => { const k = norm(b?.name); obn.set(k, (obn.get(k) || 0) + 1); });
  for (const [k, n] of obn) if (n > 1 && k) add(c, 'duplicate_benefit', 'low', `benefit "${k}" listed ${n}x`, 'travel_benefits.other_benefits');
  const la: any[] = arr(c.travel_benefits?.lounge_access);
  const lan = new Map<string, number>();
  la.forEach(b => { const k = norm(typeof b === 'string' ? b : b?.name); lan.set(k, (lan.get(k) || 0) + 1); });
  for (const [k, n] of lan) if (n > 1 && k) add(c, 'duplicate_benefit', 'low', `lounge "${k}" listed ${n}x`, 'travel_benefits.lounge_access');
  // recurring credit present in hotel status / benefits twice handled by validate-all

  // ---- wrong issuer references
  for (const [f, text] of textFields(c)) for (const t of ISSUER_TERMS) {
    if (t.issuer.test(String(c.issuer)) || t.issuer.test(String(c.name))) continue;
    const m = text.match(t.terms);
    if (!m) continue;
    // transfer-partner mentions (e.g. "transfer from Chase Ultimate Rewards" on a co-brand hotel card) are legitimate context
    if (/transfer/i.test(text) && /rewards|points/i.test(m[0])) continue;
    add(c, 'wrong_issuer_reference', 'high', `${t.label} term "${m[0]}" on a ${c.issuer} card: "${text.slice(0, 140)}"`, f);
  }
  // ---- network
  const nm = String(c.name);
  const net = String(c.network || '').toLowerCase();
  const nameNet = /\bvisa\b/i.test(nm) ? 'visa' : /mastercard|world elite|world legend/i.test(nm) ? 'mastercard' : /american express|\bamex\b/i.test(nm) && !/visa|mastercard/i.test(nm) ? 'amex' : null;
  if (nameNet && net && !net.includes(nameNet === 'amex' ? 'am' : nameNet)) add(c, 'network_mismatch', 'medium', `name says ${nameNet}, network="${c.network}"`, 'network');
  if (!['visa', 'mastercard', 'amex', 'american express', 'discover'].includes(net)) add(c, 'network_unusual', 'low', `network="${c.network}"`, 'network');

  // ---- impossible / suspicious values
  const fee = c.annual_fee;
  if (typeof fee !== 'number' || fee < 0 || fee > 1500) add(c, 'impossible_value', 'high', `annual_fee=${JSON.stringify(fee)}`, 'annual_fee');
  if (typeof c.foreign_transaction_fee === 'number' && (c.foreign_transaction_fee < 0 || c.foreign_transaction_fee > 5)) add(c, 'impossible_value', 'medium', `foreign_transaction_fee=${c.foreign_transaction_fee}`, 'foreign_transaction_fee');
  const bp = wo.bonus_points, sp = wo.spending_requirement, mo = wo.time_period_months;
  if (bp !== undefined && bp !== null && (typeof bp !== 'number' || bp < 0 || bp > 500000)) add(c, 'impossible_value', 'high', `bonus_points=${JSON.stringify(bp)}`, 'welcome_offer.bonus_points');
  if (sp !== undefined && sp !== null && (typeof sp !== 'number' || sp < 0 || sp > 30000)) add(c, 'impossible_value', 'medium', `spending_requirement=${JSON.stringify(sp)}`, 'welcome_offer.spending_requirement');
  if (!closed(c) && typeof bp === 'number' && bp >= 1000 && (typeof sp !== 'number' || sp > 0)) {
    if (typeof mo !== 'number' || mo < 1 || mo > 15) add(c, 'impossible_value', 'medium', `bonus ${bp} but time_period_months=${JSON.stringify(mo)}`, 'welcome_offer.time_period_months');
    if (sp === 0 && !/first purchase|no minimum|any purchase|approval|account opening|first year|anniversary|match/i.test(String(wo.description))) add(c, 'suspicious_value', 'low', `bonus ${bp} with spending_requirement 0`, 'welcome_offer.spending_requirement');
  }
  // description vs structured fields
  const desc = String(wo.description || '');
  if (!closed(c) && desc && typeof bp === 'number' && bp >= 1000) {
    const m = desc.match(/([\d,]{4,}|\d+k)\s*(?:bonus\s*)?(?:[A-Z][\w®™ ]{0,30}\s)?(?:points|miles|pts)/i);
    if (m && NUM(m[1]) !== bp && !/up to|as high as|plus|\+|and|after|additional|total/i.test(desc.slice(0, desc.indexOf(m[1])))) add(c, 'description_mismatch', 'medium', `description says ${m[1]} but bonus_points=${bp}: "${desc.slice(0, 140)}"`, 'welcome_offer');
  }
  if (!closed(c) && desc && typeof sp === 'number' && sp > 0) {
    const m = desc.match(/(?:spend(?:ing)?|purchases? of|after)\s*\$([\d,]+k?)/i);
    if (m && NUM(m[1]) !== sp && NUM(m[1]) >= 100) add(c, 'description_mismatch', 'medium', `description spend $${m[1]} but spending_requirement=${sp}: "${desc.slice(0, 140)}"`, 'welcome_offer');
  }
  // ---- value vs points*cpp
  const ev = wo.estimated_value ?? wo.bonus_value;
  if (!closed(c) && typeof bp === 'number' && bp > 0 && typeof ev === 'number' && ev > 0) {
    const expect = recomputeEstimatedValue(bp, wo.point_program);
    if (expect && (ev / expect > 2 || ev / expect < 0.5)) add(c, 'value_inconsistent', 'low', `estimated_value=${ev} vs ${bp} ${wo.point_program ?? '(no program)'} ≈ $${expect}`, 'welcome_offer.estimated_value');
  }
  if (closed(c) && typeof bp === 'number' && bp > 0) add(c, 'discontinued_with_offer', 'high', `closed card still has bonus_points=${bp}`, 'welcome_offer');
  // ---- currency mismatch
  const prog = String(wo.point_program || '').toLowerCase();
  if (desc && prog) {
    const descMiles = /\bmiles\b/i.test(desc), descPoints = /\bpoints\b/i.test(desc), descCash = /cash ?back|statement credit|\$[\d,]+ (?:bonus|cash)/i.test(desc);
    const progMiles = /miles|skymiles|aadvantage|mileageplus|mileage/.test(prog), progCash = /cash/.test(prog);
    if (progMiles && descPoints && !descMiles && !/hotel|points? (?:\+|and)/i.test(desc)) add(c, 'currency_mismatch', 'medium', `program "${wo.point_program}" (miles) but description says points: "${desc.slice(0, 120)}"`, 'welcome_offer');
    if (!progMiles && !progCash && descMiles && !descPoints && !/venture|miles rewards|capital one/i.test(prog + ' ' + c.name)) add(c, 'currency_mismatch', 'medium', `program "${wo.point_program}" but description says miles: "${desc.slice(0, 120)}"`, 'welcome_offer');
    if (progCash && typeof bp === 'number' && bp >= 1000 && descCash) add(c, 'currency_mismatch', 'medium', `cash program but bonus_points=${bp}: "${desc.slice(0, 120)}"`, 'welcome_offer');
  }
  // ---- stale/ended benefits
  for (const [f, text] of textFields(c)) for (const e of ENDED) {
    if (e.issuer && !e.issuer.test(String(c.issuer))) continue;
    if (e.rx.test(text)) add(c, 'stale_benefit', e.note.startsWith('Global Entry') ? 'low' : 'medium', `${e.note}: "${text.slice(0, 120)}"`, f);
  }
  // ---- discontinued signals without status
  const blob = [c.notes, c._card_status_alert, desc, c.annual_fee_details, c.application_rules?.notes, c.metadata_notes].filter(Boolean).join(' ');
  if (!closed(c) && /(no longer (?:accepting|available|offered)|closed to new|discontinued|not accepting new applications|has been retired)/i.test(blob) && !/may be discontinued|legacy[^.]*url is discontinued/i.test(blob)) add(c, 'discontinued_signal_without_status', 'high', `text suggests closed/discontinued but status=${JSON.stringify(c.status)}: "${blob.match(/.{0,60}(no longer (?:accepting|available|offered)|closed to new|discontinued|not accepting new applications|has been retired|converted to).{0,60}/i)?.[0]}"`, 'status');
  else if (!closed(c) && /may be discontinued|transitioned to|has transitioned|issuer_transition|transferred to/i.test(blob + ' ' + JSON.stringify(c.issuer_transition ?? ''))) add(c, 'possible_issuer_change', 'medium', `"${blob.match(/.{0,60}(may be discontinued|transitioned to|has transitioned|transferred to).{0,60}/i)?.[0] ?? 'issuer_transition set'}"`, 'status');
  // ---- sources
  const urls = urlsOf(c);
  if (!urls.length) add(c, 'missing_sources', 'high', 'no sources', 'sources');
  else if (!urls.some(isOfficial)) add(c, 'no_official_source', closed(c) ? 'low' : 'medium', `sources: ${urls.map(hostOf).join(', ')}`, 'sources');
  for (const u of urls) { if (!/^https:\/\//.test(u)) add(c, 'non_https_source', 'low', u, 'sources'); }
  // ---- dates
  if (c.next_review && dayDiff(c.next_review) > 0) add(c, 'past_next_review', 'low', `next_review ${String(c.next_review).slice(0, 10)} (${Math.round(dayDiff(c.next_review))} days ago)`, 'next_review');
  const lv = c.last_verified || c.last_updated;
  if (!lv) add(c, 'never_verified', 'medium', 'no last_verified', 'last_verified');
  else if (dayDiff(lv) > 150) add(c, 'stale_last_verified', dayDiff(lv) > 365 ? 'medium' : 'low', `last_verified ${String(lv).slice(0, 10)} (${Math.round(dayDiff(lv))} days)`, 'last_verified');
  // fee text consistency
  for (const [f, v] of [['annual_fee_description', c.annual_fee_description], ['annual_fee_details', c.annual_fee_details], ['annual_fee_note', c.annual_fee_note]] as const) {
    if (typeof v !== 'string') continue;
    const nums = [...v.matchAll(/\$([\d,]+)/g)].map(m => NUM(m[1]));
    if (nums.length && typeof fee === 'number' && !nums.includes(fee) && !(fee === 0 && /\$0|no annual fee/i.test(v))) add(c, 'fee_text_mismatch', 'medium', `${f} mentions ${nums.map(n => '$' + n).join('/')} but annual_fee=${fee}: "${v.slice(0, 120)}"`, f);
  }
}
// ---- expired offers still elevated / limited
const exp = expiryReport(cards as any, today);
for (const it of exp.expired) if (it.priority !== 'low') findings.push({ card_id: it.card_id, type: 'expired_offer_still_current', severity: 'high', field: 'welcome_offer.expiry', detail: `expiry ${it.expiry} (${-it.days_left} days ago); ${it.reason}; is_elevated=${it.is_elevated} offer_status=${it.offer_status}` });
for (const it of exp.alias_conflicts) findings.push({ card_id: it.card_id, type: 'expiry_alias_conflict', severity: 'low', field: 'welcome_offer.expiry', detail: JSON.stringify(it.expiry_sources) });
// ---- duplicates across cards
const byName = new Map<string, string[]>(), byUrl = new Map<string, string[]>();
for (const c of cards) {
  const k = norm(String(c.name).replace(/[®™℠]/g, '')).replace(/\b(card|credit|the|from|visa|signature|infinite|mastercard|world)\b/g, '').replace(/\s+/g, ' ').trim();
  const nk = `${k}|$${c.annual_fee}`; (byName.get(nk) || byName.set(nk, []).get(nk)!).push(c.card_id);
  const first = urlsOf(c).find(isOfficial);
  if (first) { const u = first.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase(); (byUrl.get(u) || byUrl.set(u, []).get(u)!).push(c.card_id); }
}
for (const [k, ids] of byName) if (ids.length > 1) for (const id of ids) findings.push({ card_id: id, type: 'duplicate_card_entry', severity: 'medium', field: 'name', detail: `same normalized name "${k}" as ${ids.filter(x => x !== id).join(', ')}` });
for (const [u, ids] of byUrl) if (ids.length > 1) for (const id of ids) findings.push({ card_id: id, type: 'shared_official_url', severity: 'low', field: 'sources', detail: `first official URL ${u} also used by ${ids.filter(x => x !== id).join(', ')}` });
// ---- URL reachability (from url-check.ts)
const urlFile = arg('--urls') || `artifacts/audit/${today}-url-check.json`;
if (fs.existsSync(urlFile)) {
  const res: Array<{ card_id: string; url: string; status: number | null; final_url?: string; error?: string; same_page?: boolean }> = JSON.parse(fs.readFileSync(urlFile, 'utf8')).results;
  for (const r of res) {
    const card = cards.find(c => c.card_id === r.card_id);
    if (!card) continue;
    if (r.status === 404 || r.status === 410) add(card, 'broken_source_url', closed(card) ? 'low' : 'high', `${r.url} -> HTTP ${r.status}`, 'sources');
    else if (r.status && r.status >= 200 && r.status < 400 && r.same_page === false) add(card, 'source_redirects_elsewhere', closed(card) ? 'low' : 'high', `${r.url} -> ${r.final_url}`, 'sources');
    else if (r.error && !/timeout|abort/i.test(r.error)) add(card, 'source_unreachable', 'low', `${r.url}: ${r.error}`, 'sources');
  }
}

// ---- output
const popular = new Set([...INDEXABLE_CARD_IDS, ...cards.filter(c => c.featured).map(c => c.card_id), 'barclays-old-navy-navyist-rewards-mastercard', 'amex-blue-biz-cash']);
const sevRank: Record<Sev, number> = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || Number(popular.has(b.card_id)) - Number(popular.has(a.card_id)) || a.type.localeCompare(b.type) || a.card_id.localeCompare(b.card_id));
const counts: Record<string, Record<Sev, number>> = {};
for (const f of findings) { (counts[f.type] ||= { high: 0, medium: 0, low: 0 })[f.severity]++; }
const out = { generated_at: new Date().toISOString(), today, cards: cards.length, popular: [...popular].sort(), counts, url_check: fs.existsSync(urlFile) ? urlFile : null, findings: findings.map(f => ({ ...f, popular: popular.has(f.card_id) })) };
fs.mkdirSync('artifacts/audit', { recursive: true });
const base = `artifacts/audit/${today}-db-audit`;
fs.writeFileSync(`${base}.json`, `${JSON.stringify(out, null, 2)}\n`);
const md: string[] = [`# Card database audit (${today})`, '', `${cards.length} cards, ${findings.length} findings. "Popular" = curated indexable + featured + cards with GSC impressions.`, '', '| Issue type | High | Medium | Low |', '|---|---|---|---|'];
for (const [t, c] of Object.entries(counts).sort((a, b) => (b[1].high * 100 + b[1].medium * 10 + b[1].low) - (a[1].high * 100 + a[1].medium * 10 + a[1].low))) md.push(`| ${t} | ${c.high} | ${c.medium} | ${c.low} |`);
for (const sev of ['high', 'medium'] as Sev[]) {
  md.push('', `## ${sev === 'high' ? 'High' : 'Medium'} severity`, '');
  for (const f of findings.filter(x => x.severity === sev)) md.push(`- ${popular.has(f.card_id) ? '**[popular]** ' : ''}\`${f.card_id}\` ${f.type}${f.field ? ` (${f.field})` : ''}: ${f.detail.replace(/\|/g, '\\|')}`);
}
md.push('', `Low-severity findings (${findings.filter(f => f.severity === 'low').length}) are listed in the JSON file only.`, '');
fs.writeFileSync(`${base}.md`, md.join('\n'));
console.log(`${base}.json/.md: ${findings.length} findings`);
console.table(counts);
