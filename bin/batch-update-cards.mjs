#!/usr/bin/env node
/**
 * bin/batch-update-cards.mjs — Batch update all 14 cards from US Credit Card Guide
 *
 * Sources:
 *  - US Credit Card Guide (primary, detailed)
 *  - DoC (secondary, for cross-verification)
 *  - Bank official (for critical fields like annual_fee)
 *
 * Usage: node bin/batch-update-cards.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CARDS_DIR = join(ROOT, 'data', 'cards');

// ── Fetch ───────────────────────────────────────────────────────

async function fetch(url) {
  const { get } = await import('node:https');
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'OpenCard/1.0' } }, res => {
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

function extractNumbers(text) {
  return [...text.matchAll(/(\d[\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
}

function extractBonus(text) {
  // Match patterns like "100,000 points", "125K bonus", "75,000"
  const patterns = [
    /(\d[\d,]+)\s*(?:k|K)?\s*points?(?:\s+bonus)?/i,
    /bonus[:\s]+(\d[\d,]+)/i,
    /(\d[\d,]+)\s*(?:mile|miles|UR|MR|TYP)/i,
    /(\d{5,6})\s*points?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return null;
}

function extractAnnualFee(text) {
  const m = text.match(/annual\s+fee[:\s]*\$?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── Fetch from US Credit Card Guide ────────────────────────────

const CARD_SLUGS = {
  'chase-sapphire-reserve': 'chase-sapphire-reserve',
  'chase-sapphire-preferred': 'chase-sapphire-preferred',
  'chase-marriott-boundless': 'marriott-bonvoy-boundless-credit-card',
  'amex-platinum-personal': 'amex-platinum-card',
  'amex-hilton-aspire': 'hilton-aspire-card',
  'amex-hilton-honors': 'hilton-honors-credit-card',
  'amex-hilton-surpass': 'hilton-honors-surpass-credit-card',
  'citi-strata-elite': 'citi-strata-elite-credit-card',
  'discover-customized-cash': 'discover-it-cash-back',
  'bofa-customized-cash': 'bank-of-america-customized-cash-rewards',
  'bofa-atmos-ascent': 'bank-of-america-atmos-rewards-ascent',
  'bofa-atmos-summit': 'bank-of-america-atmos-rewards-summit',
  'bofa-travel-rewards': 'bank-of-america-travel-rewards-credit-card',
  'apple-card': 'apple-card',
};

async function fetchCardFromUSCCG(slug) {
  const url = `https://www.uscreditcardguide.com/${slug}/`;
  const r = await fetch(url);
  if (r.status !== 200) return null;

  const body = r.body.slice(0, 15000); // first 15k chars
  const numbers = extractNumbers(body).filter(n => n >= 10000 && n <= 500000);
  const fees = extractNumbers(body).filter(n => n >= 0 && n <= 2000);
  const bonus = extractBonus(body);
  const fee = extractAnnualFee(body);

  return { numbers, bonus, fee, url };
}

async function fetchCardFromDoc(slug) {
  // Try to get the specific DoC card page
  const url = `https://www.doctorofcredit.com/credit-cards/${slug}/`;
  const r = await fetch(url);
  if (r.status !== 200) return null;
  const body = r.body.slice(0, 10000);
  const bonus = extractBonus(body);
  return { bonus };
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const cardIds = readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  console.log(`Updating ${cardIds.length} cards...\n`);

  for (const cardId of cardIds) {
    const slug = CARD_SLUGS[cardId];
    if (!slug) {
      console.log(`⏭️  ${cardId}: no slug mapping, skipping`);
      continue;
    }

    const card = JSON.parse(readFileSync(join(CARDS_DIR, `${cardId}.json`), 'utf8'));
    const before = JSON.stringify(card.welcome_offer);

    // Fetch from both sources
    const [usccg, doc] = await Promise.all([
      fetchCardFromUSCCG(slug),
      fetchCardFromDoc(slug),
    ]);

    const updates = [];
    if (usccg) {
      if (usccg.bonus) updates.push(`USCCG bonus: ${usccg.bonus.toLocaleString()}`);
      if (usccg.fee) updates.push(`USCCG fee: $${usccg.fee}`);
    }
    if (doc) {
      if (doc.bonus) updates.push(`DoC bonus: ${doc.bonus.toLocaleString()}`);
    }

    console.log(`${card.name}: ${updates.join(' | ') || 'no data'}`);

    await new Promise(r => setTimeout(r, 1000)); // rate limit
  }
}

main().catch(e => { console.error(e); process.exit(1); });
