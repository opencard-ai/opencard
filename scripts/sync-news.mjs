import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchRSS, prepareNews } from './news-sync-core.mjs';
import { createMiniMaxTranslator } from './news-provider.mjs';

export const NEWS_SOURCES = Object.freeze([
  { name: 'doctor_of_credit', url: 'https://www.doctorofcredit.com/feed/' },
  { name: 'doctor_of_credit_banking', url: 'https://www.doctorofcredit.com/category/banking/page/1/feed/' },
]);

/** Shared real pipeline: importing this module does not read env/files or run sync. */
export async function runNewsSync({ previous, sources = NEWS_SOURCES, fetchSource, fetchImpl = globalThis.fetch, translate, now = new Date(), rssTimeoutMs = 20000 }) {
  if (typeof translate !== 'function') throw new Error('explicit translation provider required');
  return prepareNews({ previous, sources, now,
    fetchSource: fetchSource ?? (src => fetchRSS(src.url, { fetchImpl, timeoutMs: rssTimeoutMs })), translate });
}

/** Legacy entrypoint only: retained for existing Mac invocation until cutover.
 * The portable shadow runner never calls this env-loading/file-writing function.
 */
export async function legacySync({ cwd = process.cwd() } = {}) {
  try {
    for (const line of fs.readFileSync(path.join(cwd, '.env.local'), 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('legacy environment unavailable'); }
  const outputPath = path.join(cwd, 'data/news.json');
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (!Array.isArray(previous.items)) throw new Error('invalid previous feed');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = await runNewsSync({ previous, translate: createMiniMaxTranslator({ apiKey: process.env.MINIMAX_API_KEY }) });
  if (!result.changed) { console.log('No news content changes; skipped write (no deployment needed).'); return; }
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(result.output, null, 2));
    fs.renameSync(temporary, outputPath);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  console.log(`Written ${result.output.items.length} news items to data/news.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  legacySync().catch(() => {
    console.error('News sync failed; existing feed preserved. Check RSS and translation configuration.');
    process.exitCode = 1;
  });
}
