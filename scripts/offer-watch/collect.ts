/** Fetch official pages from watchlist.json and emit Candidate[] for review.ts.
 * Every source is fetched twice with independent requests; each fetch is recorded as a Confirmation
 * (url, fetch_id, checked_at, ok, extracted values) so apply.ts can enforce the two-fetch guard.
 * Cards that the expiry check flags (expired, or expiring within 30 days) and that are not on the watchlist are
 * auto-added as hold-only entries using the official URLs in their own `sources` (evidence only, never auto-applied).
 *   npx tsx scripts/offer-watch/collect.ts [--watchlist file] [--card id] [--out file] [--today YYYY-MM-DD] [--no-auto-expiring]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expiryReport, isOfficialUrl, normalizeField, normalizeNumber, DEFAULT_OFFICIAL_DOMAINS, type Candidate, type CardRecord, type Confirmation } from './gate';

export interface WatchPattern { regex: string; groups: Record<string, number>; transforms?: Record<string, 'days_to_months'> }
export interface WatchSource { url: string; render?: boolean; wait?: 'networkidle2' | 'domcontentloaded'; settle_ms?: number; patterns: WatchPattern[] }
export interface WatchEntry { card_id: string; audience?: string; hold_only?: boolean; hold_reason?: string; auto_added?: string; sources: WatchSource[] }

function transform(kind: string | undefined, raw: string): string | undefined {
  if (kind !== 'days_to_months') return raw;
  const days = Number(String(raw).replace(/,/g, ''));
  return Number.isInteger(days) && days > 0 && days % 30 === 0 ? String(days / 30) : undefined;
}

/** All matches must agree per field; disagreeing (or untransformable) matches make the field ambiguous (not confirmed). */
export function extractValues(text: string, source: WatchSource): { values: Record<string, unknown>; ambiguous: string[] } {
  const seen: Record<string, Set<string>> = {};
  for (const pattern of source.patterns) {
    for (const match of text.matchAll(new RegExp(pattern.regex, 'gi'))) {
      for (const [field, group] of Object.entries(pattern.groups)) {
        if (match[group] === undefined) continue;
        const value = transform(pattern.transforms?.[field], match[group]);
        (seen[field] ||= new Set()).add(value === undefined ? '"__untransformable__"' : JSON.stringify(normalizeField(field, value)));
      }
    }
  }
  const values: Record<string, unknown> = {}; const ambiguous: string[] = [];
  for (const [field, set] of Object.entries(seen)) set.size === 1 && !set.has('"__untransformable__"') ? (values[field] = JSON.parse([...set][0])) : ambiguous.push(field);
  return { values, ambiguous };
}

/** Does the page text mention the card's current bonus (e.g. 150,000 / 150000 / 150K / $1,000)? Informational only. */
export function currentBonusVisible(text: string, card: CardRecord | undefined): boolean | undefined {
  const offer = card?.welcome_offer || {};
  const points = normalizeNumber(offer.bonus_points), cash = normalizeNumber(offer.cash_bonus);
  const value = typeof points === 'number' && points > 0 ? points : typeof cash === 'number' && cash > 0 ? cash : null;
  if (value === null) return undefined;
  const variants = [value.toLocaleString('en-US'), String(value)];
  if (value % 1000 === 0) variants.push(`${value / 1000}k`);
  return new RegExp(`(^|[^\\d,.])(${variants.map(v => v.replace(/[,$]/g, m => `\\${m}`)).join('|')})(?![\\d,]*\\d)`, 'i').test(text);
}

/** Candidate fields = values every successful official fetch agrees on; disagreement sets evidence.conflicts. */
export function buildCandidate(entry: WatchEntry, confirmations: Confirmation[], runAt: string): Candidate {
  const good = confirmations.filter(c => c.ok && c.official_domain);
  const fields: Record<string, unknown> = {}; let conflicts = false;
  const allFields = new Set(good.flatMap(c => Object.keys(c.values)));
  for (const field of allFields) {
    const distinct = new Set(good.filter(c => field in c.values).map(c => JSON.stringify(c.values[field])));
    if (distinct.size === 1) fields[field] = JSON.parse([...distinct][0]); else conflicts = true;
  }
  if (good.some(c => c.ambiguous_fields?.length)) conflicts = true;
  const evidence: Candidate['evidence'] = { url: good[0]?.url ?? entry.sources[0]?.url, checked_at: runAt, official: good.length > 0, audience: entry.audience ?? 'public', conflicts, confirmations };
  if (entry.hold_only) { evidence.hold_only = true; evidence.hold_reason = entry.hold_reason ?? 'hold_only'; }
  if (entry.auto_added) evidence.auto_added = entry.auto_added;
  return { card_id: entry.card_id, fields, evidence };
}

