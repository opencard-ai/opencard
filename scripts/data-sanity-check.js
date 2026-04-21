/**
 * Data Sanity Check - Validates card JSON data quality
 * Runs daily via cron job.
 * 
 * Usage: node scripts/data-sanity-check.js
 */

const fs = require('fs');
const path = require('path');

const VALID_FREQUENCIES = new Set(['monthly', 'quarterly', 'semi_annual', 'annual', 'per_stay', 'cardmember_year']);
const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');

const VALID_CATEGORIES = new Set(['travel', 'dining', 'entertainment', 'shopping', 'gas', 'grocery', 'streaming', 'other']);

function checkCard(card, filename) {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!card.card_id) errors.push('Missing card_id');
  if (!card.name) errors.push('Missing name');
  if (!card.issuer) warnings.push('Missing issuer');
  
  // frequency format check (in recurring_credits)
  if (card.recurring_credits && Array.isArray(card.recurring_credits)) {
    card.recurring_credits.forEach((rc, i) => {
      if (rc.frequency && !VALID_FREQUENCIES.has(rc.frequency)) {
        errors.push(`recurring_credits[${i}] has invalid frequency: "${rc.frequency}" (expected: ${[...VALID_FREQUENCIES].join(', ')})`);
      }
      if (rc.amount != null && typeof rc.amount !== 'number') {
        errors.push(`recurring_credits[${i}] amount should be number, got: ${typeof rc.amount}`);
      }
      if (!rc.name) errors.push(`recurring_credits[${i}] missing name`);
      if (!rc.category) warnings.push(`recurring_credits[${i}] missing category`);
    });
  }
  
  // annual_credits frequency check
  if (card.annual_credits && Array.isArray(card.annual_credits)) {
    card.annual_credits.forEach((ac, i) => {
      if (!ac.name) errors.push(`annual_credits[${i}] missing name`);
      if (ac.amount !== undefined && typeof ac.amount !== 'number' && ac.amount !== null) {
        errors.push(`annual_credits[${i}] amount should be number or null`);
      }
    });
  }
  
  // welcome_offer check
  if (card.welcome_offer) {
    if (card.welcome_offer.bonus_points === 0 && card.welcome_offer.bonus_value === 0) {
      warnings.push('welcome_offer exists but both bonus_points and bonus_value are 0');
    }
  }
  
  return { errors, warnings };
}

function main() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  let totalErrors = 0;
  let totalWarnings = 0;
  const report = [];
  
  for (const file of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      const { errors, warnings } = checkCard(card, file);
      
      if (errors.length > 0) {
        report.push(`\n❌ ${file} (${card.name || 'NO NAME'}):`);
        errors.forEach(e => report.push(`   ${e}`));
        totalErrors += errors.length;
      }
      if (warnings.length > 0) {
        report.push(`\n⚠️ ${file} (${card.name || 'NO NAME'}):`);
        warnings.forEach(w => report.push(`   ${w}`));
        totalWarnings += warnings.length;
      }
    } catch (e) {
      report.push(`\n❌ ${file}: PARSE ERROR - ${e.message}`);
      totalErrors++;
    }
  }
  
  const summary = `\n📊 Data Sanity Check Summary — ${files.length} cards checked\n` +
    `   Errors: ${totalErrors}\n   Warnings: ${totalWarnings}\n` +
    `   Clean: ${files.length - totalErrors - totalWarnings}\n`;
  
  console.log(summary);
  if (report.length > 0) {
    console.log(report.join('\n'));
  }
  
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
