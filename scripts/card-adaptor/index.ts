#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import * as path from 'path';
import { validateCardUpdateArtifact, type ArtifactSourceType, type ArtifactType, type CardUpdateArtifact } from '../../lib/card-update-artifact';

type SourceType = 'issuer' | 'doc' | 'usccg' | 'cnn' | 'tpg' | 'reddit' | 'flyertalk' | 'other';
type Verdict = 'pass' | 'needs_review' | 'blocked';
type FetchBackend = 'auto' | 'scrapling' | 'cloakbrowser';

type SourceSpec = {
  id: string;
  type: SourceType;
  url: string;
  method?: 'get' | 'fetch';
  required?: boolean;
};

type LiveWelcomeOfferCheck = {
  source_type: 'issuer';
  source_url: string;
  source_name: string;
  matched: boolean;
  bonus_points: number | null;
  spending_requirement: number | null;
  time_period_months: number | null;
  evidence: string | null;
  pattern: string | null;
  drifted: boolean;
  drift_fields: string[];
};

type CommunityObservationRule = {
  sourceType: SourceType;
  source: string;
  regex: string;
  stance: string;
  offer_amount?: number;
  spend_requirement?: number;
  spend_window_months?: number;
  excerpt: string;
  confidence: string;
};

type CardConfig = {
  cardId: string;
  cardPath: string;
  mode: string;
  sources: SourceSpec[];
  candidate: Record<string, any>;
  citations: Record<string, string[]>;
  open_questions?: string[];
  community?: {
    summary: string;
    recommended_production_value: Record<string, any>;
    confidence: string;
    ymmv_or_targeted_possible?: boolean;
    conflictStanceIncludes?: string[];
    observations: CommunityObservationRule[];
  };
};

type FieldPolicy = {
  action: 'auto_apply_candidate_if_qa_passes' | 'manual_review_required';
  reason: string;
};

const CONFIG_DIR = path.join('scripts', 'card-adaptor', 'cards');

function usage(): never {
  const cards = listCardIds().join('|') || '<card>';
  console.error(`Usage:
  npm run card-adaptor -- doctor
  npm run card-adaptor -- list
  npm run card-adaptor -- fetch --card <${cards}> [--backend auto|scrapling|cloakbrowser]
  npm run card-adaptor -- extract --run <run-dir>
  npm run card-adaptor -- normalize --run <run-dir>
  npm run card-adaptor -- validate --run <run-dir>
  npm run card-adaptor -- artifact --run <run-dir>
  npm run card-adaptor -- apply --run <run-dir> [--write]

Legacy/advanced:
  npm run card-adaptor -- run --card <card>
  npm run card-adaptor -- scrape --card <card>
  npm run card-adaptor -- community-check --run <run-dir>
  npm run card-adaptor -- qa --run <run-dir>
  npm run card-adaptor -- apply-plan --run <run-dir>
  npm run card-adaptor -- review --run <run-dir>
  npm run card-adaptor -- approval-template --run <run-dir>
  npm run card-adaptor -- artifact-approve --artifact <artifact.json> --reviewer <name> [--notes <text>]
  npm run card-adaptor -- artifact-reject --artifact <artifact.json> --reviewer <name> [--notes <text>]
  npm run card-adaptor -- artifact-apply --artifact <artifact.json> [--write]
  npm run card-adaptor -- run-all
  npm run card-adaptor -- review-index
  npm run card-adaptor -- artifact-index`);
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function listCardIds(): string[] {
  if (!existsSync(CONFIG_DIR)) return [];
  return readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

function configForCard(cardId: string | undefined): CardConfig {
  if (!cardId) usage();
  const file = path.join(CONFIG_DIR, `${cardId}.json`);
  if (!existsSync(file)) usage();
  return readJson<CardConfig>(file);
}

function configFromRun(runDir: string): CardConfig {
  const run = readJson(path.join(runDir, 'run.json'));
  return configForCard(run.card_id);
}

function runDirFromArg(): string {
  const run = arg('--run');
  if (!run) usage();
  return run;
}

function isoRunStamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

function sha256(file: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

function titleFromMarkdown(text: string): string {
  return (text.match(/^#\s+(.+)$/m)?.[1] || text.match(/^(.+)\n[-=]{3,}$/m)?.[1] || '').slice(0, 180);
}

function sourcePath(runDir: string, source: SourceSpec): string {
  return path.join(runDir, 'sources', `${source.id}-${source.type}.md`);
}

function readJson<T = any>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function jsonEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stripIgnoredKeys(value: any, ignoredKeys: Set<string>): any {
  if (Array.isArray(value)) return value.map((item) => stripIgnoredKeys(item, ignoredKeys));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (ignoredKeys.has(key)) continue;
    out[key] = stripIgnoredKeys(child, ignoredKeys);
  }
  return out;
}

function equalIgnoringLastVerified(before: any, after: any): boolean {
  const ignoredKeys = new Set(['last_verified']);
  return jsonEqual(stripIgnoredKeys(before, ignoredKeys), stripIgnoredKeys(after, ignoredKeys));
}

const PRODUCTION_FIELD_POLICY: Record<string, FieldPolicy> = {
  annual_fee: { action: 'auto_apply_candidate_if_qa_passes', reason: 'Stable numeric field; issuer-cited changes may be applied after QA pass.' },
  foreign_transaction_fee: { action: 'auto_apply_candidate_if_qa_passes', reason: 'Stable numeric field; issuer-cited changes may be applied after QA pass.' },
  fhr_thc: { action: 'auto_apply_candidate_if_qa_passes', reason: 'Simple eligibility flags; still requires candidate citation.' },
  welcome_offer: { action: 'manual_review_required', reason: 'High-change/high-risk field; community conflicts, targeted offers, and expiry windows are common.' },
  earning_rates: { action: 'manual_review_required', reason: 'Category semantics affect recommendations and often require schema normalization.' },
  recurring_credits: { action: 'manual_review_required', reason: 'Benefit amounts, frequencies, and enrollment terms need human review.' },
  travel_benefits: { action: 'manual_review_required', reason: 'Complex nested benefits and insurance semantics require human review.' },
};
const PRODUCTION_PATCH_FIELDS = Object.keys(PRODUCTION_FIELD_POLICY);

function approvalPath(runDir: string): string {
  return path.join(runDir, 'approval.json');
}

function loadApproval(runDir: string): any | null {
  const file = approvalPath(runDir);
  return existsSync(file) ? readJson(file) : null;
}

function validApprovalFor(plan: any, approval: any | null): { ok: boolean; issues: string[]; approvedFields: string[] } {
  const issues: string[] = [];
  if (!approval) return { ok: false, issues: ['approval.json missing'], approvedFields: [] };
  const approvedFields = Array.isArray(approval.approved_fields) ? approval.approved_fields : [];
  const requiredFields = plan.manual_review_fields || [];
  if (approval.status !== 'approved') issues.push(`approval.status must be "approved", got ${JSON.stringify(approval.status)}`);
  if (approval.run_id !== plan.run_id) issues.push(`approval.run_id mismatch: expected ${plan.run_id}, got ${approval.run_id}`);
  if (!approval.reviewer) issues.push('approval.reviewer missing');
  for (const field of requiredFields) {
    if (!approvedFields.includes(field)) issues.push(`manual field not approved: ${field}`);
  }
  return { ok: issues.length === 0, issues, approvedFields };
}

function replaceAutoDate(value: any, today = new Date().toISOString().slice(0, 10)): any {
  if (value === 'AUTO_DATE') return today;
  if (Array.isArray(value)) return value.map((item) => replaceAutoDate(item, today));
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = replaceAutoDate(value[key], today);
  }
  return value;
}

function scraplingBin(): string {
  const candidates = [
    process.env.SCRAPLING_BIN,
    path.join(process.env.HOME || '', '.venv/scrapling/bin/scrapling'),
    'scrapling',
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => candidate === 'scrapling' || existsSync(candidate)) || 'scrapling';
}

function fetchBackend(): FetchBackend {
  const backend = arg('--backend') || process.env.CARD_ADAPTOR_FETCH_BACKEND || 'auto';
  if (backend === 'auto' || backend === 'scrapling' || backend === 'cloakbrowser') return backend;
  console.error(`Unknown --backend ${JSON.stringify(backend)}. Expected auto, scrapling, or cloakbrowser.`);
  process.exit(2);
}

function backendForSource(requested: FetchBackend, source: SourceSpec): Exclude<FetchBackend, 'auto'> {
  if (requested === 'scrapling' || requested === 'cloakbrowser') return requested;
  if (source.type === 'issuer' || source.type === 'flyertalk') return 'cloakbrowser';
  return 'scrapling';
}

function cloakbrowserAvailable(): boolean {
  return existsSync(path.join('node_modules', 'cloakbrowser', 'dist', 'index.js'));
}

function cloakbrowserFetch(source: SourceSpec, out: string): void {
  if (!cloakbrowserAvailable()) {
    throw new Error('cloakbrowser package missing; run npm install --save-dev cloakbrowser');
  }
  const script = String.raw`
import { writeFileSync } from 'node:fs';
import { launchContext } from 'cloakbrowser';

const url = process.env.CARD_ADAPTOR_URL;
const out = process.env.CARD_ADAPTOR_OUT;
if (!url || !out) throw new Error('CARD_ADAPTOR_URL and CARD_ADAPTOR_OUT are required');

const context = await launchContext({
  headless: true,
  humanize: true,
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  viewport: { width: 1365, height: 900 },
});

try {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const title = await page.title().catch(() => '');
  const finalUrl = page.url();
  const text = await page.locator('body').innerText({ timeout: 15000 }).catch(async () => {
    return await page.content();
  });
  writeFileSync(out, [
    title ? '# ' + title : '# Untitled',
    '',
    'Source: ' + url,
    'Final URL: ' + finalUrl,
    'Fetched with: cloakbrowser',
    'Fetched at: ' + new Date().toISOString(),
    '',
    text,
  ].join('\n'), 'utf8');
} finally {
  await context.close().catch(() => undefined);
}
`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CARD_ADAPTOR_URL: source.url,
      CARD_ADAPTOR_OUT: out,
    },
  });
}

