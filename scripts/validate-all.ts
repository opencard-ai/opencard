/**
 * OpenCard Unified Data Validation Framework
 * 
 * Combines business logic + schema quality checks.
 * Runs via cron job or pre-commit hook.
 * 
 * Usage: npx tsx scripts/validate-all.ts
 */

import fs from 'fs';
import path from 'path';

// ============ CONSTANTS ============

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual', 'per_stay', 'cardmember_year'];
const VALID_CATEGORIES = ['travel', 'dining', 'shopping', 'entertainment', 'streaming', 'fitness', 'gas', 'groceries', 'other'];
const VALID_NETWORKS = ['visa', 'amex', 'mastercard', 'discover', 'other'];
const VALID_INSURANCE_KEYS = ['trip_cancellation', 'trip_delay', 'rental_insurance', 'purchase_protection', 'return_protection', 'extended_warranty'];

// ============ TYPES ============

interface ValidationIssue {
  card: string;
  severity: 'error' | 'warning';
  source: 'schema' | 'business';
  message: string;
  field?: string;
}

interface HotelStatus {
  program: string;
  tier?: string;
}

// ============ HELPERS ============

function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const lower = cat.toLowerCase();
  if (lower === 'monthly' || lower === 'month') return 'monthly';
  if (lower === 'quarterly' || lower === 'quarter') return 'quarterly';
  if (lower === 'semi annual' || lower === 'semi-annual' || lower === 'semiannual' || lower === '6mo' || lower === '6 months') return 'semi_annual';
  if (lower === 'annual' || lower === 'year' || lower === 'yearly') return 'annual';
  if (lower === 'per stay' || lower === 'per_stay') return 'per_stay';
  if (lower === 'cardmember year' || lower === 'cardmember_year') return 'cardmember_year';
  return null;
}

function parseHotelStatus(item: any): HotelStatus | null {
  if (!item) return null;
  if (typeof item === 'string') {
    const match = item.match(/([\w\s]+?)\s*(Gold|Silver|Platinum|Diamond|Elite|Bronze)?/i);
    if (match) return { program: match[1].trim(), tier: match[2] || undefined };
    return { program: item };
  }
  if (typeof item === 'object') {
    return { program: item.program || '', tier: item.tier || undefined };
  }
  return null;
}

// ============ SCHEMA VALIDATION ============

function validateSchema(card: any, fileName: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cardName = card.name || card.card_id || fileName;

  // Required fields
  if (!card.card_id) {
    issues.push({ card: cardName, severity: 'error', source: 'schema', message: 'Missing card_id', field: 'card_id' });
  }
  if (!card.name) {
    issues.push({ card: cardName, severity: 'error', source: 'schema', message: 'Missing name', field: 'name' });
  }

  // foreign_transaction_fee should be number
  if (card.foreign_transaction_fee !== undefined && typeof card.foreign_transaction_fee !== 'number') {
    issues.push({
      card: cardName, severity: 'error', source: 'schema',
      message: `foreign_transaction_fee should be number, got: ${typeof card.foreign_transaction_fee}`,
      field: 'foreign_transaction_fee'
    });
  }

  // network should be standard values
  if (card.network && !VALID_NETWORKS.includes(card.network)) {
    issues.push({
      card: cardName, severity: 'error', source: 'schema',
      message: `invalid network: "${card.network}"`,
      field: 'network'
    });
  }

  // insurance validation
  if (card.insurance && typeof card.insurance === 'object') {
    const missingKeys = VALID_INSURANCE_KEYS.filter(k => !(k in card.insurance));
    if (missingKeys.length > 0) {
      issues.push({
        card: cardName, severity: 'error', source: 'schema',
        message: `insurance missing keys: ${missingKeys.join(', ')}`,
        field: 'insurance'
      });
    }
  }

  // recurring_credits validation
  if (card.recurring_credits && Array.isArray(card.recurring_credits)) {
    card.recurring_credits.forEach((rc: any, i: number) => {
      if (!rc.name) {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: `recurring_credits[${i}] missing name`,
          field: `recurring_credits[${i}].name`
        });
      }
      
      if (rc.frequency && !VALID_FREQUENCIES.includes(rc.frequency)) {
        const normalized = normalizeCategory(rc.frequency);
        if (!normalized) {
          issues.push({
            card: cardName, severity: 'error', source: 'schema',
            message: `invalid frequency: "${rc.frequency}"`,
            field: `recurring_credits[${i}].frequency`
          });
        }
      }
      
      if (rc.category && !VALID_CATEGORIES.includes(rc.category.toLowerCase())) {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: `invalid category: "${rc.category}"`,
          field: `recurring_credits[${i}].category`
        });
      }
      
      if (rc.amount !== undefined && rc.amount !== null && typeof rc.amount !== 'number') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: `amount should be number or null`,
          field: `recurring_credits[${i}].amount`
        });
      }
    });
  }

  // annual_fee high but no recurring_credits (and no other benefits)
  // Only warn if there are NO meaningful benefits
  const hasCredits = card.recurring_credits?.some((c: any) => c.amount > 0 || c.name);
  const hasHotelStatus = card.travel_benefits?.hotel_status?.length > 0;
  const hasOtherBenefits = card.travel_benefits?.other_benefits?.length > 0;
  const hasLoungeAccess = card.travel_benefits?.lounge_access?.priority_pass ||
    card.travel_benefits?.lounge_access?.centurion ||
    card.travel_benefits?.lounge_access?.other;
  if (card.annual_fee > 200 && !hasCredits && !hasHotelStatus && !hasOtherBenefits && !hasLoungeAccess) {
    issues.push({
      card: cardName, severity: 'warning', source: 'schema',
      message: `annual_fee is $${card.annual_fee} but no benefits found`,
      field: 'benefits'
    });
  }

  return issues;
}

