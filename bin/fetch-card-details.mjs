#!/usr/bin/env node
/**
 * bin/fetch-card-details.mjs — Fetch structured card data from US Credit Card Guide
 *
 * Uses node-html-parser for proper DOM parsing and targets specific content areas.
 * Extracts: welcome bonus, annual fee, earning categories, card name.
 *
 * Usage:
 *   node bin/fetch-card-details.mjs                    # test fetch 3 cards
 *   SINGLE=chase-sapphire-preferred node bin/fetch-card-details.mjs  # single
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'node:https';
import { parse } from 'node-html-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INDEX_FILE = join(ROOT, 'data', 'all-cards-index.json');

// ── Fetch ──────────────────────────────────────────────────────

async function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } }, res => {
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

// ── Extractors ─────────────────────────────────────────────────

function extractNumbers(text) {
  return [...text.matchAll(/(\d[\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
}

function extractCardData(html, url) {
  const root = parse(html);

  // Get page title
  const titleEl = root.querySelector('h1');
  const title = titleEl ? titleEl.text.trim() : '';

  // Get article content (the main post body)
  // US Credit Card Guide uses: <div class="entry-content"> or <div class="post-content">
  const contentEl = root.querySelector('.entry-content, .post-content, article, .article-content');
  const content = contentEl ? contentEl.text : root.text;

  // Get first 6000 chars of actual content (avoid sidebar noise)
  const section = content.slice(0, 6000);

  // Extract annual fee - look for "$XXX annual fee" pattern near the start
  let annualFee = null;
  const feePatterns = [
    /(?:annual\s+fee|annual\s+fee\s+waived)[:\s]*\$?(\d+)/i,
    /\$\s*(\d{3})\s*(?:annual\s+fee|yearly)/i,
    /年费[:\s]*\$?(\d+)/i,
  ];
  for (const p of feePatterns) {
    const m = section.match(p);
    if (m) { annualFee = parseInt(m[1], 10); break; }
  }

  // Extract welcome bonus - look for large numbers (50K-300K) in first section
  const bonusCandidates = extractNumbers(section)
    .filter(n => n >= 30000 && n <= 500000);
  const bonus = bonusCandidates.length > 0 ? bonusCandidates[0] : null;

  // Extract earning rates - look for "X% / X points on category"
  const ratePattern = /(\d+)x?\s*(?:%|percent)?\s*(?:points?|miles?|cash\s*back)?\s*(?:on|in|at|for)\s+([^.,\n]{3,50})/gi;
  const rates = [];
  let m;
  while ((m = ratePattern.exec(section)) !== null && rates.length < 12) {
    const rate = parseInt(m[1], 10);
    const cat = m[2].trim().toLowerCase().replace(/\s+/g, ' ');
    if (rate < 1 || rate > 20) continue;
    if (cat.length < 3) continue;
    rates.push({ rate, category: cat });
  }

  // Deduplicate rates by category
  const seen = new Set();
  const deduped = rates.filter(r => {
    if (seen.has(r.category)) return false;
    seen.add(r.category);
    return true;
  });

  // Get card image URL
  const imgEl = root.querySelector('article img, .entry-content img');
  const imageUrl = imgEl ? imgEl.getAttribute('src') : null;

  return {
    title,
    url,
    annual_fee: annualFee,
    welcome_bonus: bonus,
    earning_rates: deduped.slice(0, 8),
    image_url: imageUrl,
    raw_length: content.length,
  };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const singleMode = process.env.SINGLE;

  if (singleMode) {
    // Fetch single card by name/id
    const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
    const card = index.cards.find(c =>
      c.name.toLowerCase().replace(/\s+/g, '-').includes(singleMode) ||
      c.url.includes(singleMode)
    );
    if (!card) { console.error(`Card not found: ${singleMode}`); process.exit(1); }
    console.log(`Fetching: ${card.name}`);
    const r = await fetch(card.url);
    if (r.status !== 200) { console.error(`HTTP ${r.status}`); process.exit(1); }
    const data = extractCardData(r.body, card.url);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Load filtered index
  let index;
  try {
    index = JSON.parse(readFileSync(INDEX_FILE.replace('.json', '-filtered.json'), 'utf8'));
  } catch {
    index = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  }

  // Strict filter: must look like a real card review page
  const isCard = (name, url) => {
    const slug = url.replace('https://www.uscreditcardguide.com/', '').replace(/\/+$/, '');
    const wordCount = slug.split('-').length;
    if (wordCount > 6) return false;
    if (name.length < 5) return false;
    if (/[一-鿿]/.test(name)) return false;
    if (/\d{4}/.test(name)) return false;
    const noise = ['how to', 'best of', 'guide to', 'tips', 'faq', 'promo', 'deal',
      'change', 'update', 'news', 'rule', 'experience', 'map', 'introduction',
      'comparison', 'summary', 'will', 'can ', 'should', 'is ', 'does ', 'what ',
      'why ', 'when '];
    if (noise.some(n => name.toLowerCase().startsWith(n))) return false;
    return true;
  };

  const realCards = index.cards.filter(c => isCard(c.name, c.url));
  console.log(`Real card pages: ${realCards.length}`);

  // Test on 5 known good cards
  const testCards = [
    'chase-sapphire-preferred',
    'amex-platinum-card',
    'capital-one-venture',
    'discover-it-cash-back',
    'chase-marriott-boundless',
  ];

  console.log('\nTesting extraction on known cards:');
  for (const testId of testCards) {
    const card = realCards.find(c => c.url.includes(testId));
    if (!card) { console.log(`  ${testId}: not in index`); continue; }

    process.stdout.write(`  ${card.name.slice(0, 45)}... `);
    const r = await fetch(card.url);
    if (r.status !== 200) { console.log(`HTTP ${r.status}`); continue; }
    const data = extractCardData(r.body, card.url);
    console.log(`fee=$${data.annual_fee || '?'} bonus=${data.welcome_bonus || '?'} rates=${data.earning_rates.length}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