function doctor(): void {
  const cards = listCardIds();
  const latestRuns = latestRunDirsByCard();
  const checks = [
    { name: 'config_dir', ok: existsSync(CONFIG_DIR), detail: CONFIG_DIR },
    { name: 'card_configs', ok: cards.length > 0, detail: `${cards.length} configured card(s)` },
    { name: 'production_cards', ok: existsSync(path.join('data', 'cards')), detail: 'data/cards' },
    { name: 'adaptor_data_dir', ok: existsSync(path.join('data', 'adaptor')), detail: 'data/adaptor' },
    { name: 'scrapling_bin', ok: scraplingBin() === 'scrapling' || existsSync(scraplingBin()), detail: scraplingBin() },
    { name: 'cloakbrowser_package', ok: cloakbrowserAvailable(), detail: cloakbrowserAvailable() ? 'node_modules/cloakbrowser' : 'not installed' },
    { name: 'node', ok: !!process.version, detail: process.version },
    { name: 'latest_runs', ok: true, detail: `${latestRuns.length} latest run(s) indexed` },
  ];
  const hardFailures = checks.filter((check) => !check.ok && ['config_dir', 'production_cards'].includes(check.name));
  writeJson('/tmp/card-adaptor-doctor.json', {
    generated_at: new Date().toISOString(),
    status: hardFailures.length ? 'blocked' : 'ok',
    checks,
  });
  for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`);
  console.log(`doctor_report: /tmp/card-adaptor-doctor.json`);
  if (hardFailures.length) process.exit(1);
}

function scrape(cardId: string, backend = fetchBackend()): string {
  const config = configForCard(cardId);
  const runId = `${isoRunStamp()}-${config.cardId}`;
  const runDir = path.join('data/adaptor/runs', runId);
  mkdirSync(path.join(runDir, 'sources'), { recursive: true });
  const startedAt = new Date().toISOString();
  const bin = scraplingBin();
  const errors: any[] = [];

  for (const source of config.sources) {
    const sourceBackend = backendForSource(backend, source);
    const out = sourcePath(runDir, source);
    try {
      if (sourceBackend === 'cloakbrowser') {
        cloakbrowserFetch(source, out);
      } else {
        const command = source.method === 'fetch' ? 'fetch' : 'get';
        const args = ['extract', command, source.url, out, '--ai-targeted'];
        if (command === 'fetch') args.push('--timeout', '60000', '--wait', '3000', '--network-idle', '--disable-resources');
        else args.push('--timeout', '60');
        execFileSync(bin, args, {
          stdio: 'inherit',
          env: { ...process.env, LANG: process.env.LANG || 'en_US.UTF-8', LC_ALL: process.env.LC_ALL || 'en_US.UTF-8', PYTHONIOENCODING: 'utf-8' },
        });
      }
    } catch (error: any) {
      const primaryError = String(error?.message || error);
      try {
        execFileSync('curl', ['-L', '--max-time', '30', '-A', 'Mozilla/5.0', source.url, '-o', out], { stdio: 'ignore' });
        errors.push({ source: source.url, id: source.id, backend: sourceBackend, requested_backend: backend, error: primaryError, fallback: 'curl_raw_html_saved', required: !!source.required });
      } catch (fallbackError: any) {
        errors.push({ source: source.url, id: source.id, backend: sourceBackend, requested_backend: backend, error: primaryError, fallback_error: String(fallbackError?.message || fallbackError), required: !!source.required });
      }
    }
  }

  writeJson(path.join(runDir, 'run.json'), {
    card_id: config.cardId,
    run_id: runId,
    created_at: startedAt,
    mode: config.mode,
    fetch_backend: backend,
    fetch_backend_policy: backend === 'auto' ? 'issuer/flyertalk=cloakbrowser; other=scrapling' : 'forced',
    status: 'scraped',
    artifacts: ['run.json'],
    scrape_errors: errors,
  });
  manifest(runDir);
  console.log(runDir);
  return runDir;
}

function manifest(runDir: string): void {
  const config = configFromRun(runDir);
  const run = readJson(path.join(runDir, 'run.json'));
  const now = new Date().toISOString();
  const sources: any[] = [];
  const errors: any[] = [...(run.scrape_errors || [])];
  for (const source of config.sources) {
    const file = sourcePath(runDir, source);
    if (existsSync(file) && statSync(file).size > 0) {
      const text = readFileSync(file, 'utf8');
      sources.push({
        id: source.id,
        url: source.url,
        final_url: source.url,
        source_type: source.type,
        title: titleFromMarkdown(text),
        text_path: file,
        hash: sha256(file),
        chars: text.length,
        fetched_at: now,
        required: !!source.required,
      });
    } else {
      errors.push({ source: source.url, id: source.id, source_type: source.type, error: 'missing_or_empty_source', required: !!source.required, text_path: file });
    }
  }
  writeJson(path.join(runDir, 'manifest.json'), { card_id: config.cardId, run_id: run.run_id, created_at: run.created_at, sources, errors });
  updateRun(runDir, 'manifest.json');
}

function sourceText(runDir: string, type: SourceType): string {
  const config = configFromRun(runDir);
  return config.sources
    .filter((s) => s.type === type)
    .map((source) => {
      const file = sourcePath(runDir, source);
      return existsSync(file) ? readFileSync(file, 'utf8') : '';
    })
    .join('\n');
}

function normalizeNumber(value: string): number {
  return Number(value.replace(/[^\d]/g, ''));
}

function detectIssuerWelcomeOfferCheck(runDir: string): LiveWelcomeOfferCheck | null {
  const config = configFromRun(runDir);
  const issuer = config.sources.find((source) => source.type === 'issuer');
  if (!issuer) return null;
  const file = sourcePath(runDir, issuer);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\u00a0/g, ' ');
  const flattened = text.replace(/\s+/g, ' ');

  const patterns = [
    /Earn\s+([\d,]+)\s+(?:bonus\s+)?points?[\s\S]{0,120}?after\s+(?:you\s+)?spend\s+\$([\d,]+)[\s\S]{0,120}?(?:first|in the first)\s+(\d+)\s+months?/i,
    /Earn\s+([\d,]+)\s+(?:bonus\s+)?points?[\s\S]{0,120}?after\s+you\s+spend\s+\$([\d,]+)[\s\S]{0,120}?from account opening\s*\*?/i,
    /Earn\s+([\d,]+)\s+(?:bonus\s+)?points?[\s\S]{0,160}?after\s+spending\s+\$([\d,]+)[\s\S]{0,120}?(?:first|in the first)\s+(\d+)\s+months?/i,
    /Earn\s+([\d,]+)\s+(?:bonus\s+)?points?[\s\S]{0,180}?after\s+you\s+spend\s+\$([\d,]+)[\s\S]{0,120}?in purchases in the first\s+(\d+)\s+months?/i,
  ];

  let bonusPoints: number | null = null;
  let spendingRequirement: number | null = null;
  let timePeriodMonths: number | null = null;
  let evidence: string | null = null;
  let pattern: string | null = null;

  for (const re of patterns) {
    const match = flattened.match(re);
    if (!match) continue;
    bonusPoints = normalizeNumber(match[1]);
    spendingRequirement = match[2] ? normalizeNumber(match[2]) : null;
    timePeriodMonths = match[3] ? Number(match[3]) : null;
    evidence = match[0].trim();
    pattern = re.source;
    break;
  }

  if (bonusPoints === null) return {
    source_type: 'issuer',
    source_url: issuer.url,
    source_name: issuer.id,
    matched: false,
    bonus_points: null,
    spending_requirement: null,
    time_period_months: null,
    evidence: null,
    pattern: null,
    drifted: false,
    drift_fields: [],
  };

  const candidate = config.candidate?.welcome_offer || {};
  const driftFields: string[] = [];
  if (typeof candidate.bonus_points === 'number' && candidate.bonus_points !== bonusPoints) driftFields.push('welcome_offer.bonus_points');
  if (spendingRequirement !== null && typeof candidate.spending_requirement === 'number' && candidate.spending_requirement !== spendingRequirement) driftFields.push('welcome_offer.spending_requirement');
  if (timePeriodMonths !== null && typeof candidate.time_period_months === 'number' && candidate.time_period_months !== timePeriodMonths) driftFields.push('welcome_offer.time_period_months');

  return {
    source_type: 'issuer',
    source_url: issuer.url,
    source_name: issuer.id,
    matched: true,
    bonus_points: bonusPoints,
    spending_requirement: spendingRequirement,
    time_period_months: timePeriodMonths,
    evidence,
    pattern,
    drifted: driftFields.length > 0,
    drift_fields: driftFields,
  };
}

function normalize(runDir: string): void {
  const config = configFromRun(runDir);
  const candidate = replaceAutoDate(deepClone(config.candidate));
  writeJson(path.join(runDir, 'candidate.json'), {
    card_id: config.cardId,
    candidate,
    citations: config.citations || {},
    open_questions: config.open_questions || [],
  });
  updateRun(runDir, 'candidate.json');
}

function artifactSourceType(sourceType: SourceType): ArtifactSourceType {
  if (sourceType === 'issuer') return 'issuer';
  if (sourceType === 'doc') return 'doctor_of_credit';
  if (sourceType === 'usccg') return 'us_credit_card_guide';
  return 'other_third_party';
}

function artifactTypeForMode(mode: string): ArtifactType {
  if (mode === 'offer') return 'offer_update';
  if (mode === 'credits') return 'benefit_update';
  if (mode === 'offer_and_benefits') return 'card_update';
  return 'card_update';
}

function confidenceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && value >= 0 && value <= 1) return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase();
  if (normalized.includes('high')) return 0.95;
  if (normalized.includes('medium_high')) return 0.88;
  if (normalized.includes('medium')) return 0.75;
  if (normalized.includes('low')) return 0.55;
  return fallback;
}

function riskForField(field: string): 'low' | 'medium' | 'high' {
  const policy = PRODUCTION_FIELD_POLICY[field];
  if (policy?.action === 'manual_review_required') return 'high';
  if (/fee|welcome_offer|bonus|spending_requirement|recurring_credits|apr/i.test(field)) return 'medium';
  return 'low';
}

const CONDITIONAL_BONUS_PATTERNS = [
  /\bup\s+to\b/i,
  /\badditional\b/i,
  /\bextra\b/i,
  /\bplus\b/i,
  /\bemployee\s+card/i,
  /\bauthorized\s+user/i,
  /\badditional\s+card/i,
  /\bafter\s+adding\b/i,
  /\badd(?:ing)?\s+(?:an?\s+)?(?:employee|authorized|additional)/i,
  /\btiered\b/i,
];

function welcomeOfferEvidenceText(candidateEnvelope: any): string {
  const offer = candidateEnvelope?.candidate?.welcome_offer || {};
  const pieces = [
    offer.description,
    offer.offer_status,
    ...(Array.isArray(offer.notes) ? offer.notes : []),
    ...(Array.isArray(offer.source_conflicts) ? offer.source_conflicts : []),
    ...(Array.isArray(candidateEnvelope?.citations?.welcome_offer) ? candidateEnvelope.citations.welcome_offer : []),
  ];
  return pieces.filter(Boolean).join('\n');
}

function hasConditionalWelcomeBonus(candidateEnvelope: any): boolean {
  const text = welcomeOfferEvidenceText(candidateEnvelope);
  return CONDITIONAL_BONUS_PATTERNS.some((pattern) => pattern.test(text));
}

function hasAdditionalCardholderWelcomeBonus(candidateEnvelope: any): boolean {
  const text = welcomeOfferEvidenceText(candidateEnvelope);
  return /employee\s+card|authorized\s+user|additional\s+card|after\s+adding|add(?:ing)?\s+(?:an?\s+)?(?:employee|authorized|additional)/i.test(text);
}

function hasDocumentedConditionalWelcomeBonus(candidateEnvelope: any): boolean {
  const offer = candidateEnvelope?.candidate?.welcome_offer || {};
  const citations = Array.isArray(candidateEnvelope?.citations?.welcome_offer) ? candidateEnvelope.citations.welcome_offer : [];
  return !!(
    offer.offer_status &&
    Array.isArray(offer.source_conflicts) &&
    citations.length &&
    !hasAdditionalCardholderWelcomeBonus(candidateEnvelope)
  );
}

function createArtifact(runDir: string): void {
  if (!existsSync(path.join(runDir, 'candidate.json'))) normalize(runDir);
  if (!existsSync(path.join(runDir, 'apply-plan.json'))) applyPlan(runDir);

  const config = configFromRun(runDir);
  const run = readJson(path.join(runDir, 'run.json'));
  const manifestData = existsSync(path.join(runDir, 'manifest.json')) ? readJson(path.join(runDir, 'manifest.json')) : { sources: [] };
  const candidateEnvelope = readJson(path.join(runDir, 'candidate.json'));
  const candidate = candidateEnvelope.candidate || {};
  const diffs = existsSync(path.join(runDir, 'json-diff.json')) ? readJson(path.join(runDir, 'json-diff.json')).diffs || [] : [];
  const changed = diffs.filter((d: any) => d.status === 'changed');
  const primarySource = manifestData.sources?.find((s: any) => s.source_type === 'issuer') || manifestData.sources?.[0];

  const fields: CardUpdateArtifact['extracted']['fields'] = {};
  for (const field of PRODUCTION_PATCH_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) continue;
    const citation = candidateEnvelope.citations?.[field]?.[0]
      || (field === 'welcome_offer' ? candidateEnvelope.citations?.welcome_offer?.[0] : null)
      || (field === 'recurring_credits' ? candidateEnvelope.citations?.recurring_credits?.[0] : null)
      || 'citation missing';
    fields[field] = {
      value: candidate[field],
      confidence: confidenceNumber(candidate[field]?.confidence, primarySource?.source_type === 'issuer' ? 0.9 : 0.75),
      citation,
    };
  }

  const riskFlags = new Set<string>();
  const conditionalWelcomeBonus = hasConditionalWelcomeBonus(candidateEnvelope);
  const documentedConditionalWelcomeBonus = hasDocumentedConditionalWelcomeBonus(candidateEnvelope);
  if (!primarySource) riskFlags.add('source_snapshot_missing');
  if (primarySource && artifactSourceType(primarySource.source_type) === 'other_third_party') riskFlags.add('third_party_source_only');
  if (candidate.welcome_offer && conditionalWelcomeBonus && !documentedConditionalWelcomeBonus) riskFlags.add('conditional_or_tiered_welcome_bonus');
  for (const diff of changed) {
    if (riskForField(diff.field) !== 'low') riskFlags.add(`${diff.field}_changed`);
    if (diff.field === 'welcome_offer' && candidate.welcome_offer?.offer_status && candidate.welcome_offer.offer_status !== 'public') {
      riskFlags.add('ymmv_or_targeted_offer_possible');
    }
  }

  const artifact: CardUpdateArtifact = {
    artifact_version: '1.0',
    artifact_type: artifactTypeForMode(run.mode || config.mode || 'card_update'),
    card_id: config.cardId,
    run_id: run.run_id,
    created_at: new Date().toISOString(),
    source: {
      url: primarySource?.url || config.sources[0]?.url || 'unknown',
      source_type: primarySource ? artifactSourceType(primarySource.source_type) : 'other_third_party',
      source_name: primarySource?.title || primarySource?.id || undefined,
      fetched_at: primarySource?.fetched_at || run.created_at || new Date().toISOString(),
      snapshot_path: primarySource?.text_path,
      content_hash: primarySource?.hash,
    },
    extracted: { fields },
    diff: {
      summary: changed.length
        ? `Changed fields: ${changed.map((d: any) => d.field).join(', ')}`
        : 'No production field changes detected.',
      changes: changed.map((d: any) => ({
        path: d.field,
        before: d.before,
        after: d.after,
        risk: riskForField(d.field),
      })),
    },
    risk_flags: Array.from(riskFlags),
    review: {
      status: 'pending',
      reviewer: null,
      reviewed_at: null,
      notes: null,
    },
  };

  const validation = validateCardUpdateArtifact(artifact);
  const fileName = `${run.run_id}.json`;
  const runArtifactPath = path.join(runDir, 'card-update-artifact.json');
  const pendingDir = path.join('artifacts', 'card-updates', 'pending');
  mkdirSync(pendingDir, { recursive: true });
  writeJson(runArtifactPath, artifact);
  writeJson(path.join(pendingDir, fileName), artifact);
  writeJson(path.join(runDir, 'card-update-artifact-validation.json'), validation);
  updateRun(runDir, 'card-update-artifact.json');
  updateRun(runDir, 'card-update-artifact-validation.json');
  updateRun(runDir, path.join(pendingDir, fileName));
  console.log(runArtifactPath);
}

function communityCheck(runDir: string): void {
  const config = configFromRun(runDir);
  const rules = config.community?.observations || [];
  const observations = rules.filter((rule) => new RegExp(rule.regex, 'i').test(sourceText(runDir, rule.sourceType))).map((rule) => ({
    source: rule.source,
    source_type: rule.sourceType,
    stance: rule.stance,
    offer_amount: rule.offer_amount,
    spend_requirement: rule.spend_requirement,
    spend_window_months: rule.spend_window_months,
    excerpt: rule.excerpt,
    confidence: rule.confidence,
  }));
  const conflictNeedles = config.community?.conflictStanceIncludes || [];
  const conflictObserved = observations.some((o) => conflictNeedles.some((needle) => o.stance.includes(needle)));
  const consensus = {
    verdict: conflictObserved ? `${config.cardId}_conflict_observed` : `${config.cardId}_no_conflict_observed`,
    recommended_production_value: config.community?.recommended_production_value || null,
    confidence: config.community?.confidence || 'unknown',
    conflict_observed: conflictObserved,
    ymmv_or_targeted_possible: !!config.community?.ymmv_or_targeted_possible,
    summary: config.community?.summary || 'No community rule configured.',
  };
  writeCommunity(runDir, config.cardId, observations, consensus);
  updateRun(runDir, 'community-check.json');
}

function writeCommunity(runDir: string, cardId: string, observations: any[], consensus: any): void {
  const sample_counts = observations.reduce((acc: any, o) => {
    acc.total += 1;
    acc[o.stance] = (acc[o.stance] || 0) + 1;
    return acc;
  }, { total: 0 });
  writeJson(path.join(runDir, 'community-check.json'), {
    card_id: cardId,
    run_id: readJson(path.join(runDir, 'run.json')).run_id,
    generated_at: new Date().toISOString(),
    sample_counts,
    community_consensus: consensus,
    observations,
  });
  let md = `# ${cardId} Community Cross-Check\n\n${consensus.summary}\n\n`;
  for (const o of observations) md += `## ${o.source}\n- stance: ${o.stance}\n- excerpt: ${o.excerpt}\n- confidence: ${o.confidence}\n\n`;
  writeFileSync(path.join(runDir, 'community-check.md'), md);
  updateRun(runDir, 'community-check.md');
}

