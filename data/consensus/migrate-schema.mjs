#!/usr/bin/env node
/**
 * migrate-schema.mjs — Migrate old format research files to new schema
 * 
 * Old format: { card_name, welcome_bonus, credits_and_benefits, key_protections }
 * New format: { name, welcome_offer, annual_credits, insurance }
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const RESEARCH = join(ROOT, 'opencard', 'data', 'research');

const issuers = ['chase', 'amex', 'capital-one', 'citi', 'discover', 'boa', 'usbank', 'wellsfargo', 'bilt'];

function migrate(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  
  // Already has correct schema
  if (raw.name && raw.welcome_offer) return null;
  
  const migrated = { ...raw };
  
  // card_name → name
  if (!migrated.name && raw.card_name) {
    migrated.name = raw.card_name;
  }
  
  // welcome_bonus → welcome_offer
  if (!migrated.welcome_offer && raw.welcome_bonus) {
    migrated.welcome_offer = {
      spending_requirement: parseInt(raw.welcome_bonus.requirement?.match(/(\d+)/)?.[1] || 0),
      time_period_months: raw.welcome_bonus.requirement?.includes('120 days') ? 4 : 3,
      bonus_points: parseInt(String(raw.welcome_bonus.amount).replace(/[^\d]/g, '')) || null,
      description: raw.welcome_bonus.amount || '',
      point_program: migrated.issuer || ''
    };
  }
  
  // credits_and_benefits → annual_credits
  if (!migrated.annual_credits && raw.credits_and_benefits) {
    migrated.annual_credits = raw.credits_and_benefits.map(b => ({
      name: b.name,
      amount: parseInt(b.value?.replace(/[^\d]/g, '') || (b.value?.includes('High') ? null : 0)),
      frequency: 'annual',
      description: b.description
    }));
  }
  
  // key_protections → insurance
  if (!migrated.insurance && raw.key_protections) {
    migrated.insurance = {
      rental_insurance: raw.key_protections.includes('Auto Rental Collision Damage Waiver') ? 'Primary' : 'None',
      trip_delay: raw.key_protections.includes('Trip Cancellation') || raw.key_protections.includes('Trip Interruption'),
      purchase_protection: raw.key_protections.includes('Purchase Protection'),
      extended_warranty: raw.key_protections.includes('Extended Warranty')
    };
  }
  
  // fhr_thc_eligibility → fhr_thc
  if (!migrated.fhr_thc && raw.fhr_thc_eligibility !== undefined) {
    migrated.fhr_thc = {
      fhr_eligible: false,
      thc_eligible: raw.fhr_thc_eligibility
    };
  }
  
  // network
  migrated.network = migrated.network || (
    migrated.issuer === 'American Express' ? 'Amex' :
    migrated.issuer === 'Discover' ? 'Discover' : 'Visa'
  );
  
  // confidence
  migrated.confidence = migrated.confidence || 'medium';
  
  return migrated.name !== raw.name || migrated.welcome_offer ? migrated : null;
}

let total = 0, migrated = 0;

for (const issuer of issuers) {
  const dir = join(RESEARCH, issuer);
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('SUMMARY'));
    for (const file of files) {
      const path = join(dir, file);
      const result = migrate(path);
      if (result) {
        writeFileSync(path, JSON.stringify(result, null, 2));
        migrated++;
        console.log(`Migrated: ${file}`);
      }
      total++;
    }
  } catch(e) { /* dir may not exist */ }
}

console.log(`\n✅ Migrated ${migrated}/${total} files`);
