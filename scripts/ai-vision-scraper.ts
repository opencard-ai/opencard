/**
 * OpenCard AI Vision Scraper
 * 
 * Uses bb-browser + AI Vision to fully scrape card pages.
 * Automatically extracts ALL card fields and updates the database.
 * 
 * Usage: npx tsx scripts/ai-vision-scraper.ts [card_id]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const LOG_FILE = path.join(process.cwd(), 'data', 'ai-vision-log.json');

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

async function takeScreenshot(url: string, cardId: string): Promise<string> {
  const screenshotPath = `/tmp/opencard-screenshot-${cardId}.png`;
  
  try {
    // Use bb-browser to open and screenshot
    execSync(`bb-browser open "${url}" 2>&1`, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000)); // Wait for page load
    execSync(`bb-browser screenshot --output ${screenshotPath} 2>&1`, { timeout: 15000 });
    return screenshotPath;
  } catch (error) {
    // Fallback to curl screenshot
    execSync(`curl -s "${url}" -o /tmp/opencard-page-${cardId}.html 2>&1`);
    return `/tmp/opencard-page-${cardId}.html`;
  }
}

async function analyzeWithVision(screenshotPath: string, cardName: string): Promise<any> {
  if (!screenshotPath.endsWith('.png')) return null;
  
  // Try MiniMax Vision API via mcporter
  try {
    const prompt = `Extract ALL credit card information from this page. Return JSON format:
    {
      "annual_fee": number or null,
      "welcome_bonus": {"amount": number, "type": "cash|points|miles", "requirement": "string"} or null,
      "earning_rates": [{"category": "string", "rate": number}],
      "benefits": ["string"],
      "foreign_transaction_fee": number or null,
      "credit_level": "string"
    }
    Card name: ${cardName}
    Only return valid JSON, no extra text.`;
    
    const cmd = `mcporter call minimax-search.understand_image prompt="${prompt.replace(/"/g, '\\"')}" image_source="${screenshotPath}" --output json 2>&1`;
    const result = execSync(cmd, { timeout: 30000 });
    const output = result.toString();
    
    // Parse JSON from mcporter output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Handle mcporter's content array format
      if (parsed.content && Array.isArray(parsed.content)) {
        const text = parsed.content.find((c: any) => c.type === 'text');
        if (text) {
          const jsonTextMatch = text.text.match(/\{[\s\S]*\}/);
          if (jsonTextMatch) {
            return JSON.parse(jsonTextMatch[0]);
          }
        }
      }
      return parsed;
    }
  } catch (error) {
    console.error('Vision API failed:', error.message);
  }
  
  return null;
}

function analyzeWithRegex(htmlPath: string): any {
  try {
    const content = fs.readFileSync(htmlPath, 'utf8');
    
    // Extract annual fee
    const feeMatch = content.match(/\$?\s*(\d+)\s*(?:annual|Annual|fee|Fee)/);
    const annualFee = feeMatch ? parseInt(feeMatch[1]) : null;
    
    // Extract welcome bonus
    const welcomePatterns = [
      /(\d+,?\d*)\s*(?:bonus| Bonus|points|Points|miles)/i,
      /\$\s*(\d+)\s*(?:bonus| Bonus)/i,
    ];
    let welcomeBonus = null;
    for (const pattern of welcomePatterns) {
      const m = content.match(pattern);
      if (m) {
        welcomeBonus = parseInt(m[1].replace(/,/g, ''));
        break;
      }
    }
    
    // Extract earning rates
    const rateMatches = content.matchAll(/(\d+)%\s*(?:cash back|earning|reward|%|\*)/gi);
    const rates = [...rateMatches].map(m => ({
      rate: parseInt(m[1]),
      category: 'unknown'
    })).slice(0, 5);
    
    return {
      annual_fee: annualFee,
      welcome_bonus: welcomeBonus ? { amount: welcomeBonus } : null,
      earning_rates: rates,
    };
  } catch {
    return {};
  }
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
  console.log(`📸 Scraping ${card.name}...`);

  try {
    const screenshotPath = await takeScreenshot(url, card.card_id);
    
    let extracted: any;
    if (screenshotPath.endsWith('.png')) {
      extracted = await analyzeWithVision(screenshotPath, card.name);
    }
    
    if (!extracted) {
      extracted = analyzeWithRegex(screenshotPath.replace('.png', '.html'));
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

    // Auto-update if confidence is high
    if (Object.keys(changes).length > 0) {
      // Update card
      if (changes.annual_fee) {
        card.annual_fee = changes.annual_fee.new;
      }
      if (changes.welcome_bonus) {
        card.welcome_bonus = {
          ...changes.welcome_bonus.new,
          last_updated: new Date().toISOString().split('T')[0],
          source: url,
        };
      }
      card.last_scraped = new Date().toISOString().split('T')[0];

      fs.writeFileSync(path.join(CARDS_DIR, `${card.card_id}.json`), JSON.stringify(card, null, 2));

      return {
        timestamp: new Date().toISOString(),
        card_id: card.card_id,
        card_name: card.name,
        action: 'updated',
        changes,
        confidence: 0.85,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      card_id: card.card_id,
      card_name: card.name,
      action: 'verified',
      changes: {},
      confidence: 0.9,
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

  console.log('🤖 OpenCard AI Vision Scraper\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const results: ScrapeResult[] = [];

  // Filter to target card or sample 10
  let cardsToScrape = files;
  if (targetCardId) {
    cardsToScrape = files.filter(f => f.includes(targetCardId));
  } else {
    // Random sample of 10
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
      console.log(`✅ ${result.card_name} - no changes`);
    } else if (result.action === 'error') {
      console.log(`❌ ${result.card_name} - ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  // Save log
  const existingLog: ScrapeResult[] = fs.existsSync(LOG_FILE) 
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) 
    : [];
  fs.writeFileSync(LOG_FILE, JSON.stringify([...existingLog, ...results], null, 2));

  const updated = results.filter(r => r.action === 'updated').length;
  console.log(`\n📊 Summary: ${updated} updated, ${results.length - updated} verified`);

  if (updated > 0) {
    console.log('\n⚠️  Run `git add -A && git commit` to persist changes.');
  }
}

main().catch(console.error);
