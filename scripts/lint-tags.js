#!/usr/bin/env node
/**
 * lint-tags.js
 * Auto-removes noisy tags from card data files.
 * Run: node scripts/lint-tags.js
 */

const fs = require("fs");
const path = require("path");

const CARDS_DIR = path.join(__dirname, "..", "data", "cards");

const TAGS_TO_REMOVE = new Set([
  // Card networks
  "visa","mastercard","world-elite","world-mastercard","visa-signature","amex",
  // Issuer/bank names leaking into tags
  "chase","capital-one","american-express","citi","discover","wells-fargo",
  "bank-of america","bank-of-america","u.s.-bank","u-s-bank","barclays",
  "capital one","usbank","navy-federal","hsbc","pnc","td-bank","usaa",
  "synchrony","bread-financial","elan","penfed","upgrade","sofi","self",
  "patelco","credit-one","first-progress","goldman-sachs","jpmorgan",
  // Airline names as tags
  "united","delta","southwest","jetblue","american-airlines","alaska-airlines",
  "british-airways","frontier","spirit-airlines","hawaiian","latam",
  "avios","aer-lingus","iberia","alaska",
  // Hotel names as tags
  "hilton","marriott","ihg","hyatt","radisson","wyndham","choice-hotels",
  // Co-brand merchant names
  "amazon","costco","sams-club","target","walmart","best-buy","lowes",
  "home-depot","macys","sears","kmart","tjmaxx","marshalls",
  "bed-bath-beyond","pottery-barn","williams-sonoma","homegoods",
  "starbucks","ulta","ebay","verizon","atmos","gm",
  // Crypto/finance
  "coinbase","bitcoin",
  // Card type/status noise
  "discontinued","discontinued-product","co-branded","debit-card",
  // Spending categories already grouped
  "all purchases","all purchases (flat)","all purchases (buy)",
  "groceries","grocery","grocery stores","restaurants","dining",
  "gas","gas (costco)","flights","airline","hotel","cruise","travel",
  "business","corporate","expense-management","office supply stores",
  "streaming","disney","entertainment","rotating",
]);

let totalRemoved = 0;
let totalFiles = 0;

const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith(".json"));

for (const file of files) {
  const filePath = path.join(CARDS_DIR, file);
  const card = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!card.tags || !Array.isArray(card.tags)) continue;

  const before = card.tags.length;
  card.tags = card.tags.filter((t) => !TAGS_TO_REMOVE.has(t.toLowerCase()));

  if (card.tags.length !== before) {
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2));
    totalFiles++;
    totalRemoved += before - card.tags.length;
  }
}

console.log(`✓ Checked ${files.length} cards`);
if (totalFiles > 0) {
  console.log(`  Cleaned ${totalFiles} files, removed ${totalRemoved} noisy tags`);
} else {
  console.log("  No noisy tags found — all clean!");
}