function qa(runDir: string): void {
  const run = readJson(path.join(runDir, 'run.json'));
  const mode = run.mode || configFromRun(runDir).mode || 'offer';
  const manifestData = readJson(path.join(runDir, 'manifest.json'));
  const candidate = readJson(path.join(runDir, 'candidate.json'));
  const community = existsSync(path.join(runDir, 'community-check.json')) ? readJson(path.join(runDir, 'community-check.json')) : null;
  const liveCheck = detectIssuerWelcomeOfferCheck(runDir);
  const blocking_issues: string[] = [];
  const warnings: string[] = [];
  const hasIssuer = manifestData.sources.some((s: any) => s.source_type === 'issuer');
  const requiresWelcomeOffer = mode === 'offer' || mode === 'offer_and_benefits';
  const requiresRecurringCredits = mode === 'credits';
  const hasRecurringCreditsCandidate = !!candidate?.candidate?.recurring_credits;
  if (!hasIssuer) blocking_issues.push('issuer source missing');
  if (requiresWelcomeOffer && !candidate?.candidate?.welcome_offer) blocking_issues.push('welcome_offer candidate missing');
  if (requiresRecurringCredits && !candidate?.candidate?.recurring_credits) blocking_issues.push('recurring_credits candidate missing');
  if (manifestData.errors.some((e: any) => e.required)) blocking_issues.push('required source missing or empty');
  if (requiresWelcomeOffer && !candidate?.citations?.welcome_offer?.length) blocking_issues.push('welcome_offer citation missing');
  if ((requiresRecurringCredits || hasRecurringCreditsCandidate) && !candidate?.citations?.recurring_credits?.length) blocking_issues.push('recurring_credits citation missing');
  const conditionalWelcomeBonus = requiresWelcomeOffer && hasConditionalWelcomeBonus(candidate);
  const documentedConditionalWelcomeBonus = requiresWelcomeOffer && hasDocumentedConditionalWelcomeBonus(candidate);
  if (requiresWelcomeOffer && community?.community_consensus?.conflict_observed) warnings.push('Community/source conflict observed; issuer wins but review is required.');
  if (requiresWelcomeOffer && community?.community_consensus?.ymmv_or_targeted_possible) warnings.push('Offer may be YMMV or targeted; metadata label is required.');
  if (conditionalWelcomeBonus && !documentedConditionalWelcomeBonus) warnings.push('Welcome offer appears conditional or tiered (for example up-to/additional/employee-card/authorized-user language); verify guaranteed vs conditional bonus before applying.');
  const expiryWarning = requiresWelcomeOffer ? welcomeOfferExpiryWarning(candidate) : null;
  if (expiryWarning) warnings.push(expiryWarning);
  if (requiresWelcomeOffer && liveCheck?.drifted) {
    warnings.push(
      `Issuer source drift detected; candidate is stale for ${liveCheck.drift_fields.join(', ')}. Refresh candidate from live issuer copy before treating this run as no-production-delta.`,
    );
  }
  if (requiresWelcomeOffer && community?.community_consensus?.conflict_observed && !Array.isArray(candidate?.candidate?.welcome_offer?.source_conflicts)) {
    blocking_issues.push('source_conflicts metadata missing for observed source conflict');
  }
  if (requiresWelcomeOffer && community?.community_consensus?.ymmv_or_targeted_possible && !candidate?.candidate?.welcome_offer?.offer_status) {
    blocking_issues.push('offer_status metadata missing for YMMV/targeted offer');
  }
  const verdict: Verdict = blocking_issues.length ? 'blocked' : warnings.length ? 'needs_review' : 'pass';
  writeJson(path.join(runDir, 'qa-report.json'), {
    card_id: run.card_id,
    run_id: run.run_id,
    mode,
    verdict,
    confidence: verdict === 'pass' ? 'high' : 'medium',
    source_coverage: { issuer: hasIssuer, community: !!community },
    checks: {
      schema_validation: 'pass_not_applied_existing_card_validates_separately',
      required_fields: blocking_issues.some((issue) => issue.endsWith('candidate missing')) ? 'blocked' : 'pass',
      citations: blocking_issues.some((issue) => issue.endsWith('citation missing')) ? 'blocked' : 'pass',
      source_snapshots_saved: manifestData.errors.length ? 'pass_with_errors' : 'pass',
      issuer_source_for_core_terms: hasIssuer ? 'pass' : 'blocked',
      community_cross_check: community ? (community.community_consensus.conflict_observed ? 'needs_review_conflict_observed' : 'pass') : 'missing',
      conditional_welcome_bonus: conditionalWelcomeBonus ? (documentedConditionalWelcomeBonus ? 'pass_documented' : 'needs_review') : 'pass',
      existing_data_diff: 'generated_by_review',
    },
    blocking_issues,
    warnings,
    live_source_check: liveCheck,
    community_consensus: community?.community_consensus,
    community_sample_counts: community?.sample_counts,
    artifacts: {
      manifest: 'manifest.json',
      candidate: 'candidate.json',
      live_source_check: liveCheck ? 'live-source-check.json' : null,
      community_check: community ? 'community-check.json' : null,
      qa_report: 'qa-report.json',
      json_diff: 'json-diff.json',
      review_diff: 'review-diff.md',
      apply_plan: 'apply-plan.json',
      proposed_patch: 'proposed-patch.json',
      proposed_card: 'proposed-card.json',
      review_report: 'review-report.md',
    },
  });
  if (liveCheck) {
    writeJson(path.join(runDir, 'live-source-check.json'), {
      card_id: run.card_id,
      run_id: run.run_id,
      generated_at: new Date().toISOString(),
      ...liveCheck,
    });
    updateRun(runDir, 'live-source-check.json');
  }
  updateRun(runDir, 'qa-report.json');
}

