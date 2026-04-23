/**
 * OpenCard Benefits Scraper v2
 * 
 * Scrapes official card pages and compares benefit amounts with local data.
 * Cards can be tagged with `skip_scraping: true` to skip.
 * 
 * Usage: npx tsx scripts/benefits-scraper.ts
 */

import fs from 'fs';
import path from 'path';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const RESULTS_FILE = path.join(process.cwd(), 'data', 'scraped-benefits.json');

// Skip patterns
const SKIP_PATTERNS = [
  /no annual fee/i,
  /no benefits/i,
  /pure cashback/i,
  /simple return/i,
  /flat.*%.*cash.*back/i,
];

// Benefit patterns to extract from HTML
const BENEFIT_PATTERNS = [
  // $X credit per month/year
  /\$\s*(\d+(?:\.\d+)?)\s*(?:credit|credit per|per|each)?\s*(month|year|annual|semiannual|six months|6 months|quarter)/gi,
  // $X monthly/annual
  /\$\s*(\d+(?:\.\d+)?)\s*(?:per )?(monthly|annual|year|semiannual|quarter)/gi,
  // $X every 6 months
  /\$\s*(\d+(?:\.\d+)?)\s*(?:every|per)\s*(?:six months|6 months|semiannual)/gi,
];

interface BenefitMatch {
  amount: number;
  frequency: string;
  raw: string;
}

interface ScrapedResult {
  card_id: string;
  card_name: string;
  scraped_at: string;
  source_url: string;
  status: 'success' | 'failed' | 'skipped' | 'no_url';
  extracted_benefits: BenefitMatch[];
  error?: string;
}

interface Discrepancy {
  credit_name: string;
  local_amount: number | null;
  local_frequency: string;
  extracted_amount: number | null;
  extracted_frequency: string;
  severity: 'high' | 'medium' | 'low';
}

// Extract benefits from HTML text
function extractBenefitsFromHTML(html: string): BenefitMatch[] {
  const matches: BenefitMatch[] = [];
  
  for (const pattern of BENEFIT_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const amount = parseFloat(match[1]);
      const raw = match[0];
      let frequency = match[2]?.toLowerCase() || 'unknown';
      
      // Normalize frequency
      if (frequency.includes('month') && !frequency.includes('six') && !frequency.includes('6')) {
        frequency = 'monthly';
      } else if (frequency.includes('six') || frequency.includes('6 month') || frequency.includes('semiannual')) {
        frequency = 'semi_annual';
      } else if (frequency.includes('quarter')) {
        frequency = 'quarterly';
      } else {
        frequency = 'annual';
      }
      
      if (!isNaN(amount) && amount > 0) {
        matches.push({ amount, frequency, raw });
      }
    }
  }
  
  return matches;
}

// Compare scraped benefits with local recurring_credits
function compareBenefits(localCredits: any[], extracted: BenefitMatch[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  
  for (const credit of (localCredits || [])) {
    if (credit.amount === null || credit.amount === undefined) continue;
    
    // Find matching extracted benefit by approximate amount
    const match = extracted.find(e => {
      const ratio = e.amount / (credit.amount || 1);
      return ratio >= 0.8 && ratio <= 1.2; // Within 20%
    });
    
    if (!match) {
      discrepancies.push({
        credit_name: credit.name,
        local_amount: credit.amount,
        local_frequency: credit.frequency,
        extracted_amount: null,
        extracted_frequency: 'not found',
        severity: 'medium',
      });
    } else if (match.amount !== credit.amount) {
      const diff = Math.abs(match.amount - credit.amount) / credit.amount;
      discrepancies.push({
        credit_name: credit.name,
        local_amount: credit.amount,
        local_frequency: credit.frequency,
        extracted_amount: match.amount,
        extracted_frequency: match.frequency,
        severity: diff > 0.2 ? 'high' : 'low',
      });
    }
  }
  
  return discrepancies;
}

async function scrapeCard(card: any, url: string): Promise<ScrapedResult> {
  const result: ScrapedResult = {
    card_id: card.card_id,
    card_name: card.name,
    scraped_at: new Date().toISOString(),
    source_url: url,
    status: 'failed',
    extracted_benefits: [],
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    result.extracted_benefits = extractBenefitsFromHTML(html);
    result.status = 'success';

  } catch (e: any) {
    result.error = e.message;
  }

  return result;
}

async function main() {
  console.log('🔍 OpenCard Benefits Scraper v2\n');
  console.log('Comparing scraped benefits with local card data...\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const allResults: Record<string, ScrapedResult> = {};
  const allDiscrepancies: Record<string, Discrepancy[]> = {};
  
  let stats = { scraped: 0, skipped: 0, failed: 0, noUrl: 0 };

  for (const file of files) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    
    // Skip check
    if (card.skip_scraping) {
      stats.skipped++;
      continue;
    }

    const shouldSkip = SKIP_PATTERNS.some(p => p.test(card.name || ''));
    if (shouldSkip) {
      stats.skipped++;
      continue;
    }

    const sourceUrl = card.sources?.[0]?.url;
    if (!sourceUrl) {
      stats.noUrl++;
      continue;
    }

    process.stdout.write(`📄 ${card.name.substring(0, 40)}... `);
    
    const result = await scrapeCard(card, sourceUrl);
    allResults[card.card_id] = result;

    if (result.status === 'success') {
      stats.scraped++;
      const discrepancies = compareBenefits(card.recurring_credits, result.extracted_benefits);
      if (discrepancies.length > 0) {
        allDiscrepancies[card.name] = discrepancies;
        console.log(`⚠️  ${discrepancies.length} discrepancy`);
      } else {
        console.log(`✅`);
      }
    } else {
      stats.failed++;
      console.log(`❌ ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ results: allResults, discrepancies: allDiscrepancies }, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   ✅ Scraped: ${stats.scraped}`);
  console.log(`   ⏭️  Skipped: ${stats.skipped}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  console.log(`   ⚠️  No URL: ${stats.noUrl}`);
  
  if (Object.keys(allDiscrepancies).length > 0) {
    console.log('\n⚠️  Discrepancies Found:');
    for (const [cardName, discrs] of Object.entries(allDiscrepancies)) {
      console.log(`\n  📛 ${cardName}:`);
      for (const d of discrs) {
        const localStr = `$${d.local_amount}/${d.local_frequency}`;
        const extractedStr = d.extracted_amount 
          ? `$${d.extracted_amount}/${d.extracted_frequency}` 
          : 'not found';
        console.log(`     • ${d.credit_name}: local=${localStr}, scraped=${extractedStr} [${d.severity}]`);
      }
    }
  } else {
    console.log('\n✅ No discrepancies found!');
  }
  
  console.log(`\nResults saved to ${RESULTS_FILE}`);
}

main();
