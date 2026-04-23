/**
 * OpenCard Data Validation Framework v2
 * 
 * Validates card JSON files against schema and business rules.
 * Handles mixed formats (strings and objects) for backwards compatibility.
 * 
 * Run with: npx tsx scripts/validate-cards.ts
 */

import fs from 'fs';
import path from 'path';

// ============ HELPERS ============

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual', 'per_stay', 'cardmember_year'];
const VALID_CATEGORIES = ['travel', 'dining', 'shopping', 'entertainment', 'streaming', 'fitness', 'gas', 'groceries', 'other'];

// Normalize category (handle "Monthly", "Travel", etc.)
function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const lower = cat.toLowerCase();
  // Map variations
  if (lower === 'monthly' || lower === 'month') return 'monthly';
  if (lower === 'quarterly' || lower === 'quarter') return 'quarterly';
  if (lower === 'semi annual' || lower === 'semi-annual' || lower === 'semiannual' || lower === '6mo' || lower === '6 months') return 'semi_annual';
  if (lower === 'annual' || lower === 'year' || lower === 'yearly') return 'annual';
  if (lower === 'per stay' || lower === 'per_stay') return 'per_stay';
  if (lower === 'cardmember year' || lower === 'cardmember_year') return 'cardmember_year';
  return null;
}

// Normalize hotel status (may be string or object)
interface HotelStatus {
  program: string;
  tier?: string;
}

function parseHotelStatus(item: any): HotelStatus | null {
  if (!item) return null;
  if (typeof item === 'string') {
    // Parse string like "Hilton Honors Gold Status"
    const match = item.match(/([\w\s]+?)\s*(Gold|Silver|Platinum|Diamond|Elite|Bronze)?/i);
    if (match) {
      return { program: match[1].trim(), tier: match[2] || undefined };
    }
    return { program: item };
  }
  if (typeof item === 'object') {
    return { program: item.program || '', tier: item.tier || undefined };
  }
  return null;
}

// ============ VALIDATION TYPES ============

interface ValidationIssue {
  card: string;
  severity: 'error' | 'warning';
  message: string;
  field?: string;
}

// ============ BUSINESS RULES ============

function validateBusinessRules(card: any, fileName: string): ValidationIssue[] {
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
  
  // RULE 1: Duplicate hotel status
  if (hotelStatusStrs.length > 0 && creditHotelStatuses.length > 0) {
    issues.push({
      card: cardName,
      severity: 'error',
      message: `Duplicate hotel status found: in both travel_benefits.hotel_status and recurring_credits`,
      field: 'hotel_status / recurring_credits',
    });
  }
  
  // Parse recurring_credits with normalized categories
  for (const credit of (card.recurring_credits || [])) {
    const name = credit.name || '';
    const amount = credit.amount;
    const frequency = credit.frequency;
    const category = credit.category;
    
    // RULE 2: Invalid frequency
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      const normalized = normalizeCategory(frequency);
      if (!normalized) {
        issues.push({
          card: cardName,
          severity: 'error',
          message: `Invalid frequency "${frequency}" for "${name}"`,
          field: 'recurring_credits.frequency',
        });
      }
    }
    
    // RULE 3: Invalid category
    if (category && !VALID_CATEGORIES.includes(category.toLowerCase())) {
      issues.push({
        card: cardName,
        severity: 'error',
        message: `Invalid category "${category}" for "${name}"`,
        field: 'recurring_credits.category',
      });
    }
    
    // NOTE: Price/value warnings removed - must compare against official sources, not arbitrary thresholds
  }
  
  return issues;
}

// ============ MAIN VALIDATION ============

function validateCards(): { errors: number; warnings: number; issues: ValidationIssue[] } {
  const cardsDir = path.join(process.cwd(), 'data', 'cards');
  const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
  
  const allIssues: ValidationIssue[] = [];
  
  for (const file of files) {
    const filePath = path.join(cardsDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const card = JSON.parse(content);
      const businessIssues = validateBusinessRules(card, file);
      allIssues.push(...businessIssues);
      
    } catch (e: any) {
      allIssues.push({
        card: file,
        severity: 'error',
        message: `Failed to parse JSON: ${e.message}`,
      });
    }
  }
  
  const errors = allIssues.filter(i => i.severity === 'error').length;
  const warnings = allIssues.filter(i => i.severity === 'warning').length;
  
  return { errors, warnings, issues: allIssues };
}

// ============ OUTPUT ============

function main() {
  console.log('🔍 Validating OpenCard data...\n');
  console.log('Valid frequencies:', VALID_FREQUENCIES.join(', '));
  console.log('Valid categories:', VALID_CATEGORIES.join(', '));
  console.log();
  
  const { errors, warnings, issues } = validateCards();
  
  if (issues.length === 0) {
    console.log('✅ All cards passed validation!');
    process.exit(0);
  }
  
  // Group by severity
  const errorIssues = issues.filter(i => i.severity === 'error');
  const warningIssues = issues.filter(i => i.severity === 'warning');
  
  if (errorIssues.length > 0) {
    console.log(`❌ ${errorIssues.length} ERROR(S):\n`);
    // Group by card
    const byCard: Record<string, ValidationIssue[]> = {};
    for (const issue of errorIssues) {
      if (!byCard[issue.card]) byCard[issue.card] = [];
      byCard[issue.card].push(issue);
    }
    for (const [card, cardIssues] of Object.entries(byCard)) {
      console.log(`  📛 ${card}`);
      for (const issue of cardIssues) {
        console.log(`     - ${issue.message}`);
      }
      console.log();
    }
  }
  
  if (warningIssues.length > 0) {
    console.log(`⚠️  ${warningIssues.length} WARNING(S):\n`);
    const byCard: Record<string, ValidationIssue[]> = {};
    for (const issue of warningIssues) {
      if (!byCard[issue.card]) byCard[issue.card] = [];
      byCard[issue.card].push(issue);
    }
    for (const [card, cardIssues] of Object.entries(byCard)) {
      console.log(`  📛 ${card}`);
      for (const issue of cardIssues) {
        console.log(`     - ${issue.message}`);
      }
      console.log();
    }
  }
  
  console.log(`\n📊 Summary: ${errors} errors, ${warnings} warnings`);
  console.log(`\n💡 To fix: Update the card JSON files to resolve the issues above.`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
