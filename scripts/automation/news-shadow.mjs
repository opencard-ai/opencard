#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fetchRSS, parseRSS } from '../news-sync-core.mjs';
import { createMiniMaxTranslator } from '../news-provider.mjs';
import { countTranslationCalls, describeFailure, preparePortableNews, readNewsSnapshot, retryTranslation, StageError, writeShadowArtifacts } from './news-portable.mjs';

function sourceFailure(error) {
  const status = /^RSS HTTP (\d{3})$/.exec(error?.message ?? '')?.[1];
  if (status) return new StageError('source', { reason: 'http', status });
  if (/RSS/.test(error?.message ?? '')) return new StageError('source', { reason: 'invalid-rss' });
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return new StageError('source', { reason: 'timeout' });
  return new StageError('source', { reason: 'network' });
}

let stage = 'args', counted;
async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--repo', '--sha', '--now', '--slot', '--run-id', '--source', '--provider', '--scratch-root'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new StageError('args');
    options[args[i]] = args[i + 1];
  }
  const source = options['--source'] ?? 'fixture', provider = options['--provider'] ?? 'fixture';
  if (!['fixture', 'public'].includes(source) || !['fixture', 'minimax'].includes(provider)) throw new StageError('args');
  const repoPath = path.resolve(options['--repo'] ?? process.cwd());
  stage = 'snapshot';
  const previous = readNewsSnapshot(repoPath, options['--sha']);
  stage = 'fixture';
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/news.json', import.meta.url), 'utf8'));
  counted = countTranslationCalls(provider === 'minimax' ? createMiniMaxTranslator({ apiKey: process.env.MINIMAX_API_KEY }) : async (items, lang) => items.map(item => {
    const t = fixture.translations?.[item.title]?.[lang];
    if (!t?.title || !t?.summary) throw new StageError('translate', { reason: 'fixture-missing', lang });
    return { ...item, [`title_${lang}`]: t.title, [`summary_${lang}`]: t.summary };
  }));
  let result;
  stage = 'plan';
  try {
    result = await preparePortableNews({ previous, sourceSha: options['--sha'], now: options['--now'], slot: options['--slot'], runId: options['--run-id'],
      fetchSource: source === 'fixture' ? async src => parseRSS(src.rss) : src => fetchRSS(src.url, { timeoutMs: 20000 }).catch(error => { throw sourceFailure(error); }),
      ...(source === 'fixture' ? { sources: fixture.sources } : {}),
      translate: retryTranslation(counted.translate),
    });
  } finally {
    // stderr only (stdout stays the artifact path); a count, never keys or upstream bodies.
    console.error(`news-shadow translationCalls=${counted.counter.calls} max=${counted.counter.max} provider=${provider}`);
  }
  stage = 'artifacts';
  const metrics = { version: 1, provider, translationCalls: counted.counter.calls, maxTranslationCalls: counted.counter.max };
  console.log(writeShadowArtifacts({ ...result, metrics }, { scratchRoot: options['--scratch-root'], repoPath }));
}
main().catch(error => {
  const reason = describeFailure(error, stage);
  console.error(`News shadow failed: ${reason}; no production writes`);
  if (process.env.GITHUB_ACTIONS === 'true') console.error(`::error title=News shadow failed::${reason}; no production writes`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### News plan failed\n- \`${reason}\`\n- No production writes.\n`); } catch {}
  }
  process.exitCode = 1;
});
