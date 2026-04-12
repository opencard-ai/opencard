#!/usr/bin/env node
/**
 * bin/scrape-usccg-index.mjs — Scrape all card review URLs from US Credit Card Guide
 *
 * Run: node bin/scrape-usccg-index.mjs
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'node:https';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT = join(ROOT, 'data', 'all-cards-index.json');

async function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'Googlebot/2.1' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function parseXMLLoc(body) {
  return [...body.matchAll(/<loc[^>]*>(.*?)<\/loc>/gi)].map(m => m[1].trim());
}

function isCardReviewUrl(url) {
  // Fast reject patterns
  if (/category|tag|author|page|feed|wp-content|attachment/i.test(url)) return false;
  if (/\/[12][0-9]{3}\//.test(url)) return false; // year-based
  if (/[一-鿿]/.test(url)) return false; // Chinese chars
  if (/how-to|best-of|best-credit|guide-to|churning|manufactured|annual-fee-waived|branch-offer|online-offer|in-branch|targeted|popup|retention/i.test(url)) return false;

  const slug = url.replace('https://www.uscreditcardguide.com/', '').replace(/\/+$/, '');

  // Card slugs are usually 2-8 dashes (short)
  if (slug.split('-').length > 10) return false;

  // Must be a known bank/issuer
  const banks = ['chase', 'amex', 'citi', 'capital-one', 'capitalone', 'discover',
    'bank-of-america', 'boa', 'barclays', 'usbank', 'us-bank', 'wells-fargo',
    'hsbc', 'synchrony', 'marriott', 'hilton', 'hyatt', 'ihg', 'delta', 'united',
    'southwest', 'alaska', 'jetblue', 'frontier', 'spirit', 'bilt', 'apple-card', 'goldman'];
  if (!banks.some(b => url.includes(b))) return false;

  // Exclude if slug contains standalone article words like "offer", "bonus" at start
  const slugLower = slug.toLowerCase();
  const articleStarts = ['offer', 'bonus', 'promotion', 'deal', 'tips', 'guide', 'comparison', 'update', 'news', 'change'];
  for (const w of articleStarts) {
    if (slugLower === w || slugLower.startsWith(w + '-') || slugLower.startsWith(w + '/')) return false;
  }

  return true;
}

function extractCardName(url) {
  const slug = url.replace('https://www.uscreditcardguide.com/', '').replace(/\/+$/, '');
  return slug
    .replace(/-credit-card\/?$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

async function main() {
  console.log('Fetching sitemap index...');
  const idx = await fetch('https://www.uscreditcardguide.com/sitemap_index.xml');
  const sitemaps = parseXMLLoc(idx.body).filter(u => u.includes('post-sitemap'));
  console.log(`Found ${sitemaps.length} sitemap files`);

  const allUrls = new Set();
  for (const sm of sitemaps) {
    process.stdout.write(`  Fetching ${sm.split('/').pop()}... `);
    const r = await fetch(sm);
    const locs = parseXMLLoc(r.body);
    console.log(`${locs.length} URLs`);
    locs.forEach(u => allUrls.add(u));
    await new Promise(r => setTimeout(r, 300));
  }

  // Filter to card review URLs
  const cardUrls = [...allUrls]
    .filter(isCardReviewUrl)
    .map(url => ({ url, name: extractCardName(url) }));

  // Deduplicate by name
  const seen = new Set();
  const cards = cardUrls.filter(c => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cards.sort((a, b) => a.name.localeCompare(b.name));

  const result = {
    total: cards.length,
    scraped_at: new Date().toISOString(),
    source: 'https://www.uscreditcardguide.com',
    cards,
  };

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`\n✅ Found ${cards.length} card URLs → ${OUTPUT}`);
  console.log('\nAll cards:');
  cards.forEach(c => console.log(`  ${c.name}`));
}

main().catch(e => { console.error(e); process.exit(1); });