function diffFields(existing: Record<string, any>, candidate: Record<string, any>): any[] {
  return PRODUCTION_PATCH_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(candidate, field))
    .map((field) => {
      const before = existing[field];
      const after = candidate[field];
      return {
        field,
        status: equalIgnoringLastVerified(before, after) ? 'unchanged' : 'changed',
        before,
        after,
      };
    });
}

function welcomeOfferExpiryWarning(candidateEnvelope: any): string | null {
  const description = candidateEnvelope?.candidate?.welcome_offer?.description;
  if (typeof description !== 'string' || !description) return null;
  const match = description.match(/Offer ends\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\.?/i);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !day || !year) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryUtc = Date.UTC(year, month - 1, day);
  const daysLeft = Math.round((expiryUtc - todayUtc) / 86400000);
  const formatted = `${month}/${day}/${year}`;
  if (daysLeft < 0) return `Welcome offer expired on ${formatted}.`;
  if (daysLeft <= 7) return `Welcome offer expires in ${daysLeft} day(s) (${formatted}) — 7-day warning.`;
  if (daysLeft <= 14) return `Welcome offer expires in ${daysLeft} day(s) (${formatted}) — 14-day warning.`;
  return null;
}

function applyPlan(runDir: string): void {
  const config = configFromRun(runDir);
  const existing = readJson(config.cardPath);
  const candidateEnvelope = readJson(path.join(runDir, 'candidate.json'));
  const candidate = candidateEnvelope.candidate;
  const run = readJson(path.join(runDir, 'run.json'));
  const qaReport = existsSync(path.join(runDir, 'qa-report.json')) ? readJson(path.join(runDir, 'qa-report.json')) : null;
  const community = existsSync(path.join(runDir, 'community-check.json')) ? readJson(path.join(runDir, 'community-check.json')) : null;
  const liveCheck = existsSync(path.join(runDir, 'live-source-check.json')) ? readJson(path.join(runDir, 'live-source-check.json')) : null;
  const diffs = diffFields(existing, candidate);
  const changed = diffs.filter((d) => d.status === 'changed');
  const proposedCard = deepClone(existing);
  const patch: any = {};
  for (const diff of changed) {
    proposedCard[diff.field] = diff.after;
    patch[diff.field] = diff.after;
  }
  proposedCard.last_verified = new Date().toISOString().slice(0, 10);

  const safetyIssues: string[] = [];
  const reviewReasons: string[] = [];
  if (!qaReport) safetyIssues.push('qa-report.json missing; run qa first');
  if (qaReport?.verdict === 'blocked') safetyIssues.push(...(qaReport.blocking_issues || ['qa verdict is blocked']));
  if (qaReport?.verdict === 'needs_review') reviewReasons.push(...(qaReport.warnings || ['qa verdict is needs_review']));
  if (liveCheck?.drifted) reviewReasons.push(`issuer source drift detected: ${liveCheck.drift_fields.join(', ')}`);
  if (community?.community_consensus?.conflict_observed) reviewReasons.push('community/source conflict observed');
  if (changed.length === 0) reviewReasons.push('no production field changes detected');
  const manualFields = changed.filter((d) => PRODUCTION_FIELD_POLICY[d.field]?.action === 'manual_review_required').map((d) => d.field);
  if (manualFields.length) reviewReasons.push(`manual_review_required fields changed: ${manualFields.join(', ')}`);
  const approval = loadApproval(runDir);
  const approvalCheckPreview = approval ? validApprovalFor({ run_id: run.run_id, manual_review_fields: manualFields }, approval) : null;
  const approvedManualFields = approvalCheckPreview?.ok ? manualFields : [];
  if (manualFields.length && approvalCheckPreview?.ok) {
    const approvalReason = `manual_review_required fields approved by ${approval.reviewer}: ${manualFields.join(', ')}`;
    for (let i = reviewReasons.length - 1; i >= 0; i -= 1) {
      if (reviewReasons[i].startsWith('manual_review_required fields changed:')) reviewReasons.splice(i, 1);
    }
    reviewReasons.push(approvalReason);
  }

  const unresolvedManualFields = manualFields.filter((field) => !approvedManualFields.includes(field));
  const canApply = !!qaReport && qaReport.verdict !== 'blocked' && safetyIssues.length === 0 && unresolvedManualFields.length === 0 && changed.length > 0;
  const recommendation = safetyIssues.length
    ? 'blocked'
    : liveCheck?.drifted
      ? 'source_drift_detected'
    : changed.length === 0
      ? 'close_no_production_delta'
      : canApply
        ? 'approved_to_apply_with_write_flag'
        : 'review_only';

  writeJson(path.join(runDir, 'proposed-patch.json'), {
    card_id: config.cardId,
    run_id: run.run_id,
    generated_at: new Date().toISOString(),
    patch,
    changed_fields: changed.map((d) => d.field),
    citations: candidateEnvelope.citations || {},
  });
  writeJson(path.join(runDir, 'proposed-card.json'), proposedCard);
  writeJson(path.join(runDir, 'apply-plan.json'), {
    card_id: config.cardId,
    run_id: run.run_id,
    generated_at: new Date().toISOString(),
    target_card_path: config.cardPath,
    mode: 'dry_run_until_apply_write',
    recommendation,
    can_apply: canApply,
    qa_verdict: qaReport?.verdict || 'qa_not_run',
    live_source_check: liveCheck,
    field_policy: PRODUCTION_FIELD_POLICY,
    changed_fields: changed.map((d) => d.field),
    auto_apply_fields: changed.filter((d) => PRODUCTION_FIELD_POLICY[d.field]?.action === 'auto_apply_candidate_if_qa_passes').map((d) => d.field),
    manual_review_fields: manualFields,
    approved_manual_fields: approvedManualFields,
    unresolved_manual_fields: unresolvedManualFields,
    approval: approval ? {
      present: true,
      status: approval.status,
      reviewer: approval.reviewer || null,
      approved_fields: approval.approved_fields || [],
      approved_at: approval.approved_at || null,
      valid: !!approvalCheckPreview?.ok,
      issues: approvalCheckPreview?.issues || [],
    } : { present: false, valid: manualFields.length === 0, issues: manualFields.length ? ['approval.json missing'] : [] },
    safety_issues: safetyIssues,
    review_reasons: Array.from(new Set(reviewReasons)),
    artifacts: {
      proposed_patch: 'proposed-patch.json',
      proposed_card: 'proposed-card.json',
      review_report: 'review-report.md',
      live_source_check: liveCheck ? 'live-source-check.json' : null,
    },
  });
  writeJson(path.join(runDir, 'json-diff.json'), { card_id: config.cardId, run_id: run.run_id, generated_at: new Date().toISOString(), diffs });
  updateRun(runDir, 'proposed-patch.json');
  updateRun(runDir, 'proposed-card.json');
  updateRun(runDir, 'apply-plan.json');
  updateRun(runDir, 'json-diff.json');
}

