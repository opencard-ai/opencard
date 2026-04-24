/**
 * OpenCard Card Scraper - Regex Version
 * 
 * Scrapes card pages and extracts key data using regex.
 * Auto-updates when differences are found.
 * 
 * Usage: npx tsx scripts/scrape-card.ts [card_id]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'scrape-log.json');

interface Card {
  card_id: string;
  name: string;
  annual_fee?: number;
  welcome_bonus?: { amount: number; type: string; requirement?: string; source?: string; last_updated?: string };
  earning_rates?: Array<{ category: string; rate: number; notes?: string }>;
  foreign_transaction_fee?: number;
  sources?: Array<{ url: string }>;
  skip_scraping?: boolean;
  last_scraped?: string;
}

interface ScrapeResult {
  timestamp: string;
  card_id: string;
  card_name: string;
  action: 'updated' | 'verified' | 'error';
  changes: Record<string, { old: any; new: any }>;
  confidence: number;
  error?: string;
}

function fetchHtml(url: string): string {
  try {
    const html = execSync(
      `curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}" | head -c 150000`,
      { timeout: 20000, encoding: 'utf8' }
    );
    return html;
  } catch {
    return '';
  }
}

function extractFromHtml(html: string): any {
  const result: any = {};

  // Annual fee - look for patterns like "$95 annual fee" or "Annual Fee: $95"
  const feeMatch = html.match(/(?:annual|fee|Fee|ANNUAL)\s*[\$:]*\s*(\d+)/i);
  if (feeMatch && parseInt(feeMatch[1]) < 1000) {
    result.annual_fee = parseInt(feeMatch[1]);
  }

  // Welcome bonus - look for large numbers near "bonus", "earn", "welcome"
  const welcomePatterns = [
    /earn\s*(\d[\d,]*)\s*(?:bonus|points|miles|Bonus)/i,
    /(\d[\d,]*)\s*(?:bonus|welcome|sign[- ]?up)/i,
    /\$\s*(\d+)\s*(?:bonus|cash back|reward)/i,
    /welcome[^\d]*(\d[\d,]*)/i,
  ];
  for (const pattern of welcomePatterns) {
    const m = html.match(pattern);
    if (m) {
      const amount = parseInt(m[1].replace(/,/g, ''));
      if (amount >= 1000) { // Filter: welcome bonuses are usually >= 1000
        result.welcome_bonus = {
          amount,
          type: m[0].includes('$') ? 'cash' : 'points',
        };
        break;
      }
    }
  }

  // Earning rates - look for "X%" near category words
  const categoryRates: Array<{ category: string; rate: number }> = [];
  const categories = ['travel', 'dining', 'restaurants', 'gas', 'groceries', 'grocery', 'airlines', 'hotels', 'streaming', 'entertainment', 'all other', 'everything else'];
  
  for (const cat of categories) {
    const pattern = new RegExp(`(${cat})[^<]*?(\\d+)\\s*%`, 'i');
    const m = html.match(pattern);
    if (m) {
      const rate = parseInt(m[2]);
      if (rate > 0 && rate < 20) {
        categoryRates.push({ category: cat, rate });
      }
    }
  }
  if (categoryRates.length > 0) result.earning_rates = categoryRates;

  // Foreign transaction fee
  const ftfPatterns = [
    /(?:foreign|transaction|FTF)[^\d]*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:foreign|transaction fee)/i,
  ];
  for (const pattern of ftfPatterns) {
    const m = html.match(pattern);
    if (m) {
      result.foreign_transaction_fee = parseFloat(m[1]);
      break;
    }
  }

  return result;
}

async function scrapeCard(card: Card): Promise<ScrapeResult> {
  if (!card.sources?.[0]?.url) {
    return { timestamp: new Date().toISOString(), card_id: card.card_id, card_name: card.name, action: 'error', changes: {}, confidence: 0, error: 'No URL' };
  }

  console.log(`📥 ${card.name}...`);
  const url = card.sources[0].url;

  try {
    const html = fetchHtml(url);
    if (!html || html.length < 500) {
      return { timestamp: new Date().toISOString(), card_id: card.card_id, card_name: card.name, action: 'error', changes: {}, confidence: 0, error: 'No HTML' };
    }

    const extracted = extractFromHtml(html);
    const changes: Record<string, { old: any; new: any }> = {};

    // Compare annual_fee
    if (extracted.annual_fee && extracted.annual_fee !== card.annual_fee) {
      changes.annual_fee = { old: card.annual_fee, new: extracted.annual_fee };
    }

    // Compare welcome_bonus
    const oldBonus = card.welcome_bonus?.amount || 0;
    if (extracted.welcome_bonus?.amount && extracted.welcome_bonus.amount !== oldBonus) {
      changes.welcome_bonus = { old: oldBonus, new: extracted.welcome_bonus };
    }

    // Compare foreign_transaction_fee
    if (extracted.foreign_transaction_fee !== undefined && extracted.foreign_transaction_fee !== card.foreign_transaction_fee) {
      changes.foreign_transaction_fee = { old: card.foreign_transaction_fee, new: extracted.foreign_transaction_fee };
    }

    // Auto-update if changes found (high confidence)
    if (Object.keys(changes).length > 0) {
      if (changes.annual_fee) card.annual_fee = changes.annual_fee.new;
      if (changes.welcome_bonus) {
        card.welcome_bonus = {
          amount: changes.welcome_bonus.new.amount,
          type: changes.welcome_bonus.new.type || 'points',
          source: url,
          last_updated: new Date().toISOString().split('T')[0],
        };
      }
      if (changes.foreign_transaction_fee) {
        card.foreign_transaction_fee = changes.foreign_transaction_fee.new;
      }
      card.last_scraped = new Date().toISOString().split('T')[0];

      fs.writeFileSync(path.join(CARDS_DIR, `${card.card_id}.json`), JSON.stringify(card, null, 2));

      console.log(`  📝 ${Object.keys(changes).join(', ')} changed`);
      return { timestamp: new Date().toISOString(), card_id: card.card_id, card_name: card.name, action: 'updated', changes, confidence: 0.7 };
    }

    console.log(`  ✅ no changes`);
    return { timestamp: new Date().toISOString(), card_id: card.card_id, card_name: card.name, action: 'verified', changes: {}, confidence: 0.8 };
  } catch (error: any) {
    return { timestamp: new Date().toISOString(), card_id: card.card_id, card_name: card.name, action: 'error', changes: {}, confidence: 0, error: error.message };
  }
}

async function main() {
  const target = process.argv[2];
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  
  let cardsToScrape = files;
  if (target) {
    cardsToScrape = files.filter(f => f.includes(target.toLowerCase()));
  } else {
    cardsToScrape = files.sort(() => Math.random() - 0.5).slice(0, 15);
  }

  console.log(`🤖 OpenCard Scraper - ${cardsToScrape.length} cards\n`);

  const results: ScrapeResult[] = [];
  for (const file of cardsToScrape) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    if (card.skip_scraping) continue;
    
    const result = await scrapeCard(card);
    results.push(result);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Save log
  const existing = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) : [];
  fs.writeFileSync(LOG_FILE, JSON.stringify([...existing, ...results], null, 2));

  const updated = results.filter(r => r.action === 'updated').length;
  console.log(`\n📊 ${updated} updated, ${results.filter(r => r.action === 'verified').length} verified, ${results.filter(r => r.action === 'error').length} errors`);
  
  if (updated > 0) console.log('\n⚠️  Run `git add -A && git commit` to persist.');
}

main().catch(console.error);
