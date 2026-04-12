#!/usr/bin/env node
/**
 * scraper/reddit.mjs — Fetch latest posts from Reddit r/churning
 * Uses Node.js built-in fetch (v18+)
 * Usage: node bin/scrapers/reddit.mjs [limit]
 */

const SUBREDDITS = ['churning', 'CreditCards'];
const LIMIT = parseInt(process.argv[2]) || 8;

async function fetchSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${LIMIT}&t=day`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OpenCard/1.0 (by /u/OpenCardAI)' }
  });
  if (!res.ok) throw new Error(`Reddit ${sub} failed: ${res.status}`);
  const json = await res.json();
  return json.data.children.map(c => ({
    title: c.data.title,
    score: c.data.score,
    comments: c.data.num_comments,
    url: c.data.url,
    permalink: `https://reddit.com${c.data.permalink}`,
    subreddit: sub,
    ts: new Date(c.data.created_utc * 1000).toISOString(),
  }));
}

async function main() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const all = [];

  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchSubreddit(sub);
      all.push(...posts.filter(p => new Date(p.ts).getTime() > cutoff));
    } catch (e) {
      console.error(`r/${sub}:`, e.message);
    }
  }

  all.sort((a, b) => b.score - a.score);
  const out = all.slice(0, LIMIT);
  console.log(JSON.stringify(out));
}

main().catch(e => { console.error(e); process.exit(1); });
