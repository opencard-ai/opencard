import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runNewsSync } from '../sync-news.mjs';

export const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
