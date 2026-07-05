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

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual', 'per_stay', 'cardmember_year', 'every_4_years'];
const VALID_CATEGORIES = ['travel', 'dining', 'shopping', 'entertainment', 'streaming', 'fitness', 'gas', 'groceries', 'other', 'ride', 'airline', 'hotel', 'lounge', 'digital', 'credit_monitoring'];
const VALID_NETWORKS = ['visa', 'amex', 'mastercard', 'discover', 'other'];
const VALID_INSURANCE_KEYS = ['trip_cancellation', 'trip_delay', 'rental_insurance', 'purchase_protection', 'return_protection', 'extended_warranty'];
const VALID_SELECTABLE_FREQUENCIES = ['monthly', 'quarterly', 'annual'];

// ============ TYPES ============

interface ValidationIssue {
  card: string;
  severity: 'error' | 'warning';
  source: 'schema' | 'business' | 'sanity';
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

function dateOnlyUtc(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function todayUtcDay(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function expiredDateFields(offer: any, today = todayUtcDay()): string[] {
  if (!offer || typeof offer !== 'object') return [];
  return ['expires', 'elevated_until'].filter((field) => {
    const value = offer[field];
    if (typeof value !== 'string') return false;
    const expiry = dateOnlyUtc(value);
    return expiry !== null && expiry < today;
  });
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

  // selectable_rewards validation
  if (card.selectable_rewards !== undefined) {
    if (!card.selectable_rewards || typeof card.selectable_rewards !== 'object' || Array.isArray(card.selectable_rewards)) {
      issues.push({
        card: cardName, severity: 'error', source: 'schema',
        message: 'selectable_rewards should be an object',
        field: 'selectable_rewards'
      });
    } else {
      if (typeof card.selectable_rewards.activation_required !== 'boolean') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'selectable_rewards.activation_required should be boolean',
          field: 'selectable_rewards.activation_required'
        });
      }
      const freq = card.selectable_rewards.selection_frequency;
      if (freq !== undefined && typeof freq !== 'string') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'selectable_rewards.selection_frequency should be string',
          field: 'selectable_rewards.selection_frequency'
        });
      } else if (freq && !VALID_SELECTABLE_FREQUENCIES.includes(freq)) {
        issues.push({
          card: cardName, severity: 'warning', source: 'schema',
          message: `unusual selectable_rewards.selection_frequency: "${freq}"`,
          field: 'selectable_rewards.selection_frequency'
        });
      }
      for (const key of ['five_percent_categories', 'two_percent_categories']) {
        const value = card.selectable_rewards[key];
        if (value !== undefined && (!Array.isArray(value) || value.some((item: any) => typeof item !== 'string'))) {
          issues.push({
            card: cardName, severity: 'error', source: 'schema',
            message: `selectable_rewards.${key} should be an array of strings`,
            field: `selectable_rewards.${key}`
          });
        }
      }
    }
  }

  // relationship_bonus validation
  if (card.relationship_bonus !== undefined) {
    if (!card.relationship_bonus || typeof card.relationship_bonus !== 'object' || Array.isArray(card.relationship_bonus)) {
      issues.push({
        card: cardName, severity: 'error', source: 'schema',
        message: 'relationship_bonus should be an object',
        field: 'relationship_bonus'
      });
    } else {
      if (!card.relationship_bonus.issuer || typeof card.relationship_bonus.issuer !== 'string') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'relationship_bonus.issuer is required and should be string',
          field: 'relationship_bonus.issuer'
        });
      }
      if (!card.relationship_bonus.program || typeof card.relationship_bonus.program !== 'string') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'relationship_bonus.program is required and should be string',
          field: 'relationship_bonus.program'
        });
      }
      const tiers = card.relationship_bonus.tiers;
      if (!Array.isArray(tiers) || tiers.length === 0) {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'relationship_bonus.tiers should be a non-empty array',
          field: 'relationship_bonus.tiers'
        });
      } else {
        tiers.forEach((tier: any, i: number) => {
          if (typeof tier.qualifying_balance_min !== 'number') {
            issues.push({
              card: cardName, severity: 'error', source: 'schema',
              message: `relationship_bonus.tiers[${i}].qualifying_balance_min should be number`,
              field: `relationship_bonus.tiers[${i}].qualifying_balance_min`
            });
          }
          if (tier.qualifying_balance_max !== undefined && tier.qualifying_balance_max !== null && typeof tier.qualifying_balance_max !== 'number') {
            issues.push({
              card: cardName, severity: 'error', source: 'schema',
              message: `relationship_bonus.tiers[${i}].qualifying_balance_max should be number or null`,
              field: `relationship_bonus.tiers[${i}].qualifying_balance_max`
            });
          }
          if (tier.total_cash_back_rate !== undefined && typeof tier.total_cash_back_rate !== 'number') {
            issues.push({
              card: cardName, severity: 'error', source: 'schema',
              message: `relationship_bonus.tiers[${i}].total_cash_back_rate should be number`,
              field: `relationship_bonus.tiers[${i}].total_cash_back_rate`
            });
          }
        });
      }
    }
  }

  // rotating_categories validation
  if (card.rotating_categories !== undefined) {
    if (!card.rotating_categories || typeof card.rotating_categories !== 'object' || Array.isArray(card.rotating_categories)) {
      issues.push({
        card: cardName, severity: 'error', source: 'schema',
        message: 'rotating_categories should be an object',
        field: 'rotating_categories'
      });
    } else {
      if (typeof card.rotating_categories.activation_required !== 'boolean') {
        issues.push({
          card: cardName, severity: 'error', source: 'schema',
          message: 'rotating_categories.activation_required should be boolean',
          field: 'rotating_categories.activation_required'
        });
      }
      const quarters = card.rotating_categories.quarters_2026;
      if (quarters !== undefined) {
        if (!Array.isArray(quarters)) {
          issues.push({
            card: cardName, severity: 'error', source: 'schema',
            message: 'rotating_categories.quarters_2026 should be an array',
            field: 'rotating_categories.quarters_2026'
          });
        } else {
          quarters.forEach((quarter: any, i: number) => {
            if (!quarter.quarter || typeof quarter.quarter !== 'string') {
              issues.push({
                card: cardName, severity: 'error', source: 'schema',
                message: `rotating_categories.quarters_2026[${i}].quarter should be string`,
                field: `rotating_categories.quarters_2026[${i}].quarter`
              });
            }
            if (!Array.isArray(quarter.categories) || quarter.categories.length === 0 || quarter.categories.some((item: any) => typeof item !== 'string')) {
              issues.push({
                card: cardName, severity: 'error', source: 'schema',
                message: `rotating_categories.quarters_2026[${i}].categories should be a non-empty array of strings`,
                field: `rotating_categories.quarters_2026[${i}].categories`
              });
            }
          });
        }
      }
    }
  }

  // annual_fee high but no recurring_credits (and no other benefits)
  // Only warn if there are NO meaningful benefits
  const hasCredits = card.recurring_credits?.some((c: any) => c.amount > 0 || c.name);
  const hasHotelStatus = card.travel_benefits?.hotel_status?.length > 0;
  const hasOtherBenefits = card.travel_benefits?.other_benefits?.length > 0;
  const hasLoungeAccess = card.travel_benefits?.lounge_access?.priority_pass ||
    card.travel_benefits?.lounge_access?.centurion ||
    card.travel_benefits?.lounge_access?.other;
  const hasWelcomeBonus = card.welcome_bonus && (card.welcome_bonus.amount > 0 || card.welcome_bonus.credits);
  if (card.annual_fee > 200 && !hasCredits && !hasHotelStatus && !hasOtherBenefits && !hasLoungeAccess && !hasWelcomeBonus) {
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

// ============ SANITY VALIDATION ============
//
// Catches the kind of bugs that schema/business validation can't see.
// Specifically motivated by 2026-04-25 CFPB pipeline regex bug that wrote
// `annual_fee: 12` to Amex Platinum (real value $895). Schema check passed
// (12 is a number), business check passed (12 > 0). Only sanity check
// catches "12 is wildly implausible for a card named 'Platinum'".

// Cards explicitly known to have small/no annual fee that DO contain a "premium"
// keyword. Allowlist exempts them from the premium-fee sanity rule.
const PREMIUM_KEYWORD_NO_FEE_ALLOWLIST = new Set<string>([
  // Add card_ids here when a sanity rule false-positives on a real card.
]);

const PREMIUM_NAME_PATTERN = /\b(platinum|reserve|aspire|brilliant|prestige|infinite|centurion|magnate|sapphire reserve|venture x)\b/i;

function validateSanity(card: any, fileName: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cardName = card.name || card.card_id || fileName;

  // Rule 1: annual_fee in plausible range [0, 10000]
  if (typeof card.annual_fee === 'number') {
    if (card.annual_fee < 0 || card.annual_fee > 10000) {
      issues.push({
        card: cardName, severity: 'error', source: 'sanity',
        message: `annual_fee=${card.annual_fee} is outside plausible range [0, 10000]`,
        field: 'annual_fee'
      });
    }
  }

  // Rule 2: Premium-named card with implausibly low annual_fee.
  // This is the rule that catches the CFPB regex bug — "Amex Platinum
  // annual_fee: 12" trips this even though 12 is a valid number.
  if (
    typeof card.annual_fee === 'number'
    && card.annual_fee > 0
    && card.annual_fee < 50
    && PREMIUM_NAME_PATTERN.test(cardName)
    && !PREMIUM_KEYWORD_NO_FEE_ALLOWLIST.has(card.card_id)
  ) {
    issues.push({
      card: cardName, severity: 'error', source: 'sanity',
      message: `Premium-named card has implausibly low annual_fee=$${card.annual_fee}. Likely regex/parsing bug. If this is correct, add card_id to PREMIUM_KEYWORD_NO_FEE_ALLOWLIST in validate-all.ts.`,
      field: 'annual_fee'
    });
  }

  // Rule 3: foreign_transaction_fee plausible range [0, 5]%
  if (typeof card.foreign_transaction_fee === 'number') {
    if (card.foreign_transaction_fee < 0 || card.foreign_transaction_fee > 5) {
      issues.push({
        card: cardName, severity: 'error', source: 'sanity',
        message: `foreign_transaction_fee=${card.foreign_transaction_fee}% is outside plausible range [0%, 5%]`,
        field: 'foreign_transaction_fee'
      });
    }
  }

  // Rule 4: Surface _quarantine flag as warning so it's visible in CI output.
  if (card._quarantine) {
    const reasons = Array.isArray(card._quarantine_reasons) ? card._quarantine_reasons : [];
    issues.push({
      card: cardName, severity: 'warning', source: 'sanity',
      message: `Card is _quarantine=true. ${reasons.length > 0 ? 'Reasons: ' + reasons.join('; ') : '(no reasons given)'}`,
      field: '_quarantine'
    });
  }

  // Rule 5: Surface _unverified_fields list as warning.
  if (Array.isArray(card._unverified_fields) && card._unverified_fields.length > 0) {
    issues.push({
      card: cardName, severity: 'warning', source: 'sanity',
      message: `Has _unverified_fields needing re-verification: ${card._unverified_fields.join(', ')}`,
      field: '_unverified_fields'
    });
  }

  // Rule 6: filename should match card_id (e.g. amex-centurion.json has card_id "centurion-card-amex" — surface this).
  // Warning level only; we have legacy mismatches that need migration, not failure.
  const expectedFilename = card.card_id + '.json';
  if (card.card_id && fileName !== expectedFilename) {
    issues.push({
      card: cardName, severity: 'warning', source: 'sanity',
      message: `filename "${fileName}" doesn't match card_id "${card.card_id}". Should be "${expectedFilename}".`,
      field: 'card_id'
    });
  }

  // Rule 7: cfpb_verified flag should not coexist with _revert_history (means
  // pipeline wrote a value, then we had to revert it — pipeline shouldn't be
  // re-marking it verified).
  if (card.cfpb_verified && Array.isArray(card._revert_history) && card._revert_history.length > 0) {
    issues.push({
      card: cardName, severity: 'error', source: 'sanity',
      message: `cfpb_verified=true coexists with _revert_history. The CFPB pipeline previously wrote bad data; remove cfpb_verified until pipeline is rewritten.`,
      field: 'cfpb_verified'
    });
  }

  return issues;
}

function validateCardAdaptorConfigs(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const configsDir = path.join(process.cwd(), 'scripts', 'card-adaptor', 'cards');
  if (!fs.existsSync(configsDir)) return issues;

  const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(configsDir, file), 'utf8'));
      const offer = config?.candidate?.welcome_offer;
      const expiredFields = expiredDateFields(offer);
      if (!expiredFields.length) continue;

      const status = typeof offer.offer_status === 'string' ? offer.offer_status : '';
      const looksCurrent = /public|current|limited|elevated/i.test(status) || offer.is_elevated === true;
      if (looksCurrent) {
        issues.push({
          card: config.cardId || file,
          severity: 'error',
          source: 'sanity',
          message: `card-adaptor welcome_offer has expired ${expiredFields.join(', ')} but is still marked current/elevated (offer_status=${JSON.stringify(offer.offer_status)}, is_elevated=${JSON.stringify(offer.is_elevated)})`,
          field: 'scripts/card-adaptor candidate.welcome_offer'
        });
      }
    } catch (e: any) {
      issues.push({
        card: file,
        severity: 'error',
        source: 'schema',
        message: `card-adaptor JSON parse error: ${e.message}`,
        field: 'scripts/card-adaptor'
      });
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

  for (const file of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
      const schemaIssues = validateSchema(card, file);
      const businessIssues = validateBusiness(card, file);
      const sanityIssues = validateSanity(card, file);
      allIssues.push(...schemaIssues, ...businessIssues, ...sanityIssues);
    } catch (e: any) {
      allIssues.push({
        card: file, severity: 'error', source: 'schema',
        message: `JSON parse error: ${e.message}`
      });
    }
  }

  allIssues.push(...validateCardAdaptorConfigs());

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