/** Pure: hold-only entries for cards the expiry check flags (expired, or expiring within focusDays) that are not already
 * watched and have at least one official https URL in `sources` / `application_url`. Low-priority (already handled) skipped. */
export function autoExpiringEntries(watched: WatchEntry[], cards: CardRecord[], today: string, domains: string[], focusDays = 30): WatchEntry[] {
  const report = expiryReport(cards, today, { warnDays: 14, focusDays });
  const have = new Set(watched.map(e => e.card_id));
  const byId = new Map(cards.map(c => [c.card_id, c]));
  const out: WatchEntry[] = [];
  for (const item of [...report.expired, ...report.expiring_soon, ...report.focus]) {
    if (have.has(item.card_id) || item.priority === 'low') continue;
    const card = byId.get(item.card_id);
    const urls = [...(card?.sources || []).map((s: any) => (typeof s === 'string' ? s : s?.url)), card?.application_url]
      .filter((u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u) && isOfficialUrl(u, domains));
    const unique = [...new Set(urls)].slice(0, 2);
    if (!unique.length) continue;
    have.add(item.card_id);
    out.push({ card_id: item.card_id, hold_only: true, hold_reason: 'auto_added_expiring_no_card_specific_extractor', auto_added: `expiry ${item.expiry} (${item.days_left} days)`,
      sources: unique.map(url => ({ url, render: /americanexpress\.com/.test(url), patterns: [] })) });
  }
  return out;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', dagger: '†', curren: '¤', quot: '"', apos: "'", lt: '<', gt: '>' };
export const htmlToText = (html: string) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m).replace(/[\u200b\u00a0]/g, ' ').replace(/\s+/g, ' ');
/** Issuer bot-block / outage pages (served with HTTP 200 by some issuers). Only consulted when nothing was extracted. */
export const ERROR_PAGE = /Sorry, we are unable to load this page|Access Denied|Request unsuccessful|unusual (?:activity|traffic)|are you a robot|verify you are (?:a )?human|temporarily unavailable/i;
export const isErrorPage = (text: string) => ERROR_PAGE.test(text) || text.trim().length < 400;
/** Same page = same host + path (trailing slash and query ignored). A redirect elsewhere means the product page moved/closed. */
export function samePage(requested: string, final: string): boolean {
  try { const a = new URL(requested), b = new URL(final); return a.host === b.host && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, ''); } catch { return false; }
}

async function fetchHttp(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'cache-control': 'no-cache', accept: 'text/html' }, signal: AbortSignal.timeout(45000), redirect: 'follow' });
  return { status: res.status, text: htmlToText(await res.text()), finalUrl: res.url || url };
}
let browserPromise: Promise<any> | null = null;
async function fetchRendered(source: WatchSource) {
  const { default: puppeteer } = await import('puppeteer');
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.OFFER_WATCH_CHROME || (fs.existsSync(systemChrome) ? systemChrome : undefined);
  browserPromise ||= puppeteer.launch({ headless: true, executablePath });
  const browser = await browserPromise;
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    const res = await page.goto(source.url, { waitUntil: source.wait ?? 'domcontentloaded', timeout: 60000 });
    const readText = (): Promise<string> => page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script,style,noscript,template').forEach(el => el.remove());
      return (clone.textContent || '').replace(/[\u200b\u00a0]/g, ' ').replace(/\s+/g, ' ');
    });
    // Client-rendered offers load late: poll until one of this source's own extractors matches (max settle_ms, default 25 s).
    // Without patterns (auto-added entries) wait a fixed settle_ms (default 8 s).
    const max = source.settle_ms ?? (source.patterns.length ? 25000 : 8000);
    const regexes = source.patterns.map(p => new RegExp(p.regex, 'i'));
    const started = Date.now();
    let text = await readText();
    while (Date.now() - started < max && !(regexes.length && regexes.every(re => re.test(text))) && !(Date.now() - started > 5000 && isErrorPage(text))) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      text = await readText();
    }
    return { status: res?.status() ?? 0, text, finalUrl: page.url() as string };
  } finally { await page.close(); }
}

