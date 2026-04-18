#!/usr/bin/env node
/**
 * Recalculate estimated_value for all cards based on TPG April 2026 valuations.
 * bonus * rate(cents) / 100 = dollar value, then round to nearest $100.
 * Skip cards where bonus is already a dollar amount (cash back cards).
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const VALUE_MAP = {
  "American Express Membership Rewards": 2.0,
  "Membership Rewards": 2.0,
  "Chase Ultimate Rewards": 2.05,
  "Ultimate Rewards": 2.05,
  "Chase Ultimate Rewards (Cash Back)": 2.05,
  "Chase Ultimate Rewards (cash back option)": 2.05,
  "Citi ThankYou Points": 1.9,
  "Citi": 1.9,
  "Capital One Miles": 1.85,
  "Capital One Cash Rewards": 1.85,
  "Capital One": 1.85,
  "Capital One Spark Cash": 1.85,
  "Wells Fargo Rewards": 1.65,
  "Wells Fargo Business": 1.65,
  "Bank of America Travel Points": 1.65,
  "Bilt": 2.2,
  "Luxury Card Points": 2.0,
  // Cash back / dollar bonus — these already have dollar estimated_value, skip recalc
  "Cash Back": null,
  "Statement Credit": null,
  "Amazon": null,
  "Amazon Points (Cash Back)": null,
  "Apple Rewards": null,
  "Disney Rewards": null,
  "Disney Rewards Dollars": null,
  "Kohl's Rewards": null,
  "Navy Federal": null,
  "Navy Federal Cash Rewards": null,
  "Navy Federal Rewards": null,
  "PNC Cash Rewards": null,
  "TD Cash": null,
  "TD Points": null,
  "U.S. Bank Cash+": null,
  "U.S. Bank Rewards": null,
  "Verizon Dollars": null,
  "Discover Cashback Match": null,
  "Points": null,
  "FunPoints": null,
  "TrueBlue Points": null,
  "Bank of America": null,
  "My GM Rewards": null,
  "Delta SkyMiles": 1.2,
  "United MileagePlus": 1.35,
  "American Airlines AAdvantage": 1.6,
  "Southwest Rapid Rewards": 1.25,
  "JetBlue TrueBlue": 1.35,
  "Frontier Miles": 1.3,
  "Spirit Airlines Free Spirit Points": 1.1,
  "Alaska Airlines Miles": 1.4,
  "Avios": 1.4,
  "Skywards Miles": 1.2,
  "Air Canada Aeroplan": 1.4,
  "Qantas Frequent Flyer": 1.3,
  "Singapore KrisFlyer": 1.3,
  "Cathay Pacific Asia Miles": 1.3,
  "Emirates Skywards": 1.2,
  "Etihad Guest": 1.2,
  "Flying Blue": 1.3,
  "Turkish Airlines Miles&Smiles": 1.1,
  "Hawaiian Miles": 1.3,
  "World of Hyatt": 1.7,
  "Marriott Bonvoy": 0.75,
  "Marriott Bonvoy Points": 0.75,
  "Hilton Honors": 0.4,
  "IHG One Rewards": 0.6,
  "IHG Rewards": 0.6,
  "Choice Privileges": 0.6,
  "Wyndham Rewards Points": 0.6,
  "Accor Live Limitless": 2.0,
  "MyCruise Points": 1.0,
  "Royal Caribbean Points": 1.0,
  "Atmos Rewards Points": 1.0,
  "PenFed Pathfinder Rewards": 1.0,
  "PenFed Platinum Rewards": 1.0,
  "PenFed Power Cash": null,
  // Additional specific programs
  "Wyndham Rewards": 0.6,
  // Barclays co-branded (stored as bonus_points in JSON but are miles/points)
  "Alaska Airlines Atmos": 1.4,
};

const CARDS_DIR = join(process.cwd(), "data", "cards");
const files = readdirSync(CARDS_DIR).filter(f => f.endsWith(".json"));

let updated = 0;
let skipped = 0;
const changes = [];

for (const file of files) {
  const path = join(CARDS_DIR, file);
  const card = JSON.parse(readFileSync(path));
  const wo = card.welcome_offer;

  if (!wo) { skipped++; continue; }

  const bonus = wo.bonus_points ?? wo.bonus_miles ?? null;
  if (bonus == null || bonus === 0) { skipped++; continue; }

  // If bonus is a small dollar amount (cash back cards) — skip
  if (bonus <= 500) {
    skipped++;
    continue;
  }

  const program = wo.point_program || "";
  const rate = VALUE_MAP[program] ?? null;

  // null = skip (cash back / unknown dollar)
  if (rate === null) {
    // already has estimated_value from original data — skip
    skipped++;
    continue;
  }

  // bonus * rate(cents) / 100 = dollar value → round to nearest $100
  const newVal = Math.round(bonus * rate / 100 / 100) * 100;
  const oldVal = wo.estimated_value;

  if (oldVal !== newVal) {
    card.welcome_offer = { ...wo, estimated_value: newVal };
    writeFileSync(path, JSON.stringify(card, null, 2) + "\n");
    changes.push({ file, name: card.name, old: oldVal, new: newVal, program, rate, bonus });
    updated++;
  } else {
    skipped++;
  }
}

console.log(`\n=== Recalculation Complete ===`);
console.log(`Updated: ${updated} cards | Skipped: ${skipped} cards`);

if (changes.length > 0) {
  console.log(`\nAll changes (sorted by new value):`);
  changes.sort((a, b) => b.new - a.new).forEach(l => {
    const oldStr = l.old != null ? `$${l.old.toLocaleString()}` : "null";
    const newStr = l.new != null ? `$${l.new.toLocaleString()}` : "null";
    console.log(`  ${newStr} (was ${oldStr}) | ${l.name} | ${l.bonus.toLocaleString()} × ${l.rate}¢ = $${(l.bonus * l.rate / 100).toFixed(0)}`);
  });
}
