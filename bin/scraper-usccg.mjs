#!/usr/bin/env node
/**
 * bin/scraper-usccg.mjs
 *
 * Scrape US Credit Card Guide for structured card data.
 * This is the PRIMARY source for card data updates.
 *
 * Usage:
 *   node bin/scraper-usccg.mjs                    # scrape all known cards
 *   SCRAPE_ONE=chase-sapphire-preferred node bin/scraper-usccg.mjs
 *   SCRAPE_URL=https://... node bin/scraper-usccg.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CARDS_DIR = join(ROOT, 'data', 'cards');
const REPORT_FILE = join(ROOT, 'data', 'scrape-report.json');
mkdirSync(CARDS_DIR, { recursive: true });

// ── HTTP ─────────────────────────────────────────────────────

function fetch(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const req = get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location, retries).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200 && retries > 0) {
        setTimeout(() => fetch(url, retries - 1).then(resolve).catch(reject), 1500);
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => reject(e));
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── HTML extraction helpers ─────────────────────────────────

function getEntryContent(html) {
  const marker = 'class="entry-content-inner"';
  const start = html.indexOf(marker);
  if (start === -1) return '';
  const bodyStart = start + marker.length;
  let depth = 0, p = bodyStart;
  while (p < html.length) {
    const nextOpen = html.indexOf('<div', p);
    const nextClose = html.indexOf('</div>', p);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; p = nextOpen + 4; }
    else {
      if (depth === 0) return html.slice(bodyStart, nextClose);
      depth--; p = nextClose + 6;
    }
  }
  return '';
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Bonus extraction ─────────────────────────────────────────

function extractBonus(title, text) {
  // 1. From title: 【...更新：75k 开卡奖励】
  const titleMatch = title.match(/更新[：:]\s*(\d{2,3})\s*k/i);
  if (titleMatch) return parseInt(titleMatch[1], 10) * 1000;

  // 2. From most recent update section
  const updatePattern = /【\d{4}\.\d+\s*更新】/;
  const firstUpdateIdx = text.search(updatePattern);
  if (firstUpdateIdx > -1) {
    const nextNextUpdate = text.indexOf('【', firstUpdateIdx + 1);
    const section = text.slice(firstUpdateIdx, nextNextUpdate > -1 ? nextNextUpdate + 1 : firstUpdateIdx + 500);
    // "是 75k" or "可得 75,000"
    const kMatch = section.match(/是\s*(\d{2,3})\s*k/i);
    if (kMatch) return parseInt(kMatch[1], 10) * 1000;
    const numMatch = section.match(/可得\s*(\d{1,3}(?:,\d{3})*)/);
    if (numMatch) {
      const v = parseInt(numMatch[1].replace(/,/g, ''), 10);
      if (v >= 20000) return v;
    }
  }

  // 3. From main content (skip update paragraphs)
  const firstUpdate = text.indexOf('【');
  const mainText = firstUpdate > -1 ? text.slice(0, firstUpdate) : text;
  // "可得 X,XXX UR" or "可得 X,XXX points"
  const keDeMatch = mainText.match(/可得\s*(\d{1,3}(?:,\d{3})*)\s*(?:k|K|点|UR|MR|points?|miles?)/i);
  if (keDeMatch) {
    const v = parseInt(keDeMatch[1].replace(/,/g, ''), 10);
    if (v >= 20000) return v;
  }

  // 4. Any "Xk 开卡奖励" in text
  const anyK = text.match(/(\d{2,3})\s*k\s*(?:开卡)?/i);
  if (anyK) return parseInt(anyK[1], 10) * 1000;

  return null;
}

// ── Fee extraction ──────────────────────────────────────────

function extractFee(text) {
  const patterns = [
    /年费[^\d]*\$?(\d+)/,
    /年费\s*\$?(\d+)/,
    /annual\s+fee[^\d]*\$?(\d+)/i,
    /(\d{3})\s*美元\s*年费/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// ── Spending requirement ─────────────────────────────────────

function extractSpend(text) {
  const patterns = [
    /消费满?\s*\$?([\d,]+)/,
    /(\$?[\d,]+)\s*消费.*可得/,
    /满\s*\$?([\d,]+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/[$,]/g, ''), 10);
  }
  return null;
}

// ── Image ───────────────────────────────────────────────────

function extractImage(entry) {
  const m = entry.match(/src="(https:\/\/www\.uscreditcardguide\.com\/wp-content\/uploads\/[^"]+\.(?:png|jpg|jpeg|webp))"/);
  return m ? m[1] : null;
}

// ── Main extractor ───────────────────────────────────────────

function extractCardData(html, url) {
  const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] || '').trim();
  const entry = getEntryContent(html);
  const text = stripHtml(entry);

  const name = title.replace(/\s*【[^】]*】.*/, '').replace(/信用卡$/, '').replace(/\s*\([^)]+\)\s*$/, '').trim();

  const bonus = extractBonus(title, text);
  const fee = extractFee(text);
  const spend = extractSpend(text);
  const imageUrl = extractImage(entry);

  return {
    name,
    url,
    title,
    annual_fee: fee,
    welcome_bonus: bonus,
    spending_requirement: spend,
    image_url: imageUrl,
    text_length: text.length,
  };
}

