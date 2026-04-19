/**
 * Welcome Offer Scraper - Phase 1
 * 
 * Uses Playwright to fetch bank official pages and extract welcome offer info.
 * Runs once daily via cron job.
 * 
 * Usage: npx ts-node scripts/welcome-offer-scraper.ts
 */

import { chromium, Browser } from 'playwright';

const CARDS_TO_SCRAPE = [
  {
    card_id: 'chase-sapphire-preferred',
    name: 'Chase Sapphire Preferred',
    issuer: 'chase',
    url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred',
  },
  {
    card_id: 'chase-sapphire-reserve',
    name: 'Chase Sapphire Reserve',
    issuer: 'chase',
    url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve',
  },
  {
    card_id: 'amex-gold',
    name: 'Amex Gold',
    issuer: 'amex',
    url: 'https://www.americanexpress.com/us/credit-cards/card/gold/',
  },
  {
    card_id: 'amex-platinum',
    name: 'Amex Platinum',
    issuer: 'amex',
    url: 'https://www.americanexpress.com/us/credit-cards/card/platinum/',
  },
  {
    card_id: 'amex-blue-cash-preferred',
    name: 'Amex Blue Cash Preferred',
    issuer: 'amex',
    url: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/',
  },
  {
    card_id: 'capital-one-venture-x',
    name: 'Capital One Venture X',
    issuer: 'capital-one',
    url: 'https://www.capitalone.com/credit-cards/venture-x/',
  },
  {
    card_id: 'citi-custom-cash',
    name: 'Citi Custom Cash',
    issuer: 'citi',
    url: 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card',
  },
  {
    card_id: 'chase-freedom-unlimited',
    name: 'Chase Freedom Unlimited',
    issuer: 'chase',
    url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited',
  },
  {
    card_id: 'discover-it',
    name: 'Discover it Cash Back',
    issuer: 'discover',
    url: 'https://www.discover.com/credit-cards/cash-back/', // fallback - needs verify
  },
  {
    card_id: 'wells-fargo-autograph',
    name: 'Wells Fargo Autograph',
    issuer: 'wells-fargo',
    url: 'https://creditcards.wellsfargo.com/autograph-visa-credit-card',
  },
];

interface OfferResult {
  card_id: string;
  name: string;
  url: string;
  success: boolean;
  bonus_points?: number;
  spend_requirement?: number;
  time_months?: number;
  description?: string;
  error?: string;
  raw_text?: string;
}

async function scrapeCard(
  browser: Browser,
  card: (typeof CARDS_TO_SCRAPE)[0]
): Promise<OfferResult> {
  const page = await browser.newPage();
  
  try {
    // Randomize user agent to avoid bot detection
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    
    await page.goto(card.url, { 
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // Wait a bit for JS to render
    await page.waitForTimeout(2000);
    
    // Get page content for AI extraction
    const content = await page.content();
    const bodyText = await page.evaluate(() => document.body.innerText);
    
    // For Phase 1, just capture raw text
    // AI extraction will be added in Phase 2
    return {
      card_id: card.card_id,
      name: card.name,
      url: card.url,
      success: true,
      raw_text: bodyText.slice(0, 2000), // first 2000 chars for analysis
    };
  } catch (err: unknown) {
    return {
      card_id: card.card_id,
      name: card.name,
      url: card.url,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('🚀 Starting Welcome Offer Scraper - Phase 1\n');
  
  const browser = await chromium.launch({ headless: true });
  const results: OfferResult[] = [];
  
  for (const card of CARDS_TO_SCRAPE) {
    console.log(`Scraping: ${card.name}...`);
    const result = await scrapeCard(browser, card);
    results.push(result);
    
    if (result.success) {
      console.log(`  ✅ Success - ${result.raw_text?.slice(0, 100)}...`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
    
    // Rate limit: wait 3-5 seconds between requests
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
  }
  
  await browser.close();
  
  // Save results
  const fs = require('fs');
  const path = require('path');
  const outputPath = path.join(__dirname, '../data/scraper-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n📊 Results saved to ${outputPath}`);
  console.log(`\nSummary: ${results.filter(r => r.success).length}/${results.length} succeeded`);
  
  return results;
}

main().catch(console.error);
