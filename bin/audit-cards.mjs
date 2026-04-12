#!/usr/bin/env node
/**
 * bin/audit-cards.mjs — Audit all 14 cards against live sources
 *
 * Produces a prioritized list of which card fields need verification/update.
 * Output: JSON report + human-readable summary
 *
 * What it checks:
 *  1. Fetch each card's known sources (DoC page, US Credit Card Guide page)
 *  2. Extract key fields (welcome_bonus, annual_fee)
 *  3. Compare with current JSON data
 *  4. Flag discrepancies
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CARDS_DIR = join(ROOT, 'data', 'cards');
const REPORT_DIR = join(ROOT, 'data', 'audit-reports');
mkdirSync(REPORT_DIR, { recursive: true });

// ── Fetch ───────────────────────────────────────────────────────

function fetch(url) {
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

// ── Extract numbers from text ──────────────────────────────────

function extractNumbers(text) {
  const matches = [...text.matchAll(/(\d[\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
  return [...new Set(matches)];
}

function extractBonus(text) {
  // Look for bonus patterns: "100,000 points", "100K points", "125000"
  const patterns = [
    /(\d[\d,]+)\s*(?:k|K)?\s*points?/i,
    /(\d[\d,]+)\s*(?:bonus|pt|pts)/i,
    /(\d[\d,]+)\s*(?:mile|miles|UR)/i,
    /bonus[:\s]+(\d[\d,]+)/i,
    /(\d{5,6})\s*points?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return null;
}

function extractFee(text) {
  const m = text.match(/\$?(\d+)\s*(?:annual\s+fee|year|fee)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── Card-specific source URLs ──────────────────────────────────

const CARD_SOURCES = {
  'chase-sapphire-reserve': {
    doc: 'https://www.doctorofcredit.com/chase-sapphire-reserve-1-25-pay-yourself-back-categories-gas-gym-annual-fee-q1-2026/',
    usccg: 'https://www.uscreditcardguide.com/chase-sapphire-reserve/',
    chase: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve',
  },
  'chase-sapphire-preferred': {
    doc: 'https://www.doctorofcredit.com/chase-sapphire-preferred-100000-points-offer-annual-fee-waived-in-branch/',
    usccg: 'https://www.uscreditcardguide.com/chase-sapphire-preferred/',
    chase: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred',
  },
  'chase-marriott-boundless': {
    doc: 'https://www.doctorofcredit.com/credit-cards/chase-marriott-boundless/',
    usccg: 'https://www.uscreditcardguide.com/marriott-bonvoy-boundless-credit-card/',
  },
  'amex-platinum-personal': {
    doc: 'https://www.doctorofcredit.com/american-express-platinum-100000-point-link-publicly-available/',
    usccg: 'https://www.uscreditcardguide.com/amex-platinum-card/',
  },
  'amex-hilton-aspire': {
    doc: 'https://www.doctorofcredit.com/credit-cards/hilton-aspire/',
    usccg: 'https://www.uscreditcardguide.com/hilton-aspire-card/',
  },
  'amex-hilton-honors': {
    doc: 'https://www.doctorofcredit.com/credit-cards/hilton-honors/',
    usccg: 'https://www.uscreditcardguide.com/hilton-honors-credit-card/',
  },
  'amex-hilton-surpass': {
    doc: 'https://www.doctorofcredit.com/credit-cards/hilton-surpass/',
    usccg: 'https://www.uscreditcardguide.com/hilton-honors-surpass-credit-card/',
  },
  'discover-customized-cash': {
    doc: 'https://www.doctorofcredit.com/credit-cards/discover-it-cash-back/',
    usccg: null,
  },
  'citi-strata-elite': {
    doc: null,
    usccg: 'https://www.uscreditcardguide.com/citi-strata-elite-credit-card/',
  },
  'bofa-customized-cash': {
    doc: 'https://www.doctorofcredit.com/credit-cards/bank-of-america-customized-cash/',
    usccg: null,
  },
  'bofa-atmos-ascent': {
    doc: 'https://www.doctorofcredit.com/credit-cards/bank-of-america-premium/',
    usccg: null,
  },
  'bofa-atmos-summit': {
    doc: 'https://www.doctorofcredit.com/credit-cards/bank-of-america-premium/',
    usccg: null,
  },
  'bofa-travel-rewards': {
    doc: 'https://www.doctorofcredit.com/credit-cards/bank-of-america-travel-rewards/',
    usccg: null,
  },
  'apple-card': {
    doc: 'https://www.doctorofcredit.com/credit-cards/apple-card/',
    usccg: 'https://www.uscreditcardguide.com/apple-card/',
  },
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Audit one card ─────────────────────────────────────────────

async function auditCard(cardId) {
  const card = JSON.parse(readFileSync(join(CARDS_DIR, `${cardId}.json`), 'utf8'));
  const sources = CARD_SOURCES[cardId] || {};
  const result = {
    card_id: cardId,
    name: card.name,
    issues: [],
    current: {
      annual_fee: card.annual_fee,
      welcome_bonus: card.welcome_offer?.bonus_points,
      spending_req: card.welcome_offer?.spending_requirement,
    },
    live: {},
    checked: [],
  };

  // Check DoC page
  if (sources.doc) {
    try {
      const r = await fetch(sources.doc);
      const body = r.body.slice(0, 10000); // first 10k chars
      const bonuses = extractNumbers(body).filter(n => n >= 10000 && n <= 500000);
      const fees = extractNumbers(body).filter(n => n >= 0 && n <= 1000);
      result.live.doc_bonuses = bonuses.slice(0, 5);
      result.live.doc_fees = fees.slice(0, 3);
      result.checked.push('doc');

      // Compare
      const currentBonus = card.welcome_offer?.bonus_points;
      const liveBonus = bonuses[0]; // most likely first large number
      if (currentBonus && liveBonus && Math.abs(currentBonus - liveBonus) > currentBonus * 0.1) {
        result.issues.push({
          field: 'welcome_offer.bonus_points',
          severity: 'HIGH',
          current: currentBonus,
          live: liveBonus,
          source: 'doctor_of_credit',
          message: `DoC shows ${liveBonus.toLocaleString()} but we have ${currentBonus.toLocaleString()}`,
        });
      }
    } catch (e) {
      result.issues.push({ field: 'source', severity: 'LOW', message: `DoC fetch failed: ${e.message}` });
    }
    await new Promise(r => setTimeout(r, 1500)); // rate limit
  }

  // Check US Credit Card Guide page
  if (sources.usccg) {
    try {
      const r = await fetch(sources.usccg);
      const body = r.body.slice(0, 10000);
      const bonuses = extractNumbers(body).filter(n => n >= 10000 && n <= 500000);
      result.live.usccg_bonuses = bonuses.slice(0, 5);
      result.checked.push('usccg');
    } catch (e) {
      result.issues.push({ field: 'source', severity: 'LOW', message: `US Credit Card Guide fetch failed: ${e.message}` });
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  return result;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const cardIds = readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  const results = [];
  const HIGH = [], MEDIUM = [], LOW = [];

  for (const cardId of cardIds) {
    process.stdout.write(`Checking ${cardId}... `);
    try {
      const r = await auditCard(cardId);
      results.push(r);
      const issueCount = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      r.issues.forEach(i => issueCount[i.severity]++);
      console.log(`✓ (HIGH:${issueCount.HIGH} MED:${issueCount.MEDIUM} LOW:${issueCount.LOW})`);
      if (r.issues.some(i => i.severity === 'HIGH')) HIGH.push(r);
      else if (r.issues.some(i => i.severity === 'MEDIUM')) MEDIUM.push(r);
      else if (r.issues.some(i => i.severity === 'LOW')) LOW.push(r);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  // Save report
  const timestamp = new Date().toISOString().slice(0, 10);
  const report = { timestamp, summary: { high: HIGH.length, medium: MEDIUM.length, low: LOW.length }, results };
  writeFileSync(join(REPORT_DIR, `audit_${timestamp}.json`), JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`🔴 HIGH priority (verify immediately): ${HIGH.length} cards`);
  HIGH.forEach(r => {
    r.issues.filter(i => i.severity === 'HIGH').forEach(i => {
      console.log(`   ${r.name}: ${i.message}`);
    });
  });
  console.log(`🟡 MEDIUM priority: ${MEDIUM.length} cards`);
  console.log(`🟢 LOW / No issues: ${results.length - HIGH.length - MEDIUM.length} cards`);

  console.log('\nFull report:', join(REPORT_DIR, `audit_${timestamp}.json`));
}

main().catch(e => { console.error(e); process.exit(1); });
