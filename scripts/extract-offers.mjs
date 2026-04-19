/**
 * Phase 2: AI-powered offer extraction + diff engine
 * Takes raw page text → structured offer data
 * Compares with current card database → flags changes
 */

import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';

// Load scraper results
const scraperResults = JSON.parse(readFileSync('./data/scraper-results.json', 'utf8'));

// Load card database (indexed by numeric string key)
const cardIndex = JSON.parse(readFileSync('./data/all-cards-index.json', 'utf8'));

// Card ID → current welcome offer map
const currentOffers = {};
for (const key of Object.keys(cardIndex)) {
  const c = cardIndex[key];
  currentOffers[c.card_id] = c.welcome_offer;
}

// Regex patterns to extract offer from raw text
function extractOfferFromText(rawText, cardName, cardId) {
  const text = rawText || '';
  
  // Patterns for bonus points
  const ptsPatterns = [
    /Earn\s+([\d,]+)\s+bonus\s+points/i,
    /([\d,]+)\s+bonus\s+points/i,
    /([\d,]+)\s+points?\s+after/i,
    /Earn\s+([\d,]+)\s+Membership\s+Rewards/i,
    /([\d,]+)\s+bonus\s+miles/i,
    /Earn\s+([\d,]+)\s+miles/i,
  ];

  // Patterns for cash bonus
  const cashPatterns = [
    /\$[\d,]+\s+bonus/,
    /Earn\s+\$?([\d,]+)\s+(?:cash\s+back\s+)?bonus/i,
    /\$([\d,]+)\s+bonus/i,
  ];

  // Spend requirement
  const spendPatterns = [
    /spend\s+\$([\d,]+)/i,
    /spending\s+\$([\d,]+)/i,
    /after\s+\$([\d,]+)/i,
  ];

  // Time period
  const timePatterns = [
    /first\s+(\d+)\s+months?/i,
    /within\s+(\d+)\s+months?/i,
    /(\d+)\s+months?/i,
  ];

  let bonus_points = null;
  let bonus_cash = null;
  let spend = null;
  let months = null;

  // Try points first
  for (const p of ptsPatterns) {
    const m = text.match(p);
    if (m) {
      bonus_points = parseInt(m[1].replace(/,/g, ''), 10);
      break;
    }
  }

  // Try cash if no points
  if (!bonus_points) {
    for (const p of cashPatterns) {
      const m = text.match(p);
      if (m && m[1]) {
        bonus_cash = parseInt(m[1].replace(/,/g, ''), 10);
        break;
      }
    }
  }

  // Spend requirement
  for (const p of spendPatterns) {
    const m = text.match(p);
    if (m) {
      spend = parseInt(m[1].replace(/,/g, ''), 10);
      break;
    }
  }

  // Time period
  for (const p of timePatterns) {
    const m = text.match(p);
    if (m) {
      months = parseInt(m[1], 10);
      break;
    }
  }

  return {
    card_id: cardId,
    name: cardName,
    extracted: {
      bonus_points: bonus_points || bonus_cash,
      spending_requirement: spend,
      time_period_months: months,
    }
  };
}

// Value map for estimating
const VALUE_MAP = {
  'Chase Ultimate Rewards': 1.2,
  'Citi ThankYou': 1.0,
  'American Express Membership Rewards': 1.2,
  'Capital One Miles': 1.2,
  'Wells Fargo Rewards': 0.8,
  'Discover Cashback': 1.0,
  'default': 1.0,
};

function estimateValue(pts, program) {
  const cpp = VALUE_MAP[program] || VALUE_MAP.default;
  return Math.round(pts * cpp);
}

// Diff current vs extracted
function diffOffers(cardId, extracted, current) {
  if (!current) return { changed: false };
  
  const curr = current;
  const ext = extracted;
  
  const currPts = curr.bonus_points || 0;
  const extPts = ext.bonus_points || 0;
  
  if (currPts === 0 && extPts === 0) return { changed: false };
  
  const delta = Math.abs(extPts - currPts);
  const pct = currPts > 0 ? delta / currPts : (extPts > 0 ? 1 : 0);
  
  return {
    changed: pct > 0.10, // >10% change
    current: currPts,
    extracted: extPts,
    delta,
    pct: Math.round(pct * 100),
    spend_changed: curr.spending_requirement !== ext.spending_requirement,
    months_changed: curr.time_period_months !== ext.time_period_months,
  };
}

// Main
console.log('🔍 Phase 2: AI Extraction + Diff Engine\n');

const results = [];

for (const r of scraperResults) {
  if (!r.success) {
    results.push({ card_id: r.card_id, name: r.name, status: 'skipped', reason: 'scrape_failed' });
    continue;
  }

  const extracted = extractOfferFromText(r.raw_text, r.name, r.card_id);
  const current = currentOffers[r.card_id];
  const diff = current ? diffOffers(r.card_id, extracted.extracted, current) : { changed: false };

  results.push({
    card_id: r.card_id,
    name: r.name,
    status: diff.changed ? 'changed' : 'unchanged',
    current: current?.bonus_points,
    extracted: extracted.extracted.bonus_points,
    delta: diff.delta || 0,
    pct: diff.pct || 0,
    spend: extracted.extracted.spending_requirement,
    months: extracted.extracted.time_period_months,
    diff,
  });
}

// Report
console.log('\n📊 Results:');
const changed = results.filter(r => r.status === 'changed');
const unchanged = results.filter(r => r.status === 'unchanged');
const skipped = results.filter(r => r.status === 'skipped');

console.log(`\n✅ Unchanged (${unchanged.length}):`);
unchanged.forEach(r => console.log(`  ${r.name}: ${r.current?.toLocaleString()} pts`));

console.log(`\n🔄 Changed (${changed.length}):`);
changed.forEach(r => {
  console.log(`  ⚠️  ${r.name}:`);
  console.log(`     Current: ${r.current?.toLocaleString()} pts → Extracted: ${r.extracted?.toLocaleString()} pts (${r.pct}% change)`);
});

console.log(`\n⏭️  Skipped (${skipped.length}):`);
skipped.forEach(r => console.log(`  ${r.name}: ${r.reason}`));

// Save results
writeFileSync('./data/extract-results.json', JSON.stringify(results, null, 2));

console.log('\n💾 Results saved to data/extract-results.json');
console.log('\n📋 Summary for Discord:');
if (changed.length > 0) {
  changed.forEach(r => {
    console.log(`⚠️ ${r.name}: ${r.current?.toLocaleString()} → ${r.extracted?.toLocaleString()} pts`);
  });
} else {
  console.log('✅ No significant changes detected');
}
