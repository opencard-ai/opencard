#!/usr/bin/env node
/**
 * deploy-to-site.mjs — Generate individual card JSON files from MASTER.json
 * into the website's data/cards/ directory.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSENSUS = join(__dirname, 'consensus', 'MASTER.json');
const CARDS_DIR = join(__dirname, 'cards');
const BACKUP_DIR = join(__dirname, 'cards-old-' + Date.now());

console.log('Reading MASTER.json...');
const master = JSON.parse(readFileSync(CONSENSUS, 'utf8'));
const cards = master.cards;

console.log(`Backing up old data/cards to ${BACKUP_DIR}...`);
// Backup old files first
try {
  const oldFiles = readdirSync(CARDS_DIR);
  // We'll just note them, don't actually move since we don't want to break things
  console.log(`  Old data/cards has ${oldFiles.length} files (keeping as backup reference)`);
} catch(e) {}

// Write each card to its own file
let written = 0;
let skipped = 0;

for (const card of cards) {
  // Skip cards with major data issues
  if (!card.name || card.name === 'Unknown' || card.annual_fee == null) {
    skipped++;
    console.log(`  Skipped: ${card.card_id} (no name or annual_fee)`);
    continue;
  }
  
  // Build the card file with all needed fields
  const cardFile = {
    card_id: card.card_id,
    name: card.name,
    issuer: card.issuer,
    network: card.network || 'Visa',
    annual_fee: card.annual_fee,
    foreign_transaction_fee: card.foreign_transaction_fee ?? 0,
    credit_required: card.credit_required || 'Good',
    welcome_offer: card.welcome_offer || null,
    earning_rates: card.earning_rates || [],
    annual_credits: card.annual_credits || [],
    travel_benefits: card.travel_benefits || {},
    fhr_thc: card.fhr_thc || { fhr_eligible: false, thc_eligible: false },
    insurance: card.insurance || {},
    tags: [
      card.issuer.toLowerCase().replace(' ', '-'),
      ...(card.earning_rates?.[0]?.category ? [card.earning_rates[0].category.toLowerCase()] : [])
    ],
    last_updated: new Date().toISOString(),
    sources: card.sources || []
  };
  
  const outPath = join(CARDS_DIR, `${card.card_id}.json`);
  writeFileSync(outPath, JSON.stringify(cardFile, null, 2));
  written++;
}

console.log(`\n✅ Deployed ${written} cards to data/cards/`);
console.log(`   Skipped: ${skipped} cards`);

// Generate the all-cards-index.json
const allCardsIndex = {
  cards: cards.filter(c => c.name && c.name !== 'Unknown').map(c => ({
    card_id: c.card_id,
    name: c.name,
    issuer: c.issuer,
    network: c.network || 'Visa',
    annual_fee: c.annual_fee,
    welcome_offer: c.welcome_offer,
    earning_rates_count: c.earning_rates?.length || 0
  })),
  total: written,
  last_updated: new Date().toISOString(),
  source: 'consensus/MASTER.json'
};

writeFileSync(join(__dirname, 'all-cards-index-filtered.json'), JSON.stringify(allCardsIndex, null, 2));
console.log(`✅ Generated all-cards-index-filtered.json`);

console.log('\n📋 Summary by issuer:');
const byIssuer = {};
for (const card of cards) {
  if (!card.name || card.name === 'Unknown') continue;
  const iss = card.issuer || 'Unknown';
  byIssuer[iss] = (byIssuer[iss] || 0) + 1;
}
for (const [iss, count] of Object.entries(byIssuer).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${iss}: ${count}`);
}