const lastHit = new Map<string, number>();
async function politeGap(url: string, gapMs = 3000) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastHit.set(host, Date.now());
}

async function fetchOnce(source: WatchSource, attempt: number, domains: string[], card?: CardRecord): Promise<Confirmation> {
  await politeGap(source.url);
  const checked_at = new Date().toISOString();
  const fetch_id = `${source.url}#${attempt}@${checked_at}`;
  const official_domain = isOfficialUrl(source.url, domains);
  try {
    const { status, text, finalUrl } = source.render ? await fetchRendered(source) : await fetchHttp(source.url);
    const base = { url: source.url, fetch_id, checked_at, status, official_domain, final_url: finalUrl };
    if (status < 200 || status >= 400) return { ...base, ok: false, error: `http_${status}`, values: {} };
    if (!samePage(source.url, finalUrl)) return { ...base, ok: false, error: `redirected_to_other_page: ${finalUrl}`, values: {} };
    const { values, ambiguous } = extractValues(text, source);
    if (!Object.keys(values).length && !ambiguous.length && isErrorPage(text)) return { ...base, ok: false, error: 'issuer_error_or_block_page', values: {} };
    return { ...base, ok: true, values, ambiguous_fields: ambiguous, content_sha256: createHash('sha256').update(text).digest('hex'), observed: { current_bonus_visible: currentBonusVisible(text, card) } };
  } catch (error) {
    return { url: source.url, fetch_id, checked_at, ok: false, error: String((error as Error)?.message || error).slice(0, 200), official_domain, values: {} };
  }
}

const laToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
function loadCards(dir = 'data/cards'): CardRecord[] {
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).flatMap(f => { try { return [JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]; } catch { return []; } });
}

async function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const watchFile = arg('--watchlist') || 'scripts/offer-watch/watchlist.json';
  const domainsFile = 'scripts/offer-watch/official-domains.json';
  const domains: string[] = fs.existsSync(domainsFile) ? JSON.parse(fs.readFileSync(domainsFile, 'utf8')).domains : DEFAULT_OFFICIAL_DOMAINS;
  const only = arg('--card');
  const today = arg('--today') || laToday();
  const cards = loadCards();
  const cardById = new Map(cards.map(c => [c.card_id, c]));
  let entries: WatchEntry[] = JSON.parse(fs.readFileSync(watchFile, 'utf8')).cards;
  const auto = process.argv.includes('--no-auto-expiring') ? [] : autoExpiringEntries(entries, cards, today, domains);
  entries = [...entries, ...auto].filter(e => !only || e.card_id === only);
  const runAt = new Date().toISOString();
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const confirmations: Confirmation[] = [];
    for (const source of entry.sources) for (const attempt of [1, 2]) confirmations.push(await fetchOnce(source, attempt, domains, cardById.get(entry.card_id)));
    candidates.push(buildCandidate(entry, confirmations, runAt));
  }
  if (browserPromise) await (await browserPromise).close();
  const out = arg('--out') || `artifacts/offer-watch/candidates-${today}.json`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(JSON.stringify({ out, today, cards: candidates.length, auto_added: auto.map(e => `${e.card_id}: ${e.auto_added}`),
    per_card: candidates.map(c => ({ card_id: c.card_id, hold_only: c.evidence.hold_only ?? false, fields: c.fields, conflicts: c.evidence.conflicts,
      fetches: (c.evidence.confirmations || []).map(f => `${f.ok ? 'ok' : `FAIL(${f.error})`} ${f.url} ${JSON.stringify(f.values)}${f.ambiguous_fields?.length ? ` ambiguous=${f.ambiguous_fields}` : ''}`) })) }, null, 2));
}
if (process.argv[1] && /collect\.ts$/.test(process.argv[1])) main().catch(error => { console.error(error); process.exit(1); });
