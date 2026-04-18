/**
 * Recalculate estimated_value using CONSERVATIVE valuations.
 * Based on TPG April 2026, reduced ~40% to reflect typical redemption (not best-case).
 * Run: node scripts/recalc-estimates.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const VALUE_MAP = {
  "Chase Ultimate Rewards": 1.2,
  "Ultimate Rewards": 1.2,
  "Chase Ultimate Rewards (Cash Back)": 1.2,
  "Chase Ultimate Rewards (cash back option)": 1.2,
  "American Express Membership Rewards": 1.2,
  "Membership Rewards": 1.2,
  "Capital One Miles": 1.2,
  "Capital One Cash Rewards": 1.2,
  "Capital One": 1.2,
  "Capital One Spark Cash": 1.2,
  "Citi ThankYou Points": 1.2,
  "Citi": 1.2,
  "Delta SkyMiles": 1.0,
  "United MileagePlus": 1.2,
  "American Airlines AAdvantage": 1.2,
  "Southwest Rapid Rewards": 1.0,
  "JetBlue TrueBlue": 1.2,
  "Frontier Miles": 1.0,
  "Spirit Airlines Free Spirit Points": 0.8,
  "Alaska Airlines Miles": 1.2,
  "Avios": 1.2,
  "Skywards Miles": 1.2,
  "Air Canada Aeroplan": 1.2,
  "Qantas Frequent Flyer": 1.2,
  "Singapore KrisFlyer": 1.2,
  "Cathay Pacific Asia Miles": 1.2,
  "Emirates Skywards": 1.2,
  "Etihad Guest": 1.2,
  "Flying Blue": 1.2,
  "Turkish Airlines Miles&Smiles": 1.0,
  "Hawaiian Miles": 1.0,
  "World of Hyatt": 1.2,
  "Marriott Bonvoy": 0.6,
  "Marriott Bonvoy Points": 0.6,
  "Hilton Honors": 0.4,
  "IHG One Rewards": 0.5,
  "IHG Rewards": 0.5,
  "Choice Privileges": 0.6,
  "Wyndham Rewards Points": 0.6,
  "Accor Live Limitless": 1.2,
  "MyCruise Points": 1.0,
  "Royal Caribbean Points": 1.0,
  "Atmos Rewards Points": 1.0,
  "PenFed Pathfinder Rewards": 1.0,
  "PenFed Platinum Rewards": 1.0,
  "Wells Fargo Rewards": 1.2,
  "Wells Fargo Business": 1.2,
  "Bank of America Travel Points": 1.2,
  "Bilt": 1.5,
  "Luxury Card Points": 1.2,
  // null = cash back / dollar bonus — skip recalc
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
  "PenFed Power Cash": null,
};

const CARDS_DIR = join(process.cwd(), "data", "cards");
const files = readdirSync(CARDS_DIR).filter(f => f.endsWith(".json"));

let updated = 0, skipped = 0;
const changes = [];

for (const file of files) {
  const card = JSON.parse(readFileSync(join(CARDS_DIR, file)));
  const wo = card.welcome_offer;
  if (!wo) { skipped++; continue; }
  const bonus = wo.bonus_points ?? wo.bonus_miles ?? null;
  if (!bonus || bonus <= 500) { skipped++; continue; }
  const rate = VALUE_MAP[wo.point_program || ""];
  if (rate == null) { skipped++; continue; }
  const newVal = Math.round(bonus * rate / 100 / 100) * 100;
  if (wo.estimated_value !== newVal) {
    card.welcome_offer = { ...wo, estimated_value: newVal };
    writeFileSync(join(CARDS_DIR, file), JSON.stringify(card, null, 2) + "\n");
    changes.push({ name: card.name, old: wo.estimated_value, new: newVal, bonus, rate });
    updated++;
  } else {
    skipped++;
  }
}

console.log(`Updated: ${updated} | Skipped: ${skipped}`);
changes.sort((a,b) => b.new - a.new).slice(0,15).forEach(c =>
  console.log(`  $${c.new.toLocaleString()} (was $${(c.old||0).toLocaleString()}) | ${c.name} | ${c.bonus.toLocaleString()} x ${c.rate}¢`));