// ============ BUSINESS LOGIC VALIDATION ============

function validateBusiness(card: any, fileName: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cardName = card.name || card.card_id || fileName;

  // Parse hotel_status (may be strings or objects)
  const hotelStatuses: HotelStatus[] = [];
  const rawHotelStatus = card.travel_benefits?.hotel_status || [];
  for (const item of rawHotelStatus) {
    const parsed = parseHotelStatus(item);
    if (parsed) hotelStatuses.push(parsed);
  }
  const hotelStatusStrs = hotelStatuses.map(h => `${h.program} ${h.tier || ''}`.trim().toLowerCase());

  // Check recurring_credits for hotel status duplicates
  const creditHotelStatuses: string[] = [];
  for (const credit of (card.recurring_credits || [])) {
    const name = credit.name?.toLowerCase() || '';
    const hasHotelProgram = /hilton|marriott|hyatt|ihg|intercontinental/i.test(name);
    const hasStatus = /status|elite|tier/i.test(name);
    const isCredit = /credit|night/i.test(name);
    if (hasHotelProgram && hasStatus && !isCredit) {
      creditHotelStatuses.push(name);
    }
  }

  // RULE 1: Duplicate hotel status (error)
  if (hotelStatusStrs.length > 0 && creditHotelStatuses.length > 0) {
    issues.push({
      card: cardName, severity: 'error', source: 'business',
      message: 'Duplicate hotel status: in both travel_benefits.hotel_status and recurring_credits',
      field: 'hotel_status / recurring_credits'
    });
  }

  // RULE 2: Null-amount credits (warning)
  for (const credit of (card.recurring_credits || [])) {
    const name = credit.name || '';
    const amount = credit.amount;

    if (amount === null || amount === undefined) {
      const isFreeNight = /free.?night/i.test(name);
      const isCashback = /daily.?cash|cash.?back|%.*match/i.test(name);
      const isFee = /foreign.?trans|fee/i.test(name);
      const isFeature = /apple.?card.?family|family.?share/i.test(name);

      if (!isFreeNight && !isCashback && !isFee && !isFeature) {
        issues.push({
          card: cardName, severity: 'warning', source: 'business',
          message: `"${name}" has no dollar amount. Non-cash benefits (status, access) should be in travel_benefits.other_benefits`,
          field: 'recurring_credits'
        });
      }
    }
  }

  return issues;
}

// ============ MAIN ============

function main() {
  console.log('🔍 OpenCard Unified Validation\n');
  console.log('Valid frequencies:', VALID_FREQUENCIES.join(', '));
  console.log('Valid categories:', VALID_CATEGORIES.join(', '));
  console.log();

  const cardsDir = path.join(process.cwd(), 'data', 'cards');
  const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
  
  const allIssues: ValidationIssue[] = [];
  let parseErrors = 0;

  for (const file of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
      const schemaIssues = validateSchema(card, file);
      const businessIssues = validateBusiness(card, file);
      allIssues.push(...schemaIssues, ...businessIssues);
    } catch (e: any) {
      parseErrors++;
      allIssues.push({
        card: file, severity: 'error', source: 'schema',
        message: `JSON parse error: ${e.message}`
      });
    }
  }

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All cards passed validation!');
    process.exit(0);
  }

  // Group by card
  const byCard: Record<string, ValidationIssue[]> = {};
  for (const issue of allIssues) {
    if (!byCard[issue.card]) byCard[issue.card] = [];
    byCard[issue.card].push(issue);
  }

  if (errors.length > 0) {
    console.log(`❌ ${errors.length} ERROR(S):\n`);
    for (const [card, cardIssues] of Object.entries(byCard)) {
      const cardErrors = cardIssues.filter(i => i.severity === 'error');
      if (cardErrors.length > 0) {
        console.log(`  📛 ${card}`);
        for (const issue of cardErrors) {
          console.log(`     [${issue.source}] ${issue.message}`);
        }
        console.log();
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} WARNING(S):\n`);
    for (const [card, cardIssues] of Object.entries(byCard)) {
      const cardWarnings = cardIssues.filter(i => i.severity === 'warning');
      if (cardWarnings.length > 0) {
        console.log(`  📛 ${card}`);
        for (const issue of cardWarnings) {
          console.log(`     [${issue.source}] ${issue.message}`);
        }
        console.log();
      }
    }
  }

  console.log(`\n📊 Summary: ${errors.length} errors, ${warnings.length} warnings (${files.length} cards checked)`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
