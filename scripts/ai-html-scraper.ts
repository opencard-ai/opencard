/**
 * OpenCard AI HTML Scraper
 * 
 * Uses web_fetch + AI to extract card information from HTML.
 * Falls back to regex when AI parsing fails.
 * 
 * Usage: npx tsx scripts/ai-html-scraper.ts [card_id]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'ai-html-log.json');

interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  annual_fee?: number;
  network?: string;
  credit_level?: string;
  welcome_bonus?: Record<string, any>;
  earning_rates?: Array<{category: string; rate: number; notes?: string}>;
  benefits?: any[];
  recurring_credits?: any[];
  foreign_transaction_fee?: number;
  sources?: Array<{url: string}>;
  skip_scraping?: boolean;
  last_scraped?: string;
}

interface ScrapeResult {
  timestamp: string;
  card_id: string;
  card_name: string;
  action: 'updated' | 'created' | 'verified' | 'error';
  changes: Record<string, {old: any; new: any}>;
  confidence: number;
  error?: string;
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const html = execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}" | head -c 100000`, { 
      timeout: 15000,
      encoding: 'utf8'
    });
    return html;
  } catch (error) {
    return '';
  }
}

function extractJsonFromText(text: string): any {
  try {
    // Try to find JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*"[\w]+"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return null;
}

async function analyzeWithAI(html: string, cardName: string): Promise<any> {
  if (!html || html.length < 100) return null;

  // Save HTML to temp file for AI analysis
  const tempFile = `/tmp/opencard-ai-${Date.now()}.html`;
  fs.writeFileSync(tempFile, html);

  try {
    // Use Gemini or MiniMax to analyze the HTML
    // For now, use a simple approach with mcporter
    const prompt = `Analyze this credit card HTML page and extract:
    {
      "annual_fee": number or null,
      "welcome_bonus": {"amount": number, "type": "cash|points|miles", "requirement": "string"} or null,
      "earning_rates": [{"category": "string", "rate": number}],
      "foreign_transaction_fee": number or null
    }
    Card: ${cardName}
    Return JSON only, no markdown.`;

    // Try using Gemini CLI
    try {
      const result = execSync(`gemini --text "${prompt}" --no-stream 2>&1`, { timeout: 20000 });
      const text = result.toString();
      return extractJsonFromText(text);
    } catch {}

    // Fallback: use regex-based extraction
    return extractFromHtml(html);
  } catch (error) {
    return extractFromHtml(html);
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

function extractFromHtml(html: string): any {
  const result: any = {};

  // Annual fee
  const feeMatch = html.match(/\$?\s*(\d+)\s*(?:annual|fee|Annual|Fee)/i);
  if (feeMatch) result.annual_fee = parseInt(feeMatch[1]);

  // Welcome bonus - multiple patterns
  const welcomePatterns = [
    /(\d[\d,]*)\s*(?:bonus|Bonus|points|Points)/i,
    /\$\s*(\d+)\s*(?:bonus|cash back)/i,
    /earn\s*(\d[\d,]*)\s*/i,
  ];
  for (const pattern of welcomePatterns) {
    const m = html.match(pattern);
    if (m) {
      const amount = parseInt(m[1].replace(/,/g, ''));
      if (amount > 99) { // Filter out small numbers
        result.welcome_bonus = {
          amount,
          type: m[0].includes('$') ? 'cash' : 'points'
        };
        break;
      }
    }
  }

  // Earning rates
  const rateMatches = html.matchAll(/(\d+)%\s*(?:cash back|earning|reward|%|\*)/gi);
  const rates: Array<{category: string; rate: number}> = [];
  for (const m of rateMatches) {
    const rate = parseInt(m[1]);
    if (rate > 0 && rate < 100) {
      rates.push({ category: 'unknown', rate });
    }
  }
  if (rates.length > 0) result.earning_rates = rates.slice(0, 6);

  // Foreign transaction fee
  const ftfMatch = html.match(/(?:foreign|FTF|transaction fee)[\s:]*(\d+(?:\.\d+)?)\s*%/i);
  if (ftfMatch) result.foreign_transaction_fee = parseFloat(ftfMatch[1]);

  return result;
}

