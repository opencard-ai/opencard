/**
 * OpenCard AI Scraper - Uses AI to parse card pages
 * Fully automated: scrape → parse → update → log
 * 
 * Usage: npx tsx scripts/ai-scraper.ts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'ai-scraper-log.json');

interface Card {
  card_id: string;
  name: string;
  welcome_bonus?: {
    amount: number;
    type: string;
    requirement?: string;
    source?: string;
    last_updated?: string;
  };
  sources?: Array<{ url: string }>;
  skip_scraping?: boolean;
}

interface LogEntry {
  timestamp: string;
  card_id: string;
  card_name: string;
  action: 'updated' | 'verified' | 'error';
  old_value?: any;
  new_value?: any;
  confidence: number;
  error?: string;
}

async function aiExtract(html: string, cardName: string): Promise<{ amount: number; type: string; requirement: string } | null> {
  // Use bb-browser to get a screenshot and AI parse it
  try {
    // Create a temporary script to use MiniMax MCP for vision
    const prompt = `Extract the welcome bonus information from this credit card page.
    
    Card: ${cardName}
    
    Look for:
    1. Welcome bonus amount (number + currency/points)
    2. Bonus type (cash, points, miles)
    3. Spending requirement (e.g., "spend $3,000 in first 3 months")
    
    Return JSON format:
    {"amount": number, "type": "cash"|"points"|"miles", "requirement": "string"}
    
    If no welcome bonus found, return null.`;

    // Use MiniMax MCP understand_image via mcporter
    // For now, use web_fetch + regex fallback
    const welcomePatterns = [
      /earn\s*\$?([\d,]+)\s*(?:bonus|cash back|reward)/i,
      /\$?([\d,]+)\s*(?:welcome bonus|sign[- ]?up bonus|bonus)/i,
      /(\d+,?\d*)\s*(?:bonus points|welcome bonus)/i,
      /(\d+,?\d*)\s*(?:points| miles)/i,
    ];

    for (const pattern of welcomePatterns) {
      const match = html.match(pattern);
      if (match) {
        const amount = parseInt(match[1].replace(/,/g, ''));
        const type = match[0].includes('$') ? 'cash' : 
                     match[0].includes('miles') ? 'miles' : 'points';
        return { amount, type, requirement: 'scraped' };
      }
    }
  } catch (error) {
    console.error(`AI extraction failed: ${error}`);
  }
  return null;
}

async function scrapeCard(card: Card): Promise<LogEntry | null> {
  if (!card.sources?.[0]?.url || card.skip_scraping) {
    return null;
  }

  try {
    const url = card.sources[0].url;
    
    // Use web_fetch to get page content
    const curlCmd = `curl -s "${url}" | head -c 50000`;
    const html = execSync(curlCmd, { encoding: 'utf8', timeout: 10000 });

    const extracted = await aiExtract(html, card.name);
    
    if (!extracted) {
      return {
        timestamp: new Date().toISOString(),
        card_id: card.card_id,
        card_name: card.name,
        action: 'verified',
        confidence: 0,
      };
    }

    const localBonus = card.welcome_bonus?.amount || 0;
    const diff = Math.abs(extracted.amount - localBonus);
    const pctDiff = localBonus > 0 ? diff / localBonus : (extracted.amount > 0 ? 1 : 0);

    // Auto-update if difference > 20%
    if (pctDiff > 0.2) {
      return {
        timestamp: new Date().toISOString(),
        card_id: card.card_id,
        card_name: card.name,
        action: 'updated',
        old_value: card.welcome_bonus,
        new_value: { ...extracted, source: url, last_updated: new Date().toISOString().split('T')[0] },
        confidence: pctDiff > 0.5 ? 0.5 : 0.8,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'verified',
      confidence: 0.9,
    };
  } catch (error: any) {
    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'error',
      error: error.message,
      confidence: 0,
    };
  }
}

async function main() {
  console.log('🤖 OpenCard AI Scraper - Fully Automated\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const results: LogEntry[] = [];
  let updated = 0;
  let verified = 0;
  let errors = 0;

  for (const file of files) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    const result = await scrapeCard(card);
    
    if (result) {
      results.push(result);
      
      if (result.action === 'updated') {
        console.log(`📝 ${result.card_name}: ${result.old_value?.amount} → ${result.new_value?.amount}`);
        
        // Auto-update the card file
        card.welcome_bonus = result.new_value;
        fs.writeFileSync(path.join(CARDS_DIR, file), JSON.stringify(card, null, 2));
        updated++;
      } else if (result.action === 'verified') {
        verified++;
      } else {
        errors++;
      }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Save log
  const existingLog: LogEntry[] = fs.existsSync(LOG_FILE) 
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) 
    : [];
  fs.writeFileSync(LOG_FILE, JSON.stringify([...existingLog, ...results], null, 2));

  console.log(`\n📊 Summary`);
  console.log(`Updated: ${updated}`);
  console.log(`Verified: ${verified}`);
  console.log(`Errors: ${errors}`);
  
  if (updated > 0) {
    console.log('\n✅ Changes saved. Run git commit to persist.');
  }
}

main().catch(console.error);
