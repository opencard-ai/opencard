/**
 * OpenCard Credits Scraper - NerdWallet First, CreditCards.com Fallback
 * 
 * Uses NerdWallet as primary source, CreditCards.com as backup.
 * Same pattern as welcome offer scraper.
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const RAW_DIR = path.join(process.cwd(), 'data', 'raw-credits');
const LOG_FILE = path.join(process.cwd(), 'data', 'credits-log.json');

const SOURCES = {
  nerdwallet: {
    base: 'https://www.nerdwallet.com',
    search: 'https://www.nerdwallet.com/search/search?q=',
    regex: /nerdwallet\.com\/credit-cards\/reviews\/[^\s'"]+/g
  },
  creditcards: {
    base: 'https://www.creditcards.com'
  }
};

interface RecurringCredit {
  name: string;
  amount: number;
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time';
  category: string;
  description: string;
  reset_type: 'calendar_year' | 'cardmember_year';
}

interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  annual_fee?: number;
  recurring_credits?: RecurringCredit[];
  sources?: Array<{ url: string; name?: string }>;
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

function searchNerdWallet(cardName: string): string | null {
  try {
    // Strip special characters like ®, ©, ™
    const cleanName = cardName.replace(/[®©™]/g, '').trim();
    const searchUrl = `${SOURCES.nerdwallet.search}${encodeURIComponent(cleanName + ' credit card')}`;
    console.log(`  Searching NerdWallet: ${searchUrl}`);
    
    const curlCmd = `curl -s -L -A "Mozilla/5.0" "${searchUrl}" 2>/dev/null`;
    const html = execSync(curlCmd + " | grep -o 'nerdwallet.com/credit-cards/reviews/[^ ]*' | head -1", { encoding: 'utf8', timeout: 20000 });
    
    const urls = html.split('\n').filter(u => u.includes('review') && u.length > 20);
    if (urls.length > 0) {
      const firstUrl = urls[0].trim();
      console.log(`  Found: ${firstUrl}`);
      return firstUrl.startsWith('http') ? firstUrl : `https://${firstUrl}`;
    }
    return null;
  } catch (e: any) {
    console.log(`  NerdWallet search failed: ${e.message}`);
    return null;
  }
}

function scrapeNerdWallet(url: string): string | null {
  try {
    console.log(`  Scraping NerdWallet: ${url}`);
    const html = execSync(`curl -s -L -A "Mozilla/5.0" "${url}"`, { encoding: 'utf8', timeout: 15000 });
    
    // Extract text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (text.length > 500) {
      console.log(`  Got ${text.length} chars from NerdWallet`);
      return text;
    }
    return null;
  } catch (e: any) {
    console.log(`  NerdWallet scrape failed: ${e.message}`);
    return null;
  }
}

async function scrapeCreditCardsWithBrowser(url: string): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const text = await page.evaluate(() => document.body.innerText);
    await browser.close();
    
    return text;
  } catch (e: any) {
    await browser.close();
    throw new Error(`Browser failed: ${e.message}`);
  }
}

function extractCreditsFromText(text: string): RecurringCredit[] {
  const credits: RecurringCredit[] = [];
  
  // Patterns for recurring credits
  const patterns = [
    // $X/month or $X monthly
    [/\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s*)?month(?:ly)?/gi, 'monthly'],
    // $X/year or $X annually
    [/\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s*)?(?:year|annual)(?:ly)?/gi, 'annual'],
    // $X every 6 months or $X semi-annually
    [/\$\s*(\d+(?:\.\d{2})?)\s*(?:every\s*\d+\s*months?|semi-?annual)/gi, 'semi_annual'],
    // $X/quarter or $X quarterly  
    [/\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s*)?(?:quarter|quarterly)/gi, 'quarterly'],
    // $X per statement
    [/\$\s*(\d+(?:\.\d{2})?)\s*(?:per\s*)?statement/gi, 'monthly'],
  ];
  
  const creditKeywords = [
    'credit', 'rebate', 'cash back', 'statement credit', 'reimbursement',
    ' reimbursement', 'annual credit', 'monthly credit', 'quarterly credit',
    'doorDash', 'instacart', 'gopuff', 'peloton', 'equinox', 'uber', 'lyft',
    'global entry', 'tsa precheck', 'clear', 'lounge', 'priority pass',
    'resy', 'seamless', 'grubhub', 'doordash', 'hulu', 'disney+', 'netflix',
    'spotify', 'amazon prime', 'walmart+', 'saks', 'neck', 'half', 'dunkin'
  ];
  
  const lines = text.split(/\n|\.|\;/).filter(l => l.trim().length > 20);
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Check if line mentions a credit keyword
    const hasCreditKeyword = creditKeywords.some(k => lowerLine.includes(k));
    if (!hasCreditKeyword) continue;
    
    for (const [pattern, frequency] of patterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        const amount = parseFloat(match[1]);
        if (amount > 0 && amount < 1000) {
          // Extract credit name
          const nameMatch = line.match(/(?:get\s+|earn\s+)?\$?\d+(?:\.\d{2})?\s*(?:per\s*)?(?:month|year|quarter|semester)?\s*(?:for\s+)?([A-Za-z\s]+?)(?:\s*[-–—]|\s*\()/i);
          let name = nameMatch ? nameMatch[1].trim() : `Credit $${amount}`;
          
          // Clean up name
          name = name.replace(/^(get|earn|receive|use)\s+/i, '').trim();
          if (name.length > 50) name = name.substring(0, 50);
          
          // Determine category
          let category = 'other';
          const catKeywords: Record<string, string[]> = {
            'travel': ['travel', 'flight', 'airline', 'hotel', 'airport', 'lounge', 'priority pass'],
            'dining': ['dining', 'restaurant', 'resy', 'grubhub', 'doordash', 'seamless', 'food'],
            'streaming': ['streaming', 'hulu', 'netflix', 'spotify', 'disney+', 'hbo', 'paramount'],
            'ride': ['uber', 'lyft', 'ride', 'taxi'],
            'groceries': ['grocery', 'supermarket', 'whole foods', 'trade joes'],
            'shopping': ['amazon', 'walmart', 'saks', 'nordstrom'],
            'fitness': ['equinox', 'peloton', 'gym', 'fitness'],
            'digital': ['digital', 'wireless', 'phone', 'internet'],
          };
          
          for (const [cat, kws] of Object.entries(catKeywords)) {
            if (kws.some(k => lowerLine.includes(k))) {
              category = cat;
              break;
            }
          }
          
          credits.push({
            name,
            amount,
            frequency: frequency as any,
            category,
            description: line.trim().substring(0, 200),
            reset_type: 'calendar_year'
          });
        }
      }
    }
  }
  
  // Deduplicate
  const seen = new Set<string>();
  return credits.filter(c => {
    const key = `${c.name}|${c.amount}|${c.frequency}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeCard(searchTerm: string): Promise<ScrapeResult> {
  const timestamp = new Date().toISOString();
  
  const cardFile = getCardFile(searchTerm);
  if (!cardFile) {
    return { timestamp, card_id: searchTerm, card_name: searchTerm, source: 'nerdwallet', action: 'error', extracted: null, error: 'Card not found' };
  }
  
  const card: Card = JSON.parse(fs.readFileSync(cardFile, 'utf-8'));
  const cardId = path.basename(cardFile, '.json');
  
  console.log(`\nProcessing: ${card.name} (${cardId})`);
  
  // SOURCE 1: NerdWallet
  console.log('\n=== Source 1: NerdWallet ===');
  let text = null;
  let source = '';
  
  const nerdwalletUrl = searchNerdWallet(card.name);
  if (nerdwalletUrl) {
    text = scrapeNerdWallet(nerdwalletUrl);
    if (text && text.length > 1000) {
      source = 'nerdwallet';
      console.log(`  SUCCESS: Got ${text.length} chars from NerdWallet`);
    }
  }
  
  // SOURCE 2: CreditCards.com (fallback)
  if (!text || text.length < 1000) {
    console.log('\n=== Source 2: CreditCards.com (fallback) ===');
    try {
      const url = buildCreditCardsUrl(cardId, card.issuer || '');
      console.log(`  URL: ${url}`);
      text = await scrapeCreditCardsWithBrowser(url);
      if (text && text.length > 500) {
        source = 'creditcards.com';
        console.log(`  SUCCESS: Got ${text.length} chars from CreditCards.com`);
      }
    } catch (e: any) {
      console.log(`  CreditCards.com failed: ${e.message}`);
    }
  }
  
  // Save raw text for AI processing
  if (text && text.length > 500) {
    const rawFile = path.join(RAW_DIR, `${cardId}-raw.txt`);
    fs.writeFileSync(rawFile, text);
    console.log(`  Saved raw text (${text.length} chars) to ${rawFile}`);
    
    const credits = extractCreditsFromText(text);
    if (credits.length > 0) {
      console.log(`  Found ${credits.length} credits`);
      return { timestamp, card_id: cardId, card_name: card.name, source, action: 'updated', extracted: credits };
    }
  }
  
  return { timestamp, card_id: cardId, card_name: card.name, source: source || 'none', action: 'not_found', extracted: null, error: 'No content extracted' };
}

function getCardFile(searchTerm: string): string | null {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const exactMatch = files.find(f => f.replace('.json', '') === searchTerm.toLowerCase());
  if (exactMatch) return path.join(CARDS_DIR, exactMatch);
  for (const file of files) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf-8'));
    if (card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(card.name.toLowerCase())) {
      return path.join(CARDS_DIR, file);
    }
  }
  return null;
}

function buildCreditCardsUrl(cardId: string, issuer: string): string {
  const URL_OVERRIDES: Record<string, string> = {
    'amex-platinum': 'american-express/the-platinum-card',
    'amex-business-platinum': 'american-express/the-business-platinum-card-from-american-express',
    'amex-gold': 'american-express/american-express-gold-card',
    'chase-sapphire-preferred': 'chase/chase-sapphire-preferred',
    'chase-sapphire-reserve': 'chase/chase-sapphire-reserve',
    'capital-one-venture-x': 'capital-one/venture-x',
    'capital-one-savorone': 'capital-one/savorone',
  };
  
  if (URL_OVERRIDES[cardId]) return `https://www.creditcards.com/${URL_OVERRIDES[cardId]}/`;
  
  const issuerMap: Record<string, string> = {
    'chase': 'chase', 'american express': 'american-express', 'amex': 'american-express',
    'capital one': 'capital-one', 'citi': 'citi', 'discover': 'discover', 'barclays': 'barclays',
  };
  
  for (const [key, path] of Object.entries(issuerMap)) {
    if (issuer.toLowerCase().includes(key)) {
      return `https://www.creditcards.com/${path}/${cardId.replace(/-/g, '-')}/`;
    }
  }
  
  return `https://www.creditcards.com/${cardId.replace(/-/g, '-')}/`;
}

async function main() {
  const args = process.argv.slice(2);
  const allCards = args.includes('--all');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');
  
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }
  
  let cardsToProcess: string[] = [];
  
  if (allCards) {
    const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
    cardsToProcess = files.map(f => f.replace('.json', ''));
  } else if (args.length > 0) {
    cardsToProcess = args.filter(a => !a.startsWith('--'));
  } else {
    console.log('Usage: npx tsx credits-scraper.ts [card_id] [--all] [--limit=N]');
    process.exit(1);
  }
  
  const results: ScrapeResult[] = [];
  const count = allCards ? Math.min(cardsToProcess.length, limit) : cardsToProcess.length;
  
  console.log(`\n=== OpenCard Credits Scraper (NerdWallet + CreditCards.com) ===`);
  console.log(`Processing ${count} cards...\n`);
  
  for (let i = 0; i < count && i < cardsToProcess.length; i++) {
    const cardId = cardsToProcess[i];
    const result = await scrapeCard(cardId);
    results.push(result);
    console.log(`Result: ${result.action}`);
    
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 3000)); // Rate limit
    }
  }
  
  // Log results
  const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  log.results = results;
  log.total = results.length;
  log.updated = results.filter(r => r.action === 'updated').length;
  log.notFound = results.filter(r => r.action === 'not_found').length;
  log.timestamp = new Date().toISOString();
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${log.total}, Updated: ${log.updated}, Not Found: ${log.notFound}`);
}

main().catch(console.error);
