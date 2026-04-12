#!/usr/bin/env node
/**
 * scraper/doc.mjs — Fetch latest posts from Doctor of Credit via RSS
 * Usage: node bin/scrapers/doc.mjs [limit]
 */

import { get } from 'node:https';

function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'OpenCard/1.0' } }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseRSS(xml) {
  const items = [];
  // Extract each <item> block
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    // Title: may or may not have CDATA
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/);
    // Link: grab the LAST link in the item (first is site URL)
    const links = [...item.matchAll(/<link>(.*?)<\/link>/g)].map(m => m[1]);
    const link = links[links.length - 1] || links[0];
    const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

    if (titleMatch && link) {
      items.push({
        title: (titleMatch[1] || titleMatch[2])
          .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"')
          .replace(/&#8221;/g, '"').replace(/&amp;/g, '&'),
        link: link,
        date: dateMatch ? dateMatch[1] : null,
      });
    }
  }
  return items;
}

async function main() {
  const limit = parseInt(process.argv[2]) || 8;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const xml = await fetch('https://www.doctorofcredit.com/feed/');
  const items = parseRSS(xml).filter(item => {
    if (!item.date) return true;
    return new Date(item.date).getTime() > cutoff;
  });

  console.log(JSON.stringify(items.slice(0, limit)));
}

main().catch(e => { console.error(e); process.exit(1); });
