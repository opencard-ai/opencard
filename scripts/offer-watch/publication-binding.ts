/** Bind validated bytes/plan/base to the actual Git worktree, index and immutable pushed commit. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { AppliedCard } from './publish-core';
export interface PublicationBinding { worktree: string; baseSha: string; files: Readonly<Record<string, string>>; planDigest: string }
type Run = (cmd: string, args: string[]) => { code: number; stdout: string };
export function gitBlobId(bytes: Buffer): string { return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'); }
export function publicationPlanDigest(applied: AppliedCard[], files: Readonly<Record<string, string>>): string { return createHash('sha256').update(JSON.stringify([applied, Object.entries(files).sort(([a], [b]) => a.localeCompare(b))])).digest('hex'); }
export function capturePublicationBinding(worktree: string, baseSha: string, applied: AppliedCard[], readBytes: (file: string) => Buffer): PublicationBinding {
  if (!/^[0-9a-f]{40}$/.test(baseSha)) throw new Error('validated base SHA invalid');
  const files: Record<string, string> = {};
  for (const card of applied) { if (!/^data\/cards\/[A-Za-z0-9._-]+\.json$/.test(card.file) || files[card.file]) throw new Error('validation file plan invalid'); files[card.file] = gitBlobId(readBytes(card.file)); }
  Object.freeze(files);
  return Object.freeze({ worktree: fs.realpathSync(worktree), baseSha, files, planDigest: publicationPlanDigest(applied, files) });
}
export function assertPublicationBinding(run: Run, binding: PublicationBinding, options: { base?: boolean; index?: string[]; commit?: string; commitFiles?: string[] } = {}) {
  const git = (...args: string[]) => { const r = run('git', args); if (r.code !== 0) throw new Error('publication binding Git evidence unavailable'); return r.stdout.trim(); };
  if (fs.realpathSync(git('rev-parse', '--show-toplevel')) !== binding.worktree) throw new Error('publisher worktree differs from validated worktree');
  if (options.base && git('rev-parse', 'HEAD') !== binding.baseSha) throw new Error('validated base changed');
  // Include index-only edits and every untracked input, not just planned card bytes.
  // Ignored build outputs are never staged; operational artifacts live outside this worktree.
  const planned = new Set(Object.keys(binding.files));
  for (const args of [
    ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', binding.baseSha, '--'],
    ['diff', '--cached', '--no-ext-diff', '--no-renames', '--name-only', '-z', binding.baseSha, '--'],
    ...(options.commit ? [['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', binding.baseSha, options.commit, '--']] : []),
  ]) if (git(...args).split('\0').filter(Boolean).some(file => !planned.has(file))) throw new Error('unvalidated tracked/index/commit input in publisher tree');
  if (git('ls-files', '--others', '--exclude-standard', '-z')) throw new Error('unvalidated untracked input in publisher tree');
  for (const [file, oid] of Object.entries(binding.files)) {
    if (git('hash-object', '--no-filters', '--', file) !== oid) throw new Error('publisher bytes differ from validated bytes');
    if (options.index?.includes(file) && git('rev-parse', '--verify', `:${file}`) !== oid) throw new Error('staged bytes differ from validated bytes');
    if (options.commit && (!options.commitFiles || options.commitFiles.includes(file)) && git('rev-parse', '--verify', `${options.commit}:${file}`) !== oid) throw new Error('committed bytes differ from validated bytes');
  }
}
