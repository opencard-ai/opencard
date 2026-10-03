/** Checks reachability of every https source URL in data/cards (plain HTTP GET, redirects followed).
 *   npx tsx scripts/audit/url-check.ts [--out artifacts/audit/<date>-url-check.json] [--official-only]
 * Same host requests are serialized 1.5 s apart; hosts run in parallel. 401/403/429 = bot-blocked, not broken. */
import fs from 'node:fs';
import path from 'node:path';
import { samePage } from '../offer-watch/collect';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const out = arg('--out') || `artifacts/audit/${today}-url-check.json`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SKIP_HOSTS = /nerdwallet|thepointsguy|uscreditcardguide|forbes|wallethub|businessinsider|cnn\.com|creditkarma|bankrate|upgradedpoints|frequentmiler|doctorofcredit|awardwallet|reddit|maxrewards|yahoo|usnews|cnbc|motleyfool|lendingtree|onemileatatime/i;
const jobs: Array<{ card_id: string; url: string }> = [];
for (const f of fs.readdirSync('data/cards').filter(f => f.endsWith('.json'))) {
  const c = JSON.parse(fs.readFileSync(path.join('data/cards', f), 'utf8'));
  const urls = (Array.isArray(c.sources) ? c.sources : []).map((s: any) => (typeof s === 'string' ? s : s?.url)).filter((u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u));
  for (const url of new Set<string>(urls)) { let host = ''; try { host = new URL(url).hostname; } catch { continue; } if (process.argv.includes('--official-only') && SKIP_HOSTS.test(host)) continue; jobs.push({ card_id: c.card_id, url }); }
}
const byHost = new Map<string, typeof jobs>();
for (const j of jobs) { const h = new URL(j.url).hostname; (byHost.get(h) || byHost.set(h, []).get(h)!).push(j); }
const results: any[] = [];
async function check(j: { card_id: string; url: string }) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(j.url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' } });
    const final_url = r.url || j.url;
    let body = ''; try { body = (await r.text()).slice(0, 200000); } catch { /* ignore */ }
    const notFoundPage = /page (?:not found|cannot be found|you requested (?:could not|cannot) be found)|404 error|we can.t find (?:that|the) page/i.test(body.replace(/<[^>]+>/g, ' ').slice(0, 20000));
    return { ...j, status: r.status, final_url, same_page: samePage(j.url, final_url), soft_404: r.ok && notFoundPage, blocked: [401, 403, 429].includes(r.status) };
  } catch (e: any) { return { ...j, status: null, error: String(e?.name === 'AbortError' ? 'timeout' : e?.cause?.code || e?.message || e) }; }
  finally { clearTimeout(t); }
}
async function main() {
await Promise.all([...byHost.values()].map(async list => { for (const j of list) { results.push(await check(j)); await new Promise(r => setTimeout(r, 1500)); } }));
results.sort((a, b) => a.card_id.localeCompare(b.card_id));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ checked_at: new Date().toISOString(), count: results.length, results }, null, 2)}\n`);
const s = { ok: 0, redirected_elsewhere: 0, http_404_410: 0, soft_404: 0, blocked: 0, other_http: 0, error: 0 };
for (const r of results) { if (r.error) s.error++; else if (r.status === 404 || r.status === 410) s.http_404_410++; else if (r.blocked) s.blocked++; else if (r.status >= 400) s.other_http++; else if (r.same_page === false) s.redirected_elsewhere++; else if (r.soft_404) s.soft_404++; else s.ok++; }
console.log(out, results.length, JSON.stringify(s));
}
main().catch(e => { console.error(e); process.exit(1); });
