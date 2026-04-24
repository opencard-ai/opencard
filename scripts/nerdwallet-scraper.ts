/**
 * OpenCard NerdWallet + CreditCards.com Scraper
 * 
 * Uses web_fetch to scrape credit card data from NerdWallet and CreditCards.com.
 * These sites aggregate card data and allow scraping.
 * 
 * Usage: npx tsx scripts/nerdwallet-scraper.ts [card_name]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'nerdwallet-log.json');

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

// Source URLs
const SOURCES = {
  nerdwallet: {
    search: 'https://www.nerdwallet.com/search/search?q=',
    review: 'https://www.nerdwallet.com/credit-cards/reviews/'
  },
  creditcards: {
    base: 'https://www.creditcards.com/'
  }
};

function searchNerdWallet(cardName: string): string | null {
  try {
    // Search for the card
    const searchUrl = `${SOURCES.nerdwallet.search}${encodeURIComponent(cardName + ' credit card review')}`;
    console.log(`  Searching NerdWallet: ${searchUrl}`);
    
    const html = execSync(`curl -s -L -A "Mozilla/5.0" "${searchUrl}" | grep -oP 'nerdwallet.com/credit-cards/reviews/[^"\']+' | head -3`, { encoding: 'utf8', timeout: 15000 });
    
    const urls = html.split('\n').filter(u => u.includes('review') && u.length > 20);
    if (urls.length > 0) {
      return 'https://' + urls[0].trim();
    }
  } catch {}
  return null;
}

function searchCreditCardsCom(cardName: string): string | null {
  try {
    // Map common card names to CreditCards.com URLs
    const cardSlug = cardName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);
    
    const url = `${SOURCES.creditcards.base}${cardSlug}/`;
    console.log(`  Trying CreditCards.com: ${url}`);
    
    // Test if URL exists
    const response = execSync(`curl -s -o /dev/null -w "%{http_code}" -L "${url}"`, { encoding: 'utf8', timeout: 10000 });
    if (response.trim() === '200') {
      return url;
    }
  } catch {}
  return null;
}

function extractFromNerdWallet(html: string): any {
  const result: any = {};

  // Extract annual fee - look for $XXX annual fee
  const feeMatch = html.match(/\$\s*(\d+)\s*(?:annual|fee)/i);
  if (feeMatch) {
    result.annual_fee = parseInt(feeMatch[1]);
  }

  // Extract welcome bonus - look for "X,XXX Bonus Points after you spend"
  // CreditCards.com format: "80,000 Bonus Points after you spend $10,000..."
  const welcomePatterns = [
    /(\d[\d,]*)\s*Bonus\s*Points\s*after\s*you\s*spend/i,
    /(\d[\d,]*)\s*bonus\s*points/gi,
    /Earn\s*(?:up\s*to\s*)?(\d[\d,]*)\s*(?:bonus\s*)?(?:points|miles)/gi,
    /\$\s*(\d+)\s*(?:bonus|cash\s*back)/gi,
  ];
  
  for (const pattern of welcomePatterns) {
    const match = html.match(pattern);
    if (match) {
      const amount = parseInt(match[1].replace(/,/g, ''));
      if (amount >= 1000) {
        result.welcome_bonus = {
          amount,
          type: match[0].includes('$') ? 'cash' : 'points',
        };
        break;
      }
    }
  }

  // Extract earning rates
  const ratePatterns = [
    /(\d+)\s*(?:x|times|%)\s*(?:points?\s*)?(?:on|at|in)\s*([a-z\s]+?)(?:\.|,|$)/gi,
    /([a-z\s]+?)\s*:\s*(\d+)\s*(?:x|times|%)/gi,
  ];
  
  const categories = ['travel', 'dining', 'restaurants', 'gas', 'groceries', 'grocery', 'airlines', 'hotels', 'streaming', 'entertainment', 'all other', 'everything', 'everyday'];
  const rates: Array<{ category: string; rate: number }> = [];
  
  for (const pattern of ratePatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const m of matches) {
      const text = (m[1] || m[2] || '').toLowerCase();
      const rate = parseInt(m[2] || m[1]);
      if (rate > 0 && rate < 20) {
        for (const cat of categories) {
          if (text.includes(cat)) {
            rates.push({ category: cat, rate });
            break;
          }
        }
      }
    }
  }
  
  if (rates.length > 0) {
    result.earning_rates = rates.slice(0, 6);
  }

  // Extract foreign transaction fee
  const ftfMatch = html.match(/(?:foreign|FTF)[^\d]*(\d+(?:\.\d+)?)\s*%/i);
  if (ftfMatch) {
    result.foreign_transaction_fee = parseFloat(ftfMatch[1]);
  }

  return result;
}

async function scrapeCard(card: Card): Promise<ScrapeResult> {
  console.log(`\n📥 Scraping ${card.name}...`);
  
  const result: ScrapeResult = {
    timestamp: new Date().toISOString(),
    card_id: card.card_id,
    card_name: card.name,
    source: '',
    action: 'error',
    extracted: {},
  };

  // Try NerdWallet first
  try {
    // Search for the card
    const searchUrl = `${SOURCES.nerdwallet.search}${encodeURIComponent(card.name + ' credit card')}`;
    const searchHtml = execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${searchUrl}" | head -c 50000`, { encoding: 'utf8', timeout: 15000 });
    
    // Find review URL
    const reviewUrlMatch = searchHtml.match(/nerdwallet\.com\/credit-cards\/reviews\/[a-z0-9-]+/gi);
    let reviewUrl = reviewUrlMatch ? 'https://' + reviewUrlMatch[0] : null;
    
    if (!reviewUrl) {
      // Try direct URL
      reviewUrl = `${SOURCES.nerdwallet.review}${card.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    }
    
    console.log(`  NerdWallet URL: ${reviewUrl}`);
    
    const reviewHtml = execSync(`curl -s -L -A "Mozilla/5.0" "${reviewUrl}" | head -c 80000`, { encoding: 'utf8', timeout: 15000 });
    
    if (reviewHtml.includes('Whoops') || reviewHtml.length < 5000) {
      console.log(`  NerdWallet: Page not found`);
    } else {
      const extracted = extractFromNerdWallet(reviewHtml);
      if (Object.keys(extracted).length > 0) {
        result.extracted = extracted;
        result.source = 'nerdwallet';
        result.action = 'verified';
        console.log(`  NerdWallet: Extracted ${Object.keys(extracted).join(', ')}`);
      }
    }
  } catch (error: any) {
    console.log(`  NerdWallet: Error - ${error.message.substring(0, 50)}`);
  }

  // If NerdWallet didn't work, try CreditCards.com
  if (result.action === 'error') {
    try {
      const slug = card.name.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 40);
      
      // Try various issuers
      const issuers = ['chase', 'amex', 'capital-one', 'citi', 'discover', 'barclays'];
      for (const issuer of issuers) {
        const url = `${SOURCES.creditcards.base}${issuer}/${slug}/`;
        const response = execSync(`curl -s -o /dev/null -w "%{http_code}" -L "${url}"`, { encoding: 'utf8', timeout: 10000 });
        if (response.trim() === '200') {
          console.log(`  CreditCards.com: Found at ${url}`);
          const html = execSync(`curl -s -L -A "Mozilla/5.0" "${url}" | head -c 50000`, { encoding: 'utf8', timeout: 15000 });
          const extracted = extractFromNerdWallet(html); // Reuse same extractor
          if (Object.keys(extracted).length > 0) {
            result.extracted = extracted;
            result.source = 'creditcards.com';
            result.action = 'verified';
            console.log(`  CreditCards.com: Extracted ${Object.keys(extracted).join(', ')}`);
          }
          break;
        }
      }
    } catch {}
  }

  // Compare with existing data
  if (result.action === 'verified' && result.extracted) {
    const changes: Record<string, { old: any; new: any }> = {};
    
    if (result.extracted.annual_fee && result.extracted.annual_fee !== card.annual_fee) {
      changes.annual_fee = { old: card.annual_fee, new: result.extracted.annual_fee };
    }
    
    if (result.extracted.welcome_bonus?.amount) {
      const oldAmount = card.welcome_bonus?.amount || 0;
      const newAmount = result.extracted.welcome_bonus.amount;
      if (newAmount !== oldAmount && Math.abs(newAmount - oldAmount) > oldAmount * 0.1) {
        changes.welcome_bonus = { old: oldAmount, new: newAmount };
      }
    }

    // If there are significant changes, update
    if (Object.keys(changes).length > 0) {
      if (changes.annual_fee) card.annual_fee = changes.annual_fee.new;
      if (changes.welcome_bonus) {
        card.welcome_bonus = {
          amount: changes.welcome_bonus.new,
          type: result.extracted.welcome_bonus.type || 'points',
          source: result.source,
          last_updated: new Date().toISOString().split('T')[0],
        };
      }
      card.last_scraped = new Date().toISOString().split('T')[0];
      
      fs.writeFileSync(path.join(CARDS_DIR, `${card.card_id}.json`), JSON.stringify(card, null, 2));
      result.action = 'updated';
      console.log(`  📝 Updated: ${Object.keys(changes).join(', ')}`);
    }
  }

  if (result.action === 'error') {
    result.error = 'No data found from any source';
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const targetName = args[0];

  console.log('🤖 OpenCard NerdWallet + CreditCards.com Scraper\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const results: ScrapeResult[] = [];

  // Filter to target card or sample 10
  let cardsToScrape = files;
  if (targetName) {
    cardsToScrape = files.filter(f => f.includes(targetName.toLowerCase().replace(/\s+/g, '-')));
    if (cardsToScrape.length === 0) {
      // Try fuzzy match
      const lower = targetName.toLowerCase();
      cardsToScrape = files.filter(f => {
        const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
        return card.name.toLowerCase().includes(lower);
      });
    }
  } else {
    cardsToScrape = files.sort(() => Math.random() - 0.5).slice(0, 10);
  }

  console.log(`Processing ${cardsToScrape.length} cards...\n`);

  for (const file of cardsToScrape) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    if (card.skip_scraping) continue;

    const result = await scrapeCard(card);
    results.push(result);

    await new Promise(r => setTimeout(r, 2000)); // Rate limit
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
  console.log(`Verified (no changes): ${verified}`);
  console.log(`Errors: ${errors}`);

  if (updated > 0) {
    console.log('\n⚠️  Run `git add -A && git commit` to persist changes.');
  }
}

main().catch(console.error);
