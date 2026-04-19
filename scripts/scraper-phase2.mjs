/**
 * Phase 2: Combined scraper + AI extraction + diff
 * 
 * Usage: node scripts/scraper-phase2.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'fs';

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

// Value map (cents per point)
const VALUE_MAP = {
  'Chase Ultimate Rewards': 1.2,
  'Citi ThankYou': 1.0,
  'American Express Membership Rewards': 1.2,
  'Capital One Miles': 1.2,
  'Wells Fargo Rewards': 0.8,
  'Discover Cashback': 1.0,
  'default': 1.0,
};

function extractOffer(text, cardId) {
  const t = text || '';
  
  // Points patterns (order matters - check more specific first)
  const ptsMatch = t.match(/Earn\s+([\d,]+)\s+bonus\s+points/i)
    || t.match(/Earn\s+([\d,]+)\s+bonus\s+miles/i)
    || t.match(/Earn\s+([\d,]+)\s+bonus\s+membership\s+rewards/i)
    || t.match(/Earn\s+([\d,]+)\s+Membership\s+Rewards/i)
    || t.match(/Earn\s+([\d,]+)\s+points/i)
    || t.match(/([\d,]+)\s+bonus\s+points/i)
    || t.match(/([\d,]+)\s+bonus\s+miles/i)
    || t.match(/Earn\s+([\d,]+)\s+miles/i)
    || t.match(/Earn\s+([\d,]+)\s+rewards/i);

  // Cash patterns
  const cashMatch = t.match(/Earn\s+\$?([\d,]+)\s+(?:cash\s+back\s+)?bonus/i)
    || t.match(/Earn\s+\$([\d,]+)\s+cash\s+back/i)
    || t.match(/\$([\d,]+)\s+bonus/i)
    || t.match(/bonus[\s\S]{0,30}\$([\d,]+)/i);

  // Spend
  const spendMatch = t.match(/spend\s+\$([\d,]+)/i)
    || t.match(/spending\s+\$([\d,]+)/i)
    || t.match(/after\s+\$([\d,]+)/i);

  // Months
  const monthsMatch = t.match(/first\s+(\d+)\s+months?/i)
    || t.match(/within\s+(\d+)\s+months?/i);

  const pts = ptsMatch ? parseInt(ptsMatch[1].replace(/,/g, ''), 10) : null;
  const cash = cashMatch && !ptsMatch ? parseInt(cashMatch[1].replace(/,/g, ''), 10) : null;
  const spend = spendMatch ? parseInt(spendMatch[1].replace(/,/g, ''), 10) : null;
  const months = monthsMatch ? parseInt(monthsMatch[1], 10) : null;

  return { pts, cash, spend, months };
}

async function scrapePage(browser, card) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    return { card_id: card.card_id, name: card.name, url: card.url, success: true, raw: bodyText.slice(0, 3000) };
  } catch (err) {
    return { card_id: card.card_id, name: card.name, url: card.url, success: false, error: err.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('🚀 Phase 2 Scraper\n');

  // Step 1: Scrape
  const browser = await chromium.launch({ headless: true });
  const scrapeResults = [];

  for (const card of CARDS_TO_SCRAPE) {
    process.stdout.write(`Scraping: ${card.name}... `);
    const r = await scrapePage(browser, card);
    scrapeResults.push(r);
    console.log(r.success ? '✅' : `❌ ${r.error?.slice(0,50)}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  await browser.close();

  // Step 2: Load DB - read individual card files
  const cardFiles = readdirSync('./data/cards').filter(f => f.endsWith('.json'));
  const currentMap = {};
  for (const file of cardFiles) {
    const card = JSON.parse(readFileSync(`./data/cards/${file}`, 'utf8'));
    currentMap[card.card_id] = card.welcome_offer;
  }

  // Step 3: Extract + Diff
  console.log('\n📊 Extract + Diff Results:\n');
  const report = [];
  
  for (const r of scrapeResults) {
    if (!r.success) {
      report.push({ card_id: r.card_id, name: r.name, status: 'scrape_failed', error: r.error });
      console.log(`⏭️  ${r.name}: scrape failed`);
      continue;
    }

    const offer = extractOffer(r.raw, r.card_id);
    const curr = currentMap[r.card_id];
    const currPts = curr?.bonus_points || 0;
    const extPts = offer.pts || offer.cash || 0;

    const changed = currPts !== extPts && extPts > 0 && (Math.abs(extPts - currPts) / Math.max(currPts, 1)) > 0.10;
    
    report.push({
      card_id: r.card_id,
      name: r.name,
      status: changed ? 'changed' : 'unchanged',
      current: currPts,
      extracted: extPts,
      pct: currPts > 0 ? Math.round(Math.abs(extPts - currPts) / currPts * 100) : 0,
      spend: offer.spend || curr?.spending_requirement,
      months: offer.months || curr?.time_period_months,
      raw: r.raw,
    });

    if (changed) {
      console.log(`🔄 ${r.name}:`);
      console.log(`   DB: ${currPts.toLocaleString()} → Scraped: ${extPts.toLocaleString()} (${report[report.length-1].pct}% delta)`);
    } else {
      console.log(`✅ ${r.name}: ${extPts.toLocaleString()} pts (unchanged)`);
    }
  }

  // Step 4: Save
  writeFileSync('./data/scraper-results.json', JSON.stringify(scrapeResults, null, 2));
  writeFileSync('./data/extract-results.json', JSON.stringify(report, null, 2));

  const changedCount = report.filter(r => r.status === 'changed').length;
  console.log(`\n💾 Saved to data/scraper-results.json + data/extract-results.json`);
  console.log(`\nSummary: ${changedCount} changed, ${report.length - changedCount} unchanged`);
}

main().catch(console.error);
