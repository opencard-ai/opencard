import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runNewsSync } from '../sync-news.mjs';
import { isRetryableTranslationError, TranslationError } from '../news-provider.mjs';

export const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Hard cost cap per run: zh + es, plus at most one retry per locale after a retryable failure
 * (HTTP 429/5xx, timeout, network, unusable/partial model output). A clean run still makes 2 requests;
 * only uncached titles are sent. Raised from 2 after run 43540487976 failed on a single bad es response. */
export const MAX_TRANSLATION_CALLS = 4;
export const TRANSLATION_ATTEMPTS_PER_LOCALE = 2;
/** Thin wrapper counting provider invocations (each invocation is exactly one model HTTP request). */
export function countTranslationCalls(translate, { max = MAX_TRANSLATION_CALLS } = {}) {
  if (typeof translate !== 'function') throw new Error('explicit translation provider required');
  if (!Number.isSafeInteger(max) || max < 0) throw new Error('invalid translation call cap');
  const counter = { calls: 0, max };
  const counted = async (items, lang) => {
    // Refuse before calling the provider, so a regression can never exceed the accepted cost.
    if (counter.calls >= max) throw Object.assign(new Error('translation call cap exceeded; feed not published'), { code: 'cap' });
    counter.calls++;
    return translate(items, lang);
  };
  return { translate: counted, counter };
}
/** One bounded retry of the same locale batch; non-retryable failures (credential, auth, cap) fail at once.
 * The final error carries only sanitized fields (code/status) plus `lang` and `attempts`. */
export function retryTranslation(translate, { attempts = TRANSLATION_ATTEMPTS_PER_LOCALE, isRetryable = isRetryableTranslationError,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), backoffMs = error => (error?.code === 'http' ? 5000 : 1000) } = {}) {
  if (typeof translate !== 'function') throw new Error('explicit translation provider required');
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 2) throw new Error('invalid translation attempt count');
  return async (items, lang) => {
    for (let attempt = 1; ; attempt++) {
      try { return await translate(items, lang); } catch (error) {
        if (attempt >= attempts || !isRetryable(error)) throw Object.assign(error, { lang, attempts: attempt });
        await sleep(backoffMs(error));
      }
    }
  };
}
/** Pipeline stage failure; carries only enumerated fields, never upstream bodies, keys or env. */
export class StageError extends Error {
  constructor(stage, fields = {}) { super(`news shadow ${stage} failed`); this.stage = stage; this.fields = fields; }
}
const SAFE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** One-line, allowlisted failure reason for logs and the step summary. */
export function describeFailure(error, stage) {
  const fields = { stage: error?.stage ?? stage ?? 'unknown', ...(error?.fields ?? {}) };
  if (error instanceof TranslationError || error?.code === 'cap') {
    fields.stage = 'translate'; fields.reason = error.code;
    if (error.lang) fields.lang = error.lang;
    if (error.status) fields.status = error.status;
    if (error.attempts) fields.attempts = error.attempts;
  }
  return Object.entries(fields).map(([key, value]) => {
    const text = String(value);
    return `${key}=${SAFE.test(text) ? text : 'unknown'}`;
  }).join(' ');
}
export function readNewsSnapshot(repoPath, sourceSha) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('explicit commit SHA required');
  const git = args => execFileSync('git', ['-C', path.resolve(repoPath), ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    if (git(['rev-parse', '--verify', `${sourceSha}^{commit}`]).trim() !== sourceSha) throw new Error();
    const previous = JSON.parse(git(['show', `${sourceSha}:data/news.json`]));
    if (!Array.isArray(previous.items)) throw new Error();
    return previous;
  } catch { throw new Error('news snapshot unavailable at requested commit'); }
}

/** Real sync path with injected sources/provider/clock; no env files or writes. */
export async function preparePortableNews({ previous, sourceSha, now, slot, runId, ...pipeline }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('invalid source SHA');
  if (!['morning', 'evening'].includes(slot) || !/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new Error('invalid slot/run identity');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(now) || !Number.isFinite(Date.parse(now))) throw new Error('fixed UTC clock required');
  const instant = new Date(now);
  if (instant.toISOString() !== now.replace(/Z$/, '.000Z')) throw new Error('invalid calendar date');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const result = await runNewsSync({ ...pipeline, previous, now: instant });
  const slotKey = `news:${day}:${slot}`;
  return { plan: { version: 1, mode: 'shadow', sourceSha, now, slot, slotKey, runKey: `${slotKey}:${runId}`,
    changed: result.changed, previousSha256: jsonHash(previous), proposedSha256: jsonHash(result.output), itemCount: result.output.items.length,
    allowedFiles: ['data/news.json'], publishes: false }, proposed: result.output };
}

export function writeShadowArtifacts(result, { scratchRoot = os.tmpdir(), repoPath } = {}) {
  const root = fs.realpathSync(scratchRoot);
  if (repoPath) {
    const relative = path.relative(fs.realpathSync(repoPath), root);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('scratch must be outside repo');
  }
  const scratch = fs.mkdtempSync(path.join(root, 'opencard-news-shadow-'));
  for (const [name, value] of Object.entries(result)) fs.writeFileSync(path.join(scratch, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return scratch;
}
