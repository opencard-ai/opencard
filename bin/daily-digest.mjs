#!/usr/bin/env node
/**
 * bin/daily-digest.mjs — Aggregate credit card news from all sources
 * Usage: node bin/daily-digest.mjs
 * 
 * Sources:
 *   - Reddit r/churning + r/CreditCards (API, no auth)
 *   - Doctor of Credit (RSS)
 *
 * Output: JSON array of news items sorted by source priority + time
 */

import { get } from 'node:https';

const sources = [
  { name: 'reddit_churning', type: 'reddit', url: 'https://www.reddit.com/r/churning/new.json?limit=10&t=day' },
  { name: 'reddit_creditcards', type: 'reddit', url: 'https://www.reddit.com/r/CreditCards/new.json?limit=10&t=day' },
  { name: 'doctor_of_credit', type: 'rss', url: 'https://www.doctorofcredit.com/feed/' },
];

// ── Fetch helpers ────────────────────────────────────────────────

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'OpenCard/1.0' } }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchReddit(url) {
  return fetch(url).then(r => r.json());
}

// ── Parsers ───────────────────────────────────────────────────

function parseReddit(json, sub) {
  return json.data.children
    .filter(c => !c.data.stickied)
    .map(c => ({
      title: c.data.title,
      url: c.data.url,
      permalink: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
      comments: c.data.num_comments,
      source: `r/${sub}`,
      ts: new Date(c.data.created_utc * 1000).toISOString(),
    }));
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/);
    const links = [...item.matchAll(/<link>(.*?)<\/link>/g)].map(m => m[1]);
    const link = links[links.length - 1] || links[0];
    const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    if (titleMatch && link) {
      items.push({
        title: (titleMatch[1] || titleMatch[2])
          .replace(/&#8217;/g, "'").replace(/&amp;/g, '&'),
        url: link,
        source: 'Doctor of Credit',
        date: dateMatch ? dateMatch[1] : null,
        ts: dateMatch ? new Date(dateMatch[1]).toISOString() : null,
      });
    }
  }
  return items;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const all = [];

  // Reddit
  for (const src of sources.filter(s => s.type === 'reddit')) {
    try {
      const json = await fetchReddit(src.url);
      const posts = parseReddit(json, src.name.replace('reddit_', ''));
      all.push(...posts.filter(p => new Date(p.ts).getTime() > cutoff));
    } catch (e) {
      console.error(`${src.name}: FAILED — ${e.message}`);
    }
  }

  // DoC RSS
  try {
    const src = sources.find(s => s.type === 'rss');
    const xml = await fetchHttps(src.url);
    const items = parseRSS(xml).filter(i => !i.date || new Date(i.date).getTime() > cutoff);
    all.push(...items);
  } catch (e) {
    console.error(`doctor_of_credit: FAILED — ${e.message}`);
  }

  // Sort: DoC first (curated), then by score/time
  const prio = { 'Doctor of Credit': 0, 'r/churning': 1, 'r/CreditCards': 2 };
  all.sort((a, b) => (prio[a.source] ?? 9) - (prio[b.source] ?? 9) || b.score - a.score);

  console.log(JSON.stringify(all, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