// ── Save/update card JSON ────────────────────────────────────

function saveCard(cardId, data) {
  const file = join(CARDS_DIR, `${cardId}.json`);
  let existing = {};
  try { existing = JSON.parse(readFileSync(file, 'utf8')); } catch { /* new */ }

  const merged = {
    ...existing,
    name: data.name || existing.name,
    annual_fee: data.annual_fee ?? existing.annual_fee,
    welcome_offer: data.welcome_bonus
      ? {
          ...(existing.welcome_offer || {}),
          bonus_points: data.welcome_bonus,
          spending_requirement: data.spending_requirement || existing.welcome_offer?.spending_requirement || null,
        }
      : existing.welcome_offer,
    image_url: data.image_url || existing.image_url,
    sources: [
      { name: 'US Credit Card Guide', url: data.url, updated: new Date().toISOString().slice(0, 10) },
      ...(existing.sources || []).filter(s => !s.url.includes('uscreditcardguide')),
    ],
    last_updated: new Date().toISOString().slice(0, 10),
  };

  writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

// ── Known card URLs (from sitemap + manual verification) ─────

const KNOWN_CARDS = [
  { cardId: 'chase-sapphire-reserve', url: 'chase-sapphire-reserve' },
  { cardId: 'chase-sapphire-preferred', url: 'chase-sapphire-preferred' },
  { cardId: 'amex-platinum-personal', url: 'amex-platinum' },
  { cardId: 'amex-hilton-aspire', url: 'amex-hilton-aspire-credit-card' },
  { cardId: 'amex-hilton-honors', url: 'amex-hilton-credit-card' },
  { cardId: 'amex-hilton-surpass', url: 'amex-hilton-surpass-credit-card' },
  { cardId: 'citi-strata-elite', url: 'citi-strata-elite-credit-card' },
  { cardId: 'discover-it', url: 'discover-it' },
  { cardId: 'bofa-travel-rewards', url: 'boa-travel-rewards' },
  { cardId: 'apple-card', url: 'apple-card-credit-card' },
];


// ── Scrape one ──────────────────────────────────────────────

async function scrapeOne(cardId, urlSlug) {
  const BASE = 'https://www.uscreditcardguide.com';
  const url = `${BASE}/${urlSlug}/`;
  const r = await fetch(url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return saveCard(cardId, extractCardData(r.body, url));
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const single = process.env.SCRAPE_ONE;
  const scrapeUrl = process.env.SCRAPE_URL;
  const report = [];

  if (single && !scrapeUrl) {
    // Find URL from known cards
    const found = KNOWN_CARDS.find(c => c.cardId === single || c.url.includes(single));
    const url = found ? found.url : single;
    console.log(`Scraping: ${url}`);
    const data = await scrapeOne(single, url);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (scrapeUrl) {
    // Scrape arbitrary URL
    const cardId = scrapeUrl.replace('https://www.uscreditcardguide.com/', '').replace(/\/+$/, '').replace(/-credit-card$/i, '');
    console.log(`Scraping URL: ${scrapeUrl}`);
    const r = await fetch(scrapeUrl);
    if (r.status !== 200) { console.error(`HTTP ${r.status}`); process.exit(1); }
    const data = extractCardData(r.body, scrapeUrl);
    const saved = saveCard(cardId, data);
    console.log(JSON.stringify(saved, null, 2));
    return;
  }

  // Scrape all known cards
  console.log(`Scraping ${KNOWN_CARDS.length} known cards...\n`);

  for (const { cardId, url } of KNOWN_CARDS) {
    process.stdout.write(`  ${cardId.padEnd(30)} `);
    try {
      const data = await scrapeOne(cardId, url);
      const bonus = data.welcome_offer?.bonus_points;
      console.log(`✓ fee=$${data.annual_fee ?? '?'} bonus=${bonus ? `${(bonus/1000).toFixed(0)}K` : '?'}`);
      report.push({ cardId, status: 'ok', fee: data.annual_fee, bonus });
    } catch (e) {
      console.log(`✗ ${e.message}`);
      report.push({ cardId, status: 'fail', error: e.message });
    }
    await delay(1500);
  }

  writeFileSync(REPORT_FILE, JSON.stringify({ saved: report.filter(r => r.status === 'ok').length, failed: report.filter(r => r.status === 'fail').length, report, updated: new Date().toISOString() }, null, 2));
  console.log(`\nDone → ${REPORT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