function approvalTemplate(runDir: string): void {
  if (!existsSync(path.join(runDir, 'apply-plan.json'))) applyPlan(runDir);
  const plan = readJson(path.join(runDir, 'apply-plan.json'));
  const file = approvalPath(runDir);
  const template = {
    schema: 'opencard.card_adaptor.approval.v1',
    card_id: plan.card_id,
    run_id: plan.run_id,
    status: 'pending',
    reviewer: '',
    approved_at: null,
    approved_fields: plan.manual_review_fields || [],
    rejected_fields: [],
    review_notes: '',
    conditions: [
      'Reviewer has inspected review-report.md and source snapshots.',
      'Reviewer accepts proposed-patch.json for approved_fields only.',
      'Reviewer understands apply --write will update the production card JSON.',
    ],
  };
  if (!existsSync(file)) writeJson(file, template);
  updateRun(runDir, 'approval.json');
  console.log(file);
}

function review(runDir: string): void {
  const config = configFromRun(runDir);
  const run = readJson(path.join(runDir, 'run.json'));
  if (!existsSync(path.join(runDir, 'apply-plan.json'))) applyPlan(runDir);
  const diffs = readJson(path.join(runDir, 'json-diff.json')).diffs;
  const qaReport = existsSync(path.join(runDir, 'qa-report.json')) ? readJson(path.join(runDir, 'qa-report.json')) : null;
  const apply = readJson(path.join(runDir, 'apply-plan.json'));
  const candidate = readJson(path.join(runDir, 'candidate.json'));
  const liveCheck = existsSync(path.join(runDir, 'live-source-check.json')) ? readJson(path.join(runDir, 'live-source-check.json')) : null;
  let md = `# ${config.cardId} Production Patch Review\n\nRun: \`${run.run_id}\`\nTarget: \`${config.cardPath}\`\n\n`;
  md += `## Recommendation\n\n- recommendation: \`${apply.recommendation}\`\n- can_apply: \`${apply.can_apply}\`\n- qa_verdict: \`${qaReport?.verdict || 'qa_not_run'}\`\n`;
  if (apply.auto_apply_fields?.length) md += `- auto_apply_fields: ${apply.auto_apply_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
  if (apply.manual_review_fields?.length) md += `- manual_review_fields: ${apply.manual_review_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
  if (apply.approved_manual_fields?.length) md += `- approved_manual_fields: ${apply.approved_manual_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
  if (apply.unresolved_manual_fields?.length) md += `- unresolved_manual_fields: ${apply.unresolved_manual_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
  md += `- approval: \`${apply.approval?.present ? (apply.approval.valid ? 'valid' : 'invalid') : 'missing'}\`\n`;
  if (apply.safety_issues?.length) md += `- safety_issues: ${apply.safety_issues.join('; ')}\n`;
  if (apply.review_reasons?.length) md += `- review_reasons: ${apply.review_reasons.join('; ')}\n`;
  if (liveCheck) {
    md += `\n## Source Drift\n\n`;
    md += `- issuer_match: \`${liveCheck.matched ? 'yes' : 'no'}\`\n`;
    md += `- drifted: \`${liveCheck.drifted ? 'yes' : 'no'}\`\n`;
    if (typeof liveCheck.bonus_points === 'number') md += `- live_bonus_points: \`${liveCheck.bonus_points}\`\n`;
    if (typeof candidate?.candidate?.welcome_offer?.bonus_points === 'number') md += `- candidate_bonus_points: \`${candidate.candidate.welcome_offer.bonus_points}\`\n`;
    if (typeof liveCheck.spending_requirement === 'number') md += `- live_spending_requirement: \`$${liveCheck.spending_requirement.toLocaleString()}\`\n`;
    if (typeof candidate?.candidate?.welcome_offer?.spending_requirement === 'number') md += `- candidate_spending_requirement: \`$${candidate.candidate.welcome_offer.spending_requirement.toLocaleString()}\`\n`;
    if (typeof liveCheck.time_period_months === 'number') md += `- live_time_period_months: \`${liveCheck.time_period_months}\`\n`;
    if (typeof candidate?.candidate?.welcome_offer?.time_period_months === 'number') md += `- candidate_time_period_months: \`${candidate.candidate.welcome_offer.time_period_months}\`\n`;
    if (liveCheck.evidence) md += `- evidence: \`${liveCheck.evidence.replace(/`/g, '\\`')}\`\n`;
    if (liveCheck.drift_fields?.length) md += `- drift_fields: ${liveCheck.drift_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
  }
  md += `\n## Field Changes\n`;
  for (const diff of diffs) {
    md += `\n### ${diff.field}\n\n`;
    md += `- status: \`${diff.status}\`\n`;
    if (diff.status === 'changed') {
      const policy = PRODUCTION_FIELD_POLICY[diff.field];
      if (policy) md += `- policy: \`${policy.action}\` — ${policy.reason}\n`;
      md += `- current: \`${JSON.stringify(diff.before)}\`\n`;
      md += `- proposed: \`${JSON.stringify(diff.after)}\`\n`;
      const citations = candidate.citations?.[diff.field] || (diff.field === 'welcome_offer' ? candidate.citations?.welcome_offer : null);
      if (citations?.length) md += `- evidence: ${citations.join('; ')}\n`;
    }
  }
  md += `\n## Approval Gate\n\n`;
  md += `Manual fields require \`approval.json\` with \`status: "approved"\`, matching \`run_id\`, reviewer, and all manual fields listed in \`approved_fields\`.\n`;
  md += `Generate template: \`npm run card-adaptor -- approval-template --run ${runDir}\`\n`;
  md += `\n## Artifacts\n\n- \`proposed-patch.json\`\n- \`proposed-card.json\`\n- \`apply-plan.json\`\n- \`approval.json\`\n- \`json-diff.json\`\n`;
  writeFileSync(path.join(runDir, 'review-diff.md'), md);
  writeFileSync(path.join(runDir, 'review-report.md'), md);
  updateRun(runDir, 'json-diff.json');
  updateRun(runDir, 'review-diff.md');
  updateRun(runDir, 'review-report.md');
}

function runAll(): void {
  const cards = listCardIds();
  const startedAt = new Date().toISOString();
  const runDirs: string[] = [];
  for (const cardId of cards) {
    const runDir = scrape(cardId);
    normalize(runDir);
    communityCheck(runDir);
    qa(runDir);
    applyPlan(runDir);
    review(runDir);
    const plan = readJson(path.join(runDir, 'apply-plan.json'));
    setStatus(runDir, plan.can_apply ? 'qa_complete_ready_to_apply' : `qa_complete_${plan.recommendation}`);
    runDirs.push(runDir);
  }
  reviewIndex(runDirs, startedAt);
}

function latestRunDirsByCard(): string[] {
  const base = path.join('data', 'adaptor', 'runs');
  if (!existsSync(base)) return [];
  const latest = new Map<string, string>();
  for (const name of readdirSync(base).sort()) {
    const dir = path.join(base, name);
    const runFile = path.join(dir, 'run.json');
    if (!existsSync(runFile)) continue;
    const run = readJson(runFile);
    latest.set(run.card_id, dir);
  }
  return Array.from(latest.values()).sort();
}

function reviewIndex(runDirs = latestRunDirsByCard(), startedAt?: string): void {
  const outDir = path.join('data', 'adaptor');
  mkdirSync(outDir, { recursive: true });
  const rows = runDirs.map((runDir) => {
    if (existsSync(path.join(runDir, 'candidate.json')) && existsSync(path.join(runDir, 'qa-report.json'))) {
      applyPlan(runDir);
      review(runDir);
    }
    const run = readJson(path.join(runDir, 'run.json'));
    const qaReport = existsSync(path.join(runDir, 'qa-report.json')) ? readJson(path.join(runDir, 'qa-report.json')) : null;
    const plan = existsSync(path.join(runDir, 'apply-plan.json')) ? readJson(path.join(runDir, 'apply-plan.json')) : null;
    return {
      card_id: run.card_id,
      run_id: run.run_id,
      run_dir: runDir,
      status: run.status,
      qa_verdict: qaReport?.verdict || 'qa_not_run',
      recommendation: plan?.recommendation || 'no_apply_plan',
      can_apply: !!plan?.can_apply,
      changed_fields: plan?.changed_fields || [],
      auto_apply_fields: plan?.auto_apply_fields || [],
      manual_review_fields: plan?.manual_review_fields || [],
      approved_manual_fields: plan?.approved_manual_fields || [],
      unresolved_manual_fields: plan?.unresolved_manual_fields || [],
      approval: plan?.approval || { present: false, valid: false },
      safety_issues: plan?.safety_issues || [],
      review_reasons: plan?.review_reasons || [],
    };
  });
  const summary = rows.reduce((acc: any, row) => {
    acc.total += 1;
    acc[row.qa_verdict] = (acc[row.qa_verdict] || 0) + 1;
    acc[row.recommendation] = (acc[row.recommendation] || 0) + 1;
    if (row.can_apply) acc.can_apply += 1;
    if (row.approval?.present) acc.approval_present += 1;
    if (row.approval?.valid) acc.approval_valid += 1;
    return acc;
  }, { total: 0, can_apply: 0, approval_present: 0, approval_valid: 0 });
  writeJson(path.join(outDir, 'review-index.json'), { generated_at: new Date().toISOString(), started_at: startedAt || null, summary, rows });
  let md = `# Card Adaptor Review Index\n\nGenerated: ${new Date().toISOString()}\n\n## Summary\n\n`;
  md += `- total: ${summary.total}\n- can_apply: ${summary.can_apply}\n- approval_present: ${summary.approval_present}\n- approval_valid: ${summary.approval_valid}\n- pass: ${summary.pass || 0}\n- needs_review: ${summary.needs_review || 0}\n- blocked: ${summary.blocked || 0}\n\n`;
  md += `## V1 Field Policy\n\n`;
  for (const [field, policy] of Object.entries(PRODUCTION_FIELD_POLICY)) md += `- \`${field}\`: \`${policy.action}\` — ${policy.reason}\n`;
  md += `\n## Runs\n\n`;
  for (const row of rows) {
    md += `### ${row.card_id}\n`;
    md += `- run: \`${row.run_id}\`\n- qa: \`${row.qa_verdict}\`\n- recommendation: \`${row.recommendation}\`\n- can_apply: \`${row.can_apply}\`\n`;
    if (row.changed_fields.length) md += `- changed_fields: ${row.changed_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
    if (row.manual_review_fields.length) md += `- manual_review_fields: ${row.manual_review_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
    if (row.approved_manual_fields.length) md += `- approved_manual_fields: ${row.approved_manual_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
    if (row.unresolved_manual_fields.length) md += `- unresolved_manual_fields: ${row.unresolved_manual_fields.map((f: string) => `\`${f}\``).join(', ')}\n`;
    md += `- approval: \`${row.approval?.present ? (row.approval.valid ? 'valid' : 'invalid') : 'missing'}\`\n`;
    if (row.review_reasons.length) md += `- review_reasons: ${row.review_reasons.join('; ')}\n`;
    if (row.safety_issues.length) md += `- safety_issues: ${row.safety_issues.join('; ')}\n`;
    md += `- report: \`${path.join(row.run_dir, 'review-report.md')}\`\n\n`;
  }
  writeFileSync(path.join(outDir, 'review-index.md'), md);
  console.log(path.join(outDir, 'review-index.md'));
}

function artifactIndex(): void {
  const pendingDir = path.join('artifacts', 'card-updates', 'pending');
  const outDir = path.join('artifacts', 'card-updates');
  mkdirSync(outDir, { recursive: true });
  const files = existsSync(pendingDir)
    ? readdirSync(pendingDir).filter((file) => file.endsWith('.json')).sort()
    : [];
  const rows = files.map((file) => {
    const artifactPath = path.join(pendingDir, file);
    const artifact = readJson(artifactPath);
    const validation = validateCardUpdateArtifact(artifact);
    return {
      artifact_path: artifactPath,
      card_id: artifact.card_id || 'unknown',
      run_id: artifact.run_id || file.replace(/\.json$/, ''),
      artifact_type: artifact.artifact_type || 'unknown',
      source_type: artifact.source?.source_type || 'unknown',
      review_status: artifact.review?.status || 'unknown',
      changed_paths: artifact.diff?.changes?.map((change: any) => change.path) || [],
      risk_flags: artifact.risk_flags || [],
      validation,
    };
  });
  const summary = rows.reduce((acc: any, row) => {
    acc.total += 1;
    if (row.validation.ok) acc.valid += 1;
    else acc.invalid += 1;
    if (row.validation.requiresManualReview) acc.requires_manual_review += 1;
    if (row.validation.autoApprovalCandidate) acc.auto_approval_candidate += 1;
    acc[`source_${row.source_type}`] = (acc[`source_${row.source_type}`] || 0) + 1;
    acc[`review_${row.review_status}`] = (acc[`review_${row.review_status}`] || 0) + 1;
    return acc;
  }, { total: 0, valid: 0, invalid: 0, requires_manual_review: 0, auto_approval_candidate: 0 });

  writeJson(path.join(outDir, 'pending-index.json'), { generated_at: new Date().toISOString(), summary, rows });

  let md = `# Pending Card Update Artifacts\n\nGenerated: ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `- total: ${summary.total}\n- valid: ${summary.valid}\n- invalid: ${summary.invalid}\n- requires_manual_review: ${summary.requires_manual_review}\n- auto_approval_candidate: ${summary.auto_approval_candidate}\n\n`;
  md += `## Review Queue\n\n`;
  if (!rows.length) md += `No pending artifacts.\n`;
  for (const row of rows) {
    md += `### ${row.card_id}\n`;
    md += `- run: \`${row.run_id}\`\n`;
    md += `- type: \`${row.artifact_type}\`\n`;
    md += `- source: \`${row.source_type}\`\n`;
    md += `- review_status: \`${row.review_status}\`\n`;
    md += `- valid: \`${row.validation.ok}\`\n`;
    md += `- requires_manual_review: \`${row.validation.requiresManualReview}\`\n`;
    md += `- auto_approval_candidate: \`${row.validation.autoApprovalCandidate}\`\n`;
    if (row.changed_paths.length) md += `- changed_paths: ${row.changed_paths.map((field: string) => `\`${field}\``).join(', ')}\n`;
    else md += `- changed_paths: none\n`;
    if (row.risk_flags.length) md += `- risk_flags: ${row.risk_flags.map((flag: string) => `\`${flag}\``).join(', ')}\n`;
    if (row.validation.errors.length) md += `- errors: ${row.validation.errors.join('; ')}\n`;
    if (row.validation.warnings.length) md += `- warnings: ${row.validation.warnings.join('; ')}\n`;
    md += `- artifact: \`${row.artifact_path}\`\n\n`;
  }
  writeFileSync(path.join(outDir, 'pending-index.md'), md);
  console.log(path.join(outDir, 'pending-index.md'));
}

