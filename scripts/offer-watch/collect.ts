/** Fetch official pages from watchlist.json and emit Candidate[] for review.ts.
 * Every source is fetched twice with independent requests; each fetch is recorded as a Confirmation
 * (url, fetch_id, checked_at, ok, extracted values) so apply.ts can enforce the two-fetch guard.
 *   npx tsx scripts/offer-watch/collect.ts [--watchlist file] [--card id] [--out file]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isOfficialUrl, normalizeField, DEFAULT_OFFICIAL_DOMAINS, type Candidate, type Confirmation } from './gate';

export interface WatchPattern { regex: string; groups: Record<string, number> }
export interface WatchSource { url: string; render?: boolean; patterns: WatchPattern[] }
export interface WatchEntry { card_id: string; audience?: string; sources: WatchSource[] }

/** All matches must agree per field; disagreeing matches make the field ambiguous (not confirmed). */
export function extractValues(text: string, source: WatchSource): { values: Record<string, unknown>; ambiguous: string[] } {
  const seen: Record<string, Set<string>> = {};
  for (const pattern of source.patterns) {
    for (const match of text.matchAll(new RegExp(pattern.regex, 'gi'))) {
      for (const [field, group] of Object.entries(pattern.groups)) {
        if (match[group] === undefined) continue;
        (seen[field] ||= new Set()).add(JSON.stringify(normalizeField(field, match[group])));
      }
    }
  }
  const values: Record<string, unknown> = {}; const ambiguous: string[] = [];
  for (const [field, set] of Object.entries(seen)) set.size === 1 ? (values[field] = JSON.parse([...set][0])) : ambiguous.push(field);
  return { values, ambiguous };
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
  return { card_id: entry.card_id, fields, evidence: { url: good[0]?.url ?? entry.sources[0]?.url, checked_at: runAt, official: good.length > 0, audience: entry.audience ?? 'public', conflicts, confirmations } };
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const htmlToText = (html: string) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&reg;/g, '®').replace(/&#8217;|&rsquo;/g, '’').replace(/&#36;/g, '$').replace(/\s+/g, ' ');

async function fetchHttp(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'cache-control': 'no-cache', accept: 'text/html' }, signal: AbortSignal.timeout(45000), redirect: 'follow' });
  return { status: res.status, text: htmlToText(await res.text()) };
}
let browserPromise: Promise<any> | null = null;
async function fetchRendered(url: string) {
  const { default: puppeteer } = await import('puppeteer');
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.OFFER_WATCH_CHROME || (fs.existsSync(systemChrome) ? systemChrome : undefined);
  browserPromise ||= puppeteer.launch({ headless: true, executablePath });
  const browser = await browserPromise;
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const text: string = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script,style,noscript,template').forEach(el => el.remove());
      return (clone.textContent || '').replace(/\s+/g, ' ');
    });
    return { status: res?.status() ?? 0, text };
  } finally { await page.close(); }
}

async function fetchOnce(source: WatchSource, attempt: number, domains: string[]): Promise<Confirmation> {
  const checked_at = new Date().toISOString();
  const fetch_id = `${source.url}#${attempt}@${checked_at}`;
  const official_domain = isOfficialUrl(source.url, domains);
  try {
    const { status, text } = source.render ? await fetchRendered(source.url) : await fetchHttp(source.url);
    if (status < 200 || status >= 400) return { url: source.url, fetch_id, checked_at, ok: false, status, error: `http_${status}`, official_domain, values: {} };
    const { values, ambiguous } = extractValues(text, source);
    return { url: source.url, fetch_id, checked_at, ok: true, status, official_domain, values, ambiguous_fields: ambiguous, content_sha256: createHash('sha256').update(text).digest('hex') };
  } catch (error) {
    return { url: source.url, fetch_id, checked_at, ok: false, error: String((error as Error)?.message || error).slice(0, 200), official_domain, values: {} };
  }
}

async function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const watchFile = arg('--watchlist') || 'scripts/offer-watch/watchlist.json';
  const domainsFile = 'scripts/offer-watch/official-domains.json';
  const domains: string[] = fs.existsSync(domainsFile) ? JSON.parse(fs.readFileSync(domainsFile, 'utf8')).domains : DEFAULT_OFFICIAL_DOMAINS;
  const only = arg('--card');
  const entries: WatchEntry[] = JSON.parse(fs.readFileSync(watchFile, 'utf8')).cards.filter((e: WatchEntry) => !only || e.card_id === only);
  const runAt = new Date().toISOString();
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const confirmations: Confirmation[] = [];
    for (const source of entry.sources) for (const attempt of [1, 2]) confirmations.push(await fetchOnce(source, attempt, domains));
    candidates.push(buildCandidate(entry, confirmations, runAt));
  }
  if (browserPromise) await (await browserPromise).close();
  const out = arg('--out') || `artifacts/offer-watch/candidates-${runAt.slice(0, 10)}.json`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(JSON.stringify({ out, cards: candidates.length, fetches: candidates.flatMap(c => c.evidence.confirmations || []).map(c => ({ url: c.url, ok: c.ok, status: c.status, error: c.error, values: c.values, ambiguous: c.ambiguous_fields })) }, null, 2));
}
if (process.argv[1] && /collect\.ts$/.test(process.argv[1])) main().catch(error => { console.error(error); process.exit(1); });
