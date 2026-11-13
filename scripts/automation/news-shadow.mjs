#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseRSS } from '../news-sync-core.mjs';
import { createMiniMaxTranslator } from '../news-provider.mjs';
import { preparePortableNews, readNewsSnapshot, writeShadowArtifacts } from './news-portable.mjs';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--repo', '--sha', '--now', '--slot', '--run-id', '--source', '--provider', '--scratch-root'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('unknown/duplicate/incomplete option');
  options[args[i]] = args[i + 1];
}
async function main() {
  const source = options['--source'] ?? 'fixture', provider = options['--provider'] ?? 'fixture';
  if (!['fixture', 'public'].includes(source) || !['fixture', 'minimax'].includes(provider)) throw new Error('unsupported source/provider');
  const repoPath = path.resolve(options['--repo'] ?? process.cwd());
  const previous = readNewsSnapshot(repoPath, options['--sha']);
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/news.json', import.meta.url), 'utf8'));
  const result = await preparePortableNews({ previous, sourceSha: options['--sha'], now: options['--now'], slot: options['--slot'], runId: options['--run-id'],
    ...(source === 'fixture' ? { sources: fixture.sources, fetchSource: async src => parseRSS(src.rss) } : {}),
    translate: provider === 'minimax' ? createMiniMaxTranslator({ apiKey: process.env.MINIMAX_API_KEY }) : async (items, lang) => items.map(item => {
      const t = fixture.translations?.[item.title]?.[lang];
      if (!t?.title || !t?.summary) throw new Error('fixture translation missing; no live fallback');
      return { ...item, [`title_${lang}`]: t.title, [`summary_${lang}`]: t.summary };
    }),
  });
  console.log(writeShadowArtifacts(result, { scratchRoot: options['--scratch-root'], repoPath }));
}
main().catch(() => { console.error('News shadow failed (snapshot/source/provider/input unavailable); no production writes'); process.exitCode = 1; });
