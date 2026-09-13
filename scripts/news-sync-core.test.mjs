import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRSS, parseRSS, prepareNews } from './news-sync-core.mjs';
const now = new Date('2026-09-13T17:00:00Z');
const sourceItem = { title: 'New offer', url: 'https://example.com/news', source: 'Doctor of Credit', categories: [], ts: '2026-09-13T12:00:00.000Z' };
const fullItem = { ...sourceItem, title_en: sourceItem.title, summary_en: '', title_zh: '新優惠', summary_zh: '優惠摘要', title_es: 'Oferta', summary_es: 'Resumen' };
const previous = { items: [fullItem], fetched: '2026-09-13T13:00:00Z' };
const options = { now, previous, sources: ['one'], fetchSource: async () => [sourceItem], translate: async () => { throw Error('must not translate'); } };
test('unchanged content skips translation and preserves timestamp/object', async () => {
  const result = await prepareNews(options);
  assert.equal(result.changed, false);
  assert.equal(result.output, previous);
});
test('missing locale retries only missing items, then next run is no-op', async () => {
  const incomplete = { ...fullItem, summary_es: '' };
  let calls = 0;
  const result = await prepareNews({ ...options, previous: { ...previous, items: [incomplete] }, translate: async (items, lang) => {
    calls++;
    assert.equal(lang, 'es'); assert.equal(items.length, 1);
    return [{ ...items[0], title_es: 'Oferta', summary_es: 'Resumen' }];
  }});
  assert.equal(calls, 1); assert.equal(result.changed, true);
  assert.equal((await prepareNews({ ...options, previous: result.output })).changed, false);
});
test('failed translation does not destroy partial cached content or update timestamp', async () => {
  const partial = { ...previous, items: [{ ...fullItem, summary_es: '' }] };
  const result = await prepareNews({ ...options, previous: partial, translate: async items => items.map(i => ({ ...i, title_es: i.title, summary_es: '' })) });
  assert.equal(result.changed, false); assert.equal(result.output, partial);
});
test('changed title invalidates both translations; metadata alone reuses them', async () => {
  let calls = 0;
  const changed = await prepareNews({ ...options, fetchSource: async () => [{ ...sourceItem, title: 'Changed' }], translate: async (items, lang) => {
    calls++; return items.map(i => ({ ...i, [`title_${lang}`]: 'Changed translation', [`summary_${lang}`]: 'Summary' }));
  }});
  assert.equal(calls, 2); assert.equal(changed.changed, true);
  const metadata = await prepareNews({ ...options, fetchSource: async () => [{ ...sourceItem, categories: ['Cards'] }] });
  assert.equal(metadata.changed, true); assert.equal(metadata.output.items[0].title_zh, fullItem.title_zh);
});
test('partial RSS source failure aborts before translation; previous remains intact', async () => {
  const snapshot = structuredClone(previous);
  await assert.rejects(prepareNews({ ...options, sources: ['one', 'two'], fetchSource: async name => { if (name === 'two') throw Error('offline'); return []; } }), /offline/);
  assert.deepEqual(previous, snapshot);
});
test('healthy empty feed expires items, unlike failed feed', async () => {
  const result = await prepareNews({ ...options, fetchSource: async () => [] });
  assert.equal(result.changed, true); assert.deepEqual(result.output.items, []);
});
test('RSS parsing rejects error pages, truncation, invalid dates and malformed items', () => {
  for (const xml of ['<html>Error</html>', '<rss><channel><item></channel></rss>', '<rss><channel><item><title>X</title></item></channel></rss>']) assert.throws(() => parseRSS(xml));
  const xml = '<rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://example.com</link><pubDate>Sun, 13 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>';
  assert.equal(parseRSS(xml)[0].title, 'A & B');
});
test('HTTP errors and timeout rejection propagate without any network', async () => {
  await assert.rejects(fetchRSS('https://example.com', { fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(fetchRSS('https://example.com', { fetchImpl: async (_url, { signal }) => { assert.ok(signal instanceof AbortSignal); throw new DOMException('Timed out', 'TimeoutError'); } }), /Timed out/);
  await assert.rejects(fetchRSS('https://example.com', { fetchImpl: async () => ({ ok: true, text: async () => { throw Error('truncated body'); } }) }), /truncated/);
});
