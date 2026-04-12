#!/usr/bin/env node
/**
 * bin/scraper-usccg.mjs
 *
 * Scrape US Credit Card Guide for structured card data.
 * Expansion mode: Discovers all cards from sitemap and builds DB.
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

function fetch(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const req = get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
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
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBonus(title, text) {
  const titleMatch = title.match(/更新[：:]\s*(\d{2,3})\s*k/i);
  if (titleMatch) return parseInt(titleMatch[1], 10) * 1000;

  const updatePattern = /【\d{4}\.\d+\s*更新】/;
  const firstUpdateIdx = text.search(updatePattern);
  if (firstUpdateIdx > -1) {
    const nextNextUpdate = text.indexOf('【', firstUpdateIdx + 1);
    const section = text.slice(firstUpdateIdx, nextNextUpdate > -1 ? nextNextUpdate + 1 : firstUpdateIdx + 500);
    const kMatch = section.match(/是\s*(\d{2,3})\s*k/i);
    if (kMatch) return parseInt(kMatch[1], 10) * 1000;
    const numMatch = section.match(/可得\s*(\d{1,3}(?:,\d{3})*)/);
    if (numMatch) {
      const v = parseInt(numMatch[1].replace(/,/g, ''), 10);
      if (v >= 20000) return v;
    }
  }
  return null;
}

function extractFee(text) {
  const patterns = [
    /年费[:\s]*\$?(\d{1,4})/i,
    /annual\s+fee[:\s]*\$?(\d{1,4})/i,
    /(\d{2,3})\s*美元\s*年费/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val > 1000 && val < 2100) continue; 
      if (val < 10) continue; // too low to be AF
      return val;
    }
  }
  return null;
}

function extractSpend(text) {
  const patterns = [
    /消费满?\s*\$?([\d,]+)/,
    /(\$?[\d,]+)\s*消费.*可得/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/[$,]/g, ''), 10);
  }
  return null;
}

function extractCardData(html, url) {
  const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] || '').trim();
  const entry = getEntryContent(html);
  const text = stripHtml(entry);
  const name = title.replace(/\s*【[^】]*】.*/, '').replace(/信用卡$/, '').replace(/\s*\([^)]+\)\s*$/, '').trim();
  const bonus = extractBonus(title, text);
  const fee = extractFee(text);
  const spend = extractSpend(text);
  const imgMatch = entry.match(/src="(https:\/\/www\.uscreditcardguide\.com\/wp-content\/uploads\/[^"]+\.(?:png|jpg|jpeg|webp))"/);

  return {
    name, url, annual_fee: fee,
    welcome_offer: bonus ? { bonus_points: bonus, spending_requirement: spend } : null,
    image_url: imgMatch ? imgMatch[1] : null,
  };
}

function saveCard(cardId, data) {
  const file = join(CARDS_DIR, `${cardId}.json`);
  let existing = { card_id: cardId, name: data.name, issuer: "Unknown", network: "Unknown", annual_fee: 0, welcome_offer: null, earning_rates: [], tags: [] };
  try { existing = JSON.parse(readFileSync(file, 'utf8')); } catch { }
  const merged = {
    ...existing,
    name: data.name || existing.name,
    annual_fee: data.annual_fee ?? existing.annual_fee,
    welcome_offer: data.welcome_offer ? { ...existing.welcome_offer, ...data.welcome_offer } : existing.welcome_offer,
    image_url: data.image_url || existing.image_url,
    last_updated: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

async function discoverFromSitemap() {
  const BASE = 'https://www.uscreditcardguide.com';
  const sitemaps = [`${BASE}/post-sitemap1.xml`, `${BASE}/post-sitemap2.xml`, `${BASE}/post-sitemap3.xml`, `${BASE}/post-sitemap4.xml` ];
  const allUrls = [];
  for (const sm of sitemaps) {
    const r = await fetch(sm);
    if (r.status === 200) {
      const urls = r.body.match(/<loc>(https:\/\/www\.uscreditcardguide\.com\/[^<]+)<\/loc>/gi) || [];
      allUrls.push(...urls.map(u => u.replace(/<\/?loc>/g, '')));
    }
  }
  const issuers = ['chase', 'amex', 'american-express', 'citi', 'capital-one', 'discover', 'boa', 'bank-of-america', 'barclay', 'usbank', 'wells-fargo', 'marriott', 'hilton', 'hyatt', 'ihg', 'delta', 'united', 'southwest', 'alaska', 'jetblue', 'apple-card'];
  return allUrls.filter(url => {
    const slug = url.split('/').filter(Boolean).pop();
    if (!slug || slug.split('-').length > 7) return false;
    return issuers.some(iss => slug.toLowerCase().includes(iss));
  }).map(url => ({ url, cardId: url.split('/').filter(Boolean).pop().replace(/-credit-card$/i, '').replace(/[^a-z0-9]+/g, '-') }));
}

async function main() {
  const expand = process.env.EXPAND === 'true';
  const limit = parseInt(process.env.LIMIT || '1000', 10);
  console.log('Discovering cards...');
  const discovered = await discoverFromSitemap();
  const targets = discovered.slice(0, limit);
  console.log(`Scraping ${targets.length} targets...\n`);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const r = await fetch(t.url);
      if (r.status === 200) {
        const data = extractCardData(r.body, t.url);
        const saved = saveCard(t.cardId, data);
        process.stdout.write(`[${i+1}/${targets.length}] ${t.cardId.padEnd(35)} fee=$${saved.annual_fee} bonus=${((saved.welcome_offer?.bonus_points||0)/1000).toFixed(0)}K\n`);
      }
    } catch (e) {}
    await delay(1200);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