function artifactPathFromArg(): string {
  const artifact = arg('--artifact');
  if (!artifact) usage();
  return artifact;
}

function moveArtifact(artifactPath: string, status: 'approved' | 'rejected', reviewer: string, notes: string | null): string {
  if (!existsSync(artifactPath)) {
    console.error(`Artifact not found: ${artifactPath}`);
    process.exit(1);
  }
  const artifact = readJson(artifactPath);
  const validation = validateCardUpdateArtifact(artifact);
  if (!validation.ok) {
    console.error(`Refusing to ${status}: artifact is invalid. ${validation.errors.join('; ')}`);
    process.exit(1);
  }
  artifact.review = {
    ...(artifact.review || {}),
    status,
    reviewer,
    reviewed_at: new Date().toISOString(),
    notes,
  };
  const destDir = path.join('artifacts', 'card-updates', status);
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(artifactPath));
  writeJson(dest, artifact);
  if (artifactPath !== dest && existsSync(artifactPath)) unlinkSync(artifactPath);
  console.log(dest);
  return dest;
}

function artifactApprove(): void {
  const reviewer = arg('--reviewer');
  if (!reviewer) usage();
  const approvedPath = moveArtifact(artifactPathFromArg(), 'approved', reviewer, arg('--notes') || null);
  artifactIndex();
  console.log(`approved_artifact: ${approvedPath}`);
}

