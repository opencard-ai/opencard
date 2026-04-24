/**
 * OpenCard Benefits Scraper - Daily Alert Version
 * 
 * Compares scraped benefits with local data and alerts on discrepancies.
 * Usage: npx tsx scripts/benefits-alert.ts
 */

import fs from 'fs';
import path from 'path';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');

interface Discrepancy {
  card_id: string;
  card_name: string;
  field: string;
  local_value: any;
  scraped_value: any;
  severity: 'high' | 'medium' | 'low';
}

interface Report {
  date: string;
  total_scraped: number;
  discrepancies: Discrepancy[];
  errors: string[];
}

async function scrapePage(url: string): Promise<string> {
  const response = await fetch(url);
  return await response.text();
}

function extractBenefitAmount(html: string): number | null {
  // Try to find welcome bonus amounts
  const welcomePatterns = [
    /earn\s*\$?([\d,]+)\s*(?:bonus|cash back|reward)/i,
    /\$?([\d,]+)\s*(?:welcome bonus|sign[- ]?up bonus|bonus)/i,
    /(\d+,?\d*)\s*(?:points| miles)/i,
  ];
  
  for (const pattern of welcomePatterns) {
    const match = html.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
  }
  
  // Try earning rates
  const earningPatterns = [
    /(\d+(?:\.\d+)?)\s*%\s*(?:cash back|earning|reward)/i,
    /(\d+)x\s*(?:points|miles|earning)/i,
  ];
  
  for (const pattern of earningPatterns) {
    const match = html.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  
  return null;
}

async function main() {
  console.log('🔍 OpenCard Benefits Scraper - Daily Check\n');
  
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const discrepancies: Discrepancy[] = [];
  const errors: string[] = [];
  let scraped = 0;
  
  // Sample 20 random cards for daily check
  const sampleSize = 20;
  const shuffled = files.sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, sampleSize);
  
  console.log(`Checking ${sample.length} cards...\n`);
  
  for (const file of sample) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    
    // Skip if no URL
    if (!card.sources?.[0]?.url) {
      continue;
    }
    
    // Skip if tagged
    if ((card as any).skip_scraping) {
      continue;
    }
    
    try {
      const url = card.sources[0].url;
      const html = await scrapePage(url);
      const scrapedAmount = extractBenefitAmount(html);
      
      if (scrapedAmount && card.welcome_bonus) {
        const localAmount = typeof card.welcome_bonus.amount === 'number' 
          ? card.welcome_bonus.amount 
          : parseInt(card.welcome_bonus.amount) || 0;
        
        if (Math.abs(scrapedAmount - localAmount) > localAmount * 0.1) {
          discrepancies.push({
            card_id: card.card_id,
            card_name: card.name,
            field: 'welcome_bonus.amount',
            local_value: localAmount,
            scraped_value: scrapedAmount,
            severity: Math.abs(scrapedAmount - localAmount) > localAmount * 0.3 ? 'high' : 'medium',
          });
        }
      }
      
      scraped++;
      
      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (error: any) {
      errors.push(`${card.card_id}: ${error.message}`);
    }
  }
  
  // Output report
  const report: Report = {
    date: new Date().toISOString().split('T')[0],
    total_scraped: scraped,
    discrepancies,
    errors,
  };
  
  console.log(`\n📊 Report Summary`);
  console.log(`Scraped: ${scraped}/${sample.length}`);
  console.log(`Discrepancies: ${discrepancies.length}`);
  console.log(`Errors: ${errors.length}`);
  
  if (discrepancies.length > 0) {
    console.log(`\n⚠️  DISCREPANCIES FOUND:\n`);
    for (const d of discrepancies) {
      const icon = d.severity === 'high' ? '🔴' : '🟡';
      console.log(`${icon} ${d.card_name}`);
      console.log(`   ${d.field}: ${d.local_value} → ${d.scraped_value}`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`\n❌ ERRORS:\n`);
    for (const e of errors.slice(0, 5)) {
      console.log(`   ${e}`);
    }
  }
  
  // Exit with code for cron alerting
  if (discrepancies.length > 0 || errors.length > sampleSize * 0.2) {
    console.log('\n⚠️  Action needed - discrepancies or high error rate detected');
    process.exit(1);
  }
}

main().catch(console.error);
