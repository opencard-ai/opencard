import { decode } from 'html-entities';
import { isDeepStrictEqual } from 'node:util';

// A timeout covers headers AND body; fetch rejects truncated HTTP bodies.
export async function fetchRSS(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'OpenCard/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  return parseRSS(await response.text());
}

export function parseRSS(xml) {
  // Reject HTML error pages, truncated XML and malformed items rather than publishing a partial feed.
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>\s*<\/rss>\s*$/i.test(xml)) {
    throw new Error('Invalid or incomplete RSS');
  }
  const matches = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)];
  if ((xml.match(/<item\b/g) || []).length !== matches.length) throw new Error('Incomplete RSS items');
  return matches.map(([, item]) => {
    const field = name => {
      const raw = item.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? '';
      return decode(raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim());
    };
    const title = field('title');
    const url = field('link');
    const date = Date.parse(field('pubDate'));
    if (!title || !/^https?:\/\//.test(url) || !Number.isFinite(date)) throw new Error('Invalid RSS item');
    const categories = [...item.matchAll(/<category>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/category>/g)]
      .map(m => m[1] || m[2]);
    return { title, url, source: 'Doctor of Credit', categories, ts: new Date(date).toISOString() };
  });
}

const complete = (item, lang) =>
  typeof item?.[`title_${lang}`] === 'string' && item[`title_${lang}`].trim() !== '' &&
  typeof item?.[`summary_${lang}`] === 'string' && item[`summary_${lang}`].trim() !== '';

export async function prepareNews({ previous, sources, fetchSource, translate, now = new Date() }) {
  // Any source failure aborts the whole sync, including translation and disk write.
  const batches = await Promise.all(sources.map(fetchSource));
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  const unique = new Map(batches.flat().filter(i => Date.parse(i.ts) > cutoff).map(i => [i.url, i]));
  const items = [...unique.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || a.url.localeCompare(b.url)).slice(0, 15);
  const oldByURL = new Map((previous?.items ?? []).map(i => [i.url, i]));
  const processed = items.map(item => {
    const old = oldByURL.get(item.url);
    const result = { ...item, title_en: item.title, summary_en: '' };
    // Translation input consists only of title. Metadata changes need no retranslation.
    if (old?.title === item.title) {
      for (const lang of ['zh', 'es']) {
        result[`title_${lang}`] = old[`title_${lang}`] ?? item.title;
        result[`summary_${lang}`] = old[`summary_${lang}`] ?? '';
      }
    }
    return result;
  });
  for (const lang of ['zh', 'es']) {
    const pending = processed.filter(item => !complete(item, lang));
    if (!pending.length) continue;
    const translated = await translate(pending, lang);
    pending.forEach((item, index) => {
      // Keep known partial translations on failure; missing fields remain retryable next run.
      const candidate = translated[index];
      if (complete(candidate, lang)) {
        item[`title_${lang}`] = candidate[`title_${lang}`];
        item[`summary_${lang}`] = candidate[`summary_${lang}`];
      } else {
        item[`title_${lang}`] ??= item.title;
        item[`summary_${lang}`] ??= '';
      }
    });
  }
  if (isDeepStrictEqual(previous?.items, processed)) return { changed: false, output: previous };
  return { changed: true, output: { items: processed, fetched: now.toISOString() } };
}
