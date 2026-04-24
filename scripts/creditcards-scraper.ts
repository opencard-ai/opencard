/**
 * OpenCard CreditCards.com Scraper v2
 * 
 * Scrapes credit card data from CreditCards.com with proper URL mapping.
 * Supports all major issuers.
 * 
 * Usage: npx tsx scripts/creditcards-scraper.ts [card_name_or_id]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'creditcards-log.json');

interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  annual_fee?: number;
  welcome_bonus?: { amount: number; type: string; requirement?: string; source?: string; last_updated?: string };
  earning_rates?: Array<{ category: string; rate: number; notes?: string }>;
  foreign_transaction_fee?: number;
  sources?: Array<{ url: string; name?: string }>;
  skip_scraping?: boolean;
  last_scraped?: string;
}

interface ScrapeResult {
  timestamp: string;
  card_id: string;
  card_name: string;
  source: string;
  action: 'updated' | 'verified' | 'error' | 'not_found';
  extracted: any;
  error?: string;
}

// CreditCards.com URL patterns by issuer
const ISSUER_URL_MAP: Record<string, string> = {
  'chase': 'chase',
  'american express': 'american-express',
  'amex': 'american-express',
  'capital one': 'capital-one',
  'capitalone': 'capital-one',
  'citi': 'citi',
  'citibank': 'citi',
  'discover': 'discover',
  'barclays': 'barclays',
  'bank of america': 'bank-of-america',
  'boa': 'bank-of-america',
  'wells fargo': 'wells-fargo',
  'u.s. bank': 'us-bank',
  'us bank': 'us-bank',
  'usb': 'us-bank',
};

// Manual URL overrides for cards with non-standard URLs
const URL_OVERRIDES: Record<string, string> = {
  'the-platinum-card': 'american-express/the-platinum-card',
  'amex-gold': 'american-express/american-express-gold',
  'amex-platinum': 'american-express/the-platinum-card',
  'chase-sapphire-preferred': 'chase/chase-sapphire-preferred',
  'chase-sapphire-reserve': 'chase/chase-sapphire-reserve',
};

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[®™']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildCreditCardsUrl(card: Card): string | null {
  const base = 'https://www.creditcards.com/';
  
  // Check for URL override first
  const nameSlug = slugify(card.name);
  if (URL_OVERRIDES[nameSlug]) {
    return base + URL_OVERRIDES[nameSlug] + '/';
  }
  
  // Try issuer-based URL
  const issuer = card.issuer?.toLowerCase() || '';
  const issuerPath = ISSUER_URL_MAP[issuer];
  
  if (issuerPath) {
    // Try the full slug first
    let url = base + issuerPath + '/' + nameSlug + '/';
    
    // Test URL
    try {
      const response = execSync(`curl -s -o /dev/null -w "%{http_code}" -L "${url}"`, { encoding: 'utf8', timeout: 10000 });
      if (response.trim() === '200') {
        return url;
      }
    } catch {}
    
    // Try shorter versions
    const shortSlugs = [
      nameSlug.replace(/-card$/, ''),
      nameSlug.replace(/-visa.*$/, ''),
      nameSlug.replace(/-mastercard.*$/, ''),
      nameSlug.replace(/-amex.*$/, ''),
    ];
    
    for (const slug of shortSlugs) {
      if (slug !== nameSlug) {
        url = base + issuerPath + '/' + slug + '/';
        try {
          const response = execSync(`curl -s -o /dev/null -w "%{http_code}" -L "${url}"`, { encoding: 'utf8', timeout: 10000 });
          if (response.trim() === '200') {
            return url;
          }
        } catch {}
      }
    }
  }
  
  return null;
}

function extractFromHtml(html: string): any {
  const result: any = {};

  // Extract annual fee from structured HTML
  const feeMatch = html.match(/<dt[^>]*>\s*Annual\s*Fee\s*<\/dt>[\s\S]*?<dd[^>]*>\s*\$?([\d,]+)/i);
  if (feeMatch) {
    result.annual_fee = parseInt(feeMatch[1].replace(/,/g, ''));
  } else {
    // Fallback: look for "$XXX annual fee" pattern
    const altFeeMatch = html.match(/\$(\d+)\s*(?:annual|fee)/i);
    if (altFeeMatch) {
      result.annual_fee = parseInt(altFeeMatch[1]);
    }
  }

  // Extract welcome bonus - CreditCards.com uses structured data
  // Pattern: "XXX,XXX Bonus Points after you spend $X,XXX"
  const bonusMatch = html.match(/(\d[\d,]*)\s*Bonus\s*Points?\s*after\s*you\s*spend/i);
  if (bonusMatch) {
    result.welcome_bonus = {
      amount: parseInt(bonusMatch[1].replace(/,/g, '')),
      type: 'points',
    };
  } else {
    // Try "As High As XXX,XXX points" pattern (Amex style)
    const highMatch = html.match(/as\s*high\s*as\s*(\d[\d,]*)\s*points?/i);
    if (highMatch) {
      result.welcome_bonus = {
        amount: parseInt(highMatch[1].replace(/,/g, '')),
        type: 'points',
      };
    } else {
      // Try cash bonus pattern
      const cashMatch = html.match(/\$(\d+)\s*(?:cash\s*)?bonus/i);
      if (cashMatch) {
        result.welcome_bonus = {
          amount: parseInt(cashMatch[1]),
          type: 'cash',
        };
      }
    }
  }

  // Extract foreign transaction fee
  const ftfMatch = html.match(/(?:foreign|FTF)[^\d]*(\d+(?:\.\d+)?)\s*%/i);
  if (ftfMatch) {
    result.foreign_transaction_fee = parseFloat(ftfMatch[1]);
  }

  return result;
}

async function scrapeCard(card: Card): Promise<ScrapeResult> {
  console.log(`\n📥 Scraping ${card.name} (${card.issuer})...`);
  
  const result: ScrapeResult = {
    timestamp: new Date().toISOString(),
    card_id: card.card_id,
    card_name: card.name,
    source: 'creditcards.com',
    action: 'error',
    extracted: {},
  };

  // Build URL
  const url = buildCreditCardsUrl(card);
  
  if (!url) {
    console.log(`  ❌ No URL found for issuer: ${card.issuer}`);
    result.error = 'Issuer not supported';
    return result;
  }
  
  console.log(`  🔗 URL: ${url}`);

  try {
    const html = execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`, { 
      encoding: 'utf8', 
      timeout: 20000 
    });
    
    if (html.includes('Whoops') || html.length < 5000) {
      console.log(`  ❌ Page not found or too short`);
      result.error = 'Page not found';
      return result;
    }
    
    const extracted = extractFromHtml(html);
    
    if (Object.keys(extracted).length === 0) {
      console.log(`  ❌ No data extracted`);
      result.error = 'No data found';
      return result;
    }
    
    console.log(`  ✅ Extracted:`, extracted);
    result.extracted = extracted;
    result.action = 'verified';
    
    // Compare with existing data
    const changes: Record<string, { old: any; new: any }> = {};
    
    if (extracted.annual_fee && extracted.annual_fee !== card.annual_fee) {
      changes.annual_fee = { old: card.annual_fee, new: extracted.annual_fee };
    }
    
    if (extracted.welcome_bonus?.amount) {
      const oldAmount = card.welcome_bonus?.amount || 0;
      const newAmount = extracted.welcome_bonus.amount;
      // Only flag if significantly different (>10% change or new bonus)
      if (newAmount !== oldAmount && (oldAmount === 0 || Math.abs(newAmount - oldAmount) / oldAmount > 0.1)) {
        changes.welcome_bonus = { old: oldAmount, new: newAmount };
      }
    }
    
    if (Object.keys(changes).length > 0) {
      // Update card
      if (changes.annual_fee) card.annual_fee = changes.annual_fee.new;
      if (changes.welcome_bonus) {
        card.welcome_bonus = {
          amount: changes.welcome_bonus.new,
          type: extracted.welcome_bonus.type || 'points',
          source: 'creditcards.com',
          last_updated: new Date().toISOString().split('T')[0],
        };
      }
      card.last_scraped = new Date().toISOString().split('T')[0];
      
      fs.writeFileSync(path.join(CARDS_DIR, `${card.card_id}.json`), JSON.stringify(card, null, 2));
      result.action = 'updated';
      console.log(`  📝 Updated:`, changes);
    }
    
  } catch (error: any) {
    console.log(`  ❌ Error: ${error.message.substring(0, 100)}`);
    result.error = error.message;
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  console.log('🤖 OpenCard CreditCards.com Scraper v2\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  
  let cardsToScrape = files;
  if (target) {
    // Try to find by card_id or name
    const lower = target.toLowerCase();
    cardsToScrape = files.filter(f => {
      const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
      return f.replace('.json', '').includes(lower) || 
             card.name.toLowerCase().includes(lower);
    });
  } else {
    // Random sample of 10
    cardsToScrape = files.sort(() => Math.random() - 0.5).slice(0, 10);
  }

  console.log(`Processing ${cardsToScrape.length} cards...\n`);

  const results: ScrapeResult[] = [];
  
  for (const file of cardsToScrape) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    if (card.skip_scraping) {
      console.log(`\n⏭️  Skipping ${card.name} (marked skip_scraping)`);
      continue;
    }
    
    const result = await scrapeCard(card);
    results.push(result);
    
    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save log
  const existingLog: ScrapeResult[] = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'))
    : [];
  fs.writeFileSync(LOG_FILE, JSON.stringify([...existingLog, ...results], null, 2));

  const updated = results.filter(r => r.action === 'updated').length;
  const verified = results.filter(r => r.action === 'verified').length;
  const errors = results.filter(r => r.action === 'error').length;

  console.log(`\n📊 Summary`);
  console.log(`Updated: ${updated}`);
  console.log(`Verified: ${verified}`);
  console.log(`Errors: ${errors}`);

  if (updated > 0) {
    console.log('\n⚠️  Run `git add -A && git commit` to persist changes.');
  }
}

main().catch(console.error);
