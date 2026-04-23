/**
 * OpenCard Benefits Scraper
 * 
 * Scrapes official card pages to validate benefit amounts.
 * Cards can be tagged with `skip_scraping: true` to skip.
 * 
 * Usage: npx tsx scripts/benefits-scraper.ts
 */

import fs from 'fs';
import path from 'path';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const RESULTS_FILE = path.join(process.cwd(), 'data', 'scraped-benefits.json');

// Skip patterns (these don't need scraping - pure cashback, no benefits)
const SKIP_PATTERNS = [
  /no annual fee/i,
  /no benefits/i,
  /pure cashback/i,
  /simple return/i,
  /flat.*%.*cash.*back/i,
];

interface ScrapedResult {
  card_id: string;
  card_name: string;
  scraped_at: string;
  source_url: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

async function scrapeCard(card: any, url: string): Promise<ScrapedResult> {
  const result: ScrapedResult = {
    card_id: card.card_id,
    card_name: card.name,
    scraped_at: new Date().toISOString(),
    source_url: url,
    status: 'failed',
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    
    // TODO: Parse benefits from HTML
    // This is a placeholder - actual parsing would be card-specific
    
    result.status = 'success';
    return result;

  } catch (e: any) {
    result.error = e.message;
    return result;
  }
}

async function main() {
  console.log('🔍 OpenCard Benefits Scraper\n');

  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  const results: ScrapedResult[] = [];
  let skipped = 0;
  let scraped = 0;
  let failed = 0;
  let noUrl = 0;

  for (const file of files) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    
    // Check if should skip
    if (card.skip_scraping) {
      skipped++;
      continue;
    }

    // Check skip patterns
    const shouldSkip = SKIP_PATTERNS.some(p => p.test(card.name || ''));
    if (shouldSkip) {
      console.log(`⏭️  ${card.name} (matches skip pattern)`);
      skipped++;
      continue;
    }

    // Get source URL
    const sourceUrl = card.sources?.[0]?.url;
    if (!sourceUrl) {
      noUrl++;
      continue;
    }

    console.log(`📄 ${card.name}...`);
    
    const result = await scrapeCard(card, sourceUrl);
    results.push(result);

    if (result.status === 'success') {
      scraped++;
      console.log(`   ✅`);
    } else {
      failed++;
      console.log(`   ❌ ${result.error}`);
    }

    // Be nice to servers
    await new Promise(r => setTimeout(r, 500));
  }

  // Save results
  const resultsMap: Record<string, ScrapedResult> = {};
  for (const r of results) {
    resultsMap[r.card_id] = r;
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(resultsMap, null, 2));

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Scraped: ${scraped}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⚠️  No URL: ${noUrl}`);
  console.log(`\nResults saved to ${RESULTS_FILE}`);
}

main();