function artifactReject(): void {
  const reviewer = arg('--reviewer');
  if (!reviewer) usage();
  const rejectedPath = moveArtifact(artifactPathFromArg(), 'rejected', reviewer, arg('--notes') || null);
  artifactIndex();
  console.log(`rejected_artifact: ${rejectedPath}`);
}

function setByPath(target: any, dottedPath: string, value: any): void {
  const parts = dottedPath.split('.').filter(Boolean);
  if (!parts.length) throw new Error('empty artifact diff path');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function artifactApply(): void {
  const artifactPath = artifactPathFromArg();
  const artifact = readJson(artifactPath);
  const validation = validateCardUpdateArtifact(artifact);
  const write = process.argv.includes('--write');
  if (!validation.ok) {
    console.error(`Refusing to apply invalid artifact: ${validation.errors.join('; ')}`);
    process.exit(1);
  }
  if (artifact.review?.status !== 'approved') {
    console.error(`Refusing to apply: artifact.review.status must be approved, got ${JSON.stringify(artifact.review?.status)}`);
    process.exit(1);
  }
  if (validation.requiresManualReview && !artifact.review?.reviewer) {
    console.error('Refusing to apply: manual review required but reviewer is missing');
    process.exit(1);
  }
  const cardPath = path.join('data', 'cards', `${artifact.card_id}.json`);
  if (!existsSync(cardPath)) {
    console.error(`Refusing to apply: card file not found: ${cardPath}`);
    process.exit(1);
  }
  const card = readJson(cardPath);
  const patched = deepClone(card);
  const changes = artifact.diff?.changes || [];
  if (!changes.length) {
    console.log(`No diff changes in approved artifact. Nothing to apply for ${artifact.card_id}.`);
    return;
  }
  for (const change of changes) {
    setByPath(patched, change.path, change.after);
  }
  patched.last_verified = new Date().toISOString().slice(0, 10);
  const outDir = path.join('artifacts', 'card-updates', 'applied');
  mkdirSync(outDir, { recursive: true });
  const previewPath = path.join(outDir, `${artifact.run_id}.proposed-card.json`);
  writeJson(previewPath, patched);
  if (!write) {
    console.log(`Dry run only. Proposed card written to ${previewPath}. Add --write to update ${cardPath}.`);
    return;
  }
  writeJson(cardPath, patched);
  artifact.review.applied_at = new Date().toISOString();
  artifact.review.applied_to = cardPath;
  writeJson(path.join(outDir, path.basename(artifactPath)), artifact);
  console.log(`Applied ${artifactPath} to ${cardPath}`);
}

function apply(runDir: string): void {
  if (!existsSync(path.join(runDir, 'apply-plan.json'))) applyPlan(runDir);
  const config = configFromRun(runDir);
  const plan = readJson(path.join(runDir, 'apply-plan.json'));
  const write = process.argv.includes('--write');
  if (!write) {
    console.log(`Dry run only. Review ${path.join(runDir, 'review-report.md')}. Use --write to apply when can_apply=true.`);
    return;
  }
  if (!plan.can_apply) {
    console.error(`Refusing to apply: ${plan.recommendation}. Safety/review issues: ${(plan.safety_issues || []).concat(plan.review_reasons || []).join('; ')}`);
    process.exit(1);
  }
  if ((plan.manual_review_fields || []).length) {
    const approvalCheck = validApprovalFor(plan, loadApproval(runDir));
    if (!approvalCheck.ok) {
      console.error(`Refusing to apply: invalid approval.json. ${approvalCheck.issues.join('; ')}`);
      process.exit(1);
    }
  }
  const proposed = readFileSync(path.join(runDir, 'proposed-card.json'), 'utf8');
  writeFileSync(config.cardPath, proposed);
  updateRun(runDir, 'applied_to_production');
  setStatus(runDir, 'applied_to_production');
  console.log(`Applied ${runDir} to ${config.cardPath}`);
}

function updateRun(runDir: string, artifact: string): void {
  const runPath = path.join(runDir, 'run.json');
  const run = readJson(runPath);
  run.artifacts = Array.from(new Set([...(run.artifacts || []), artifact]));
  run.updated_at = new Date().toISOString();
  writeJson(runPath, run);
}

function setStatus(runDir: string, status: string): void {
  const runPath = path.join(runDir, 'run.json');
  const run = readJson(runPath);
  run.status = status;
  run.completed_at = new Date().toISOString();
  writeJson(runPath, run);
}

function extract(runDir: string): void {
  normalize(runDir);
  communityCheck(runDir);
}

function validate(runDir: string): void {
  qa(runDir);
  applyPlan(runDir);
  createArtifact(runDir);
  review(runDir);
  const plan = readJson(path.join(runDir, 'apply-plan.json'));
  setStatus(runDir, plan.can_apply ? 'qa_complete_ready_to_apply' : `qa_complete_${plan.recommendation}`);
}

function runCard(cardId: string): string {
  const runDir = scrape(cardId);
  extract(runDir);
  validate(runDir);
  console.log(runDir);
  return runDir;
}

function main(): void {
  const command = process.argv[2];
  if (!command) usage();
  if (command === 'doctor') doctor();
  else if (command === 'list') console.log(listCardIds().join('\n'));
  else if (command === 'fetch' || command === 'scrape') scrape(configForCard(arg('--card')).cardId);
  else if (command === 'extract') extract(runDirFromArg());
  else if (command === 'normalize') normalize(runDirFromArg());
  else if (command === 'validate') validate(runDirFromArg());
  else if (command === 'artifact') createArtifact(runDirFromArg());
  else if (command === 'community-check') communityCheck(runDirFromArg());
  else if (command === 'qa') qa(runDirFromArg());
  else if (command === 'apply-plan') applyPlan(runDirFromArg());
  else if (command === 'review') review(runDirFromArg());
  else if (command === 'approval-template') approvalTemplate(runDirFromArg());
  else if (command === 'apply') apply(runDirFromArg());
  else if (command === 'run-all') runAll();
  else if (command === 'review-index') reviewIndex();
  else if (command === 'artifact-index') artifactIndex();
  else if (command === 'artifact-approve') artifactApprove();
  else if (command === 'artifact-reject') artifactReject();
  else if (command === 'artifact-apply') artifactApply();
  else if (command === 'run') runCard(configForCard(arg('--card')).cardId);
  else usage();
}

main();
