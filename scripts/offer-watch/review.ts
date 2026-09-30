/** Offer-watch review (read-only by default).
 * Production baseline = committed HEAD data/cards (or --worktree); coverage = scripts/card-adaptor/cards configs.
 *
 * npx tsx scripts/offer-watch/review.ts [candidates.json] [previous-report.json] [options]
 *   --candidates <file>   Candidate[] input (same as 1st positional)
 *   --previous <file>     prior report; its fingerprints are suppressed (same as 2nd positional)
 *   --ledger [file]       dedup ledger (default artifacts/offer-watch/ledger.json); suppresses repeat notices
 *   --write               persist ledger updates (without it the ledger is only read)
 *   --expiry              print only the deterministic expiry check
 *   --today YYYY-MM-DD    date for the expiry check (default: today in America/Los_Angeles)
 *   --warn-days N / --focus-days N   expiry windows (default 14 / 30)
 *   --domains <file>      official-domain allowlist JSON (default scripts/offer-watch/official-domains.json)
 *   --worktree            read data/cards from the working tree instead of HEAD
 *   --out <file>          also save the JSON report to this path
 * Never sends messages or patches card data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assessCandidate, dedupeBatch, emptyLedger, expiryReport, shouldNotify, updateLedger, DEFAULT_OFFICIAL_DOMAINS, type Candidate, type Ledger } from './gate';

const root = process.cwd();
const DEFAULT_LEDGER = 'artifacts/offer-watch/ledger.json';
const DEFAULT_DOMAINS = 'scripts/offer-watch/official-domains.json';

function parseArgs(argv: string[]) {
  const opts: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const valued = new Set(['--candidates', '--previous', '--today', '--warn-days', '--focus-days', '--domains', '--out']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (valued.has(arg)) { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${arg} needs a value`); opts[arg] = argv[++i]; }
    else if (arg === '--ledger') opts[arg] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : DEFAULT_LEDGER;
    else if (['--write', '--expiry', '--worktree'].includes(arg)) opts[arg] = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  return { opts, positional };
}
const { opts, positional } = parseArgs(process.argv.slice(2));
const str = (key: string) => (typeof opts[key] === 'string' ? opts[key] as string : undefined);
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const laToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const cards = new Map<string, any>();
if (opts['--worktree']) {
  for (const file of fs.readdirSync(path.join(root, 'data/cards')).filter(f => f.endsWith('.json'))) {
    const card = readJson(path.join('data/cards', file));
    if (card.card_id) cards.set(card.card_id, card);
  }
} else {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'data/cards'], { encoding: 'utf8' }).trim().split('\n').filter(f => f.endsWith('.json'));
  for (const file of files) {
    const card = JSON.parse(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 2e6 }));
    if (card.card_id) cards.set(card.card_id, card);
  }
}
const cardSource = opts['--worktree'] ? 'working tree data/cards' : `committed HEAD ${baseline}`;

const today = str('--today') || laToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('--today must be YYYY-MM-DD');
const expiry = expiryReport(cards.values(), today, { warnDays: Number(str('--warn-days') ?? 14), focusDays: Number(str('--focus-days') ?? 30) });

let report: Record<string, unknown>;
let nextLedger: Ledger | null = null;
if (opts['--expiry']) {
  report = { kind: 'offer-watch-expiry', generated_at: new Date().toISOString(), card_source: cardSource, cards_checked: cards.size, ...expiry };
} else {
  const registry = new Set<string>();
  for (const file of fs.readdirSync(path.join(root, 'scripts/card-adaptor/cards')).filter(f => f.endsWith('.json'))) {
    const config = readJson(path.join('scripts/card-adaptor/cards', file));
    if (config.cardId) registry.add(config.cardId);
  }
  const domainsFile = str('--domains') || DEFAULT_DOMAINS;
  const officialDomains: string[] = fs.existsSync(path.resolve(root, domainsFile)) ? readJson(domainsFile).domains : DEFAULT_OFFICIAL_DOMAINS;
  const candidatesFile = str('--candidates') || positional[0];
  const input: Candidate[] = candidatesFile ? readJson(candidatesFile) : [];
  if (!Array.isArray(input)) throw new Error('Expected candidate array');
  const previousFile = str('--previous') || positional[1];
  const previous = previousFile ? readJson(previousFile).results || [] : [];
  const seen = new Set(previous.map((r: any) => r.fingerprint));
  const ledgerFile = str('--ledger');
  const ledger: Ledger = ledgerFile && fs.existsSync(path.resolve(root, ledgerFile)) ? readJson(ledgerFile) : emptyLedger();
  const now = Date.now();
  const results = dedupeBatch(input.map(candidate => {
    const result = assessCandidate(candidate, cards.get(candidate.card_id), registry.has(candidate.card_id), now, { officialDomains });
    const notify = shouldNotify(result, ledger) && !seen.has(result.fingerprint);
    return { ...result, notify };
  }));
  if (ledgerFile) nextLedger = updateLedger(ledger, results, new Date(now).toISOString());
  report = {
    kind: 'offer-watch-review', generated_at: new Date(now).toISOString(), baseline_commit: baseline, card_source: cardSource,
    baseline_note: 'Committed HEAD, not proof of deployed version. Check deployment before claiming production changed.',
    coverage_source: 'scripts/card-adaptor/cards (working tree, including uncommitted configs)',
    official_domains_source: fs.existsSync(path.resolve(root, domainsFile)) ? domainsFile : 'built-in defaults',
    ledger: ledgerFile ? { path: ledgerFile, mode: opts['--write'] ? 'updated' : 'read-only (pass --write to persist)' } : null,
    registry: [...registry].sort(),
    summary: { candidates: results.length, notify: results.filter(r => r.notify).length, by_status: results.reduce((acc: Record<string, number>, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}) },
    results, expiry,
  };
}

const json = JSON.stringify(report, null, 2);
console.log(json);
const out = str('--out');
if (out) { fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true }); fs.writeFileSync(path.resolve(root, out), `${json}\n`); console.error(`report saved: ${out}`); }
if (nextLedger && opts['--write']) {
  const ledgerPath = path.resolve(root, str('--ledger')!);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`);
  console.error(`ledger updated: ${str('--ledger')}`);
}