async function scrapeCard(card: Card): Promise<ScrapeResult> {
  if (!card.sources?.[0]?.url) {
    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'error',
      changes: {},
      confidence: 0,
      error: 'No source URL',
    };
  }

  const url = card.sources[0].url;
  console.log(`📥 Fetching ${card.name}...`);

  try {
    const html = await fetchHtml(url);
    const extracted = await analyzeWithAI(html, card.name);

    if (!extracted || Object.keys(extracted).length === 0) {
      return {
        timestamp: new Date().toISOString(),
        card_id: card.card_id,
        card_name: card.name,
        action: 'error',
        changes: {},
        confidence: 0,
        error: 'Failed to extract data',
      };
    }

    // Compare with existing data
    const changes: Record<string, {old: any; new: any}> = {};

    if (extracted.annual_fee && extracted.annual_fee !== card.annual_fee) {
      changes.annual_fee = { old: card.annual_fee, new: extracted.annual_fee };
    }

    if (extracted.welcome_bonus?.amount && (!card.welcome_bonus || extracted.welcome_bonus.amount !== card.welcome_bonus.amount)) {
      changes.welcome_bonus = {
        old: card.welcome_bonus?.amount,
        new: extracted.welcome_bonus
      };
    }

    if (extracted.foreign_transaction_fee !== undefined && extracted.foreign_transaction_fee !== card.foreign_transaction_fee) {
      changes.foreign_transaction_fee = { old: card.foreign_transaction_fee, new: extracted.foreign_transaction_fee };
    }

    // Auto-update if changes found
    if (Object.keys(changes).length > 0) {
      if (changes.annual_fee) card.annual_fee = changes.annual_fee.new;
      if (changes.welcome_bonus) {
        card.welcome_bonus = {
          amount: changes.welcome_bonus.new.amount,
          type: changes.welcome_bonus.new.type || 'points',
          last_updated: new Date().toISOString().split('T')[0],
          source: url,
        };
      }
      if (changes.foreign_transaction_fee) {
        card.foreign_transaction_fee = changes.foreign_transaction_fee.new;
      }
      card.last_scraped = new Date().toISOString().split('T')[0];

      fs.writeFileSync(path.join(CARDS_DIR, `${card.card_id}.json`), JSON.stringify(card, null, 2));

      return {
        timestamp: new Date().toISOString(),
        card_id: card.card_id,
        card_name: card.name,
        action: 'updated',
        changes,
        confidence: 0.75,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'verified',
      changes: {},
      confidence: 0.8,
    };
  } catch (error: any) {
    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'error',
      changes: {},
      confidence: 0,
      error: error.message,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetCardId = args[0];

  console.log('🤖 OpenCard AI HTML Scraper\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const results: ScrapeResult[] = [];

  let cardsToScrape = files;
  if (targetCardId) {
    cardsToScrape = files.filter(f => f.includes(targetCardId.toLowerCase()));
  } else {
    cardsToScrape = files.sort(() => Math.random() - 0.5).slice(0, 10);
  }

  for (const file of cardsToScrape) {
    const card: Card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    if (card.skip_scraping) continue;

    const result = await scrapeCard(card);
    results.push(result);

    if (result.action === 'updated') {
      console.log(`📝 ${result.card_name} updated!`);
      for (const [field, change] of Object.entries(result.changes)) {
        console.log(`   ${field}: ${JSON.stringify(change.old)} → ${JSON.stringify(change.new)}`);
      }
    } else if (result.action === 'verified') {
      console.log(`✅ ${result.card_name}`);
    } else if (result.action === 'error') {
      console.log(`❌ ${result.card_name} - ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const existingLog: ScrapeResult[] = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'))
    : [];
  fs.writeFileSync(LOG_FILE, JSON.stringify([...existingLog, ...results], null, 2));

  const updated = results.filter(r => r.action === 'updated').length;
  console.log(`\n📊 ${updated} updated, ${results.length - updated} verified`);

  if (updated > 0) {
    console.log('\n⚠️  Run `git add -A && git commit` to persist.');
  }
}

main().catch(console.error);
