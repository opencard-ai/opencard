import { createHash } from 'node:crypto';
import { parseRSS, prepareNews } from '../news-sync-core.mjs';

/** No IO: fixtures replace RSS and translation. No production env loader is imported. */
export async function prepareNewsDryRun({ fixture, now, slot, runId }) {
  if (!['morning', 'evening'].includes(slot)) throw new Error('invalid slot');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new Error('invalid run identity');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(now) || !Number.isFinite(Date.parse(now))) throw new Error('explicit UTC fixture time required');
  const instant = new Date(now);
  if (instant.toISOString() !== now.replace(/Z$/, '.000Z')) throw new Error('invalid calendar date');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const result = await prepareNews({ previous: fixture.previous, sources: fixture.sources,
    now: instant, fetchSource: async src => parseRSS(src.rss),
    translate: async (items, lang) => items.map(item => {
      const translation = fixture.translations?.[item.title]?.[lang];
      if (!translation?.title || !translation?.summary) throw new Error('fixture translation missing');
      return { ...item, [`title_${lang}`]: translation.title, [`summary_${lang}`]: translation.summary };
    }),
  });
  return { plan: { mode: 'isolated-fixture-dry-run', slotKey: `news:${day}:${slot}`, runKey: `news:${day}:${slot}:${runId}`,
    fixtureSha256: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'), now,
    changed: result.changed, allowedFiles: ['data/news.json'], itemCount: result.output.items.length,
    // Identity is for comparison only. No durable dedup/ownership lease is implemented here.
    writesProductionState: false, publishes: false }, proposed: result.output };
}
