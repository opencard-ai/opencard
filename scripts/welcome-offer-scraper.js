/**
 * Welcome Offer Scraper - Phase 1
 * 
 * Uses Playwright to fetch bank official pages and extract welcome offer info.
 * Runs once daily via cron job.
 * 
 * Usage: node scripts/welcome-offer-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CARDS_TO_SCRAPE = [
  { card_id: 'chase-sapphire-preferred', name: 'Chase Sapphire Preferred', url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred' },
  { card_id: 'chase-sapphire-reserve',  name: 'Chase Sapphire Reserve',  url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve' },
  { card_id: 'amex-gold',                name: 'Amex Gold',               url: 'https://www.americanexpress.com/us/credit-cards/card/gold/' },
  { card_id: 'amex-platinum',            name: 'Amex Platinum',            url: 'https://www.americanexpress.com/us/credit-cards/card/platinum/' },
  { card_id: 'amex-blue-cash-preferred', name: 'Amex Blue Cash Preferred', url: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/' },
  { card_id: 'capital-one-venture-x',    name: 'Capital One Venture X',    url: 'https://www.capitalone.com/credit-cards/venture-x/' },
  { card_id: 'citi-custom-cash',         name: 'Citi Custom Cash',         url: 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card' },
  { card_id: 'chase-freedom-unlimited', name: 'Chase Freedom Unlimited',  url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited' },
  { card_id: 'discover-it',              name: 'Discover it Cash Back',     url: 'https://www.discover.com/credit-cards/cash-back/' },
  { card_id: 'wells-fargo-autograph',    name: 'Wells Fargo Autograph',     url: 'https://creditcards.wellsfargo.com/autograph-visa-credit-card' },
];

async function scrapeCard(browser, card) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(card.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(8000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    return { card_id: card.card_id, name: card.name, url: card.url, success: true, raw_text: bodyText.slice(0, 3000) };
  } catch (err) {
    return { card_id: card.card_id, name: card.name, url: card.url, success: false, error: err.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('🚀 Welcome Offer Scraper - Phase 1\n');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const card of CARDS_TO_SCRAPE) {
    process.stdout.write(`Scraping: ${card.name}... `);
    const result = await scrapeCard(browser, card);
    results.push(result);
    console.log(result.success ? `✅` : `❌ ${result.error}`);
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
  }

  await browser.close();

  const outputPath = path.join(__dirname, '../data/scraper-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  const ok = results.filter(r => r.success).length;
  console.log(`\n📊 ${ok}/${results.length} succeeded → ${outputPath}`);
}

main().catch(console.error);
