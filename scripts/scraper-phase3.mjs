/**
 * Phase 3: Full scraper with free API fallback + 50 cards
 * 
 * Strategy:
 * - Chase/Capital One/Citi/Wells Fargo/Discover: Playwright scrape (reliable)
 * - Amex/Barclays/others: Free API fallback (eval disabled)
 * - Compare with local DB, flag >10% changes
 */

import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import https from 'https';

// Fetch URL
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

// Load free API cards (download if needed)
let FREE_API_CARDS;
try {
  FREE_API_CARDS = JSON.parse(readFileSync('./data/free-api-cards.json', 'utf8'));
} catch {
  console.log('📥 Downloading free API data...');
  const data = await fetch('https://raw.githubusercontent.com/andenacitelli/credit-card-bonuses-api/main/exports/data.json');
  const cards = JSON.parse(data);
  FREE_API_CARDS = {};
  for (const c of cards) {
    FREE_API_CARDS[c.name] = { url: c.url, pts: c.offers[0]?.amount?.[0]?.amount || 0 };
  }
  writeFileSync('./data/free-api-cards.json', JSON.stringify(FREE_API_CARDS, null, 2));
  console.log(`   Downloaded ${Object.keys(FREE_API_CARDS).length} cards`);
}

// Load our card database
const cardFiles = readdirSync('./data/cards').filter(f => f.endsWith('.json'));
const localDB = {};
for (const file of cardFiles) {
  const card = JSON.parse(readFileSync(`./data/cards/${file}`, 'utf8'));
  localDB[card.card_id] = card;
}

// Card list: 50 most popular cards
// Format: { card_id, name, issuer, url, source: 'scrape'|'api', pts: from_api }
const CARDS = [
  // === CHASE (scrapable) ===
  { card_id: 'chase-sapphire-preferred', name: 'Chase Sapphire Preferred', issuer: 'Chase', url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', source: 'scrape' },
  { card_id: 'chase-sapphire-reserve', name: 'Chase Sapphire Reserve', issuer: 'Chase', url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', source: 'scrape' },
  { card_id: 'chase-freedom-unlimited', name: 'Chase Freedom Unlimited', issuer: 'Chase', url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', source: 'scrape' },
  { card_id: 'chase-freedom-flex', name: 'Chase Freedom Flex', issuer: 'Chase', url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', source: 'scrape' },
  { card_id: 'chase-ink-business-preferred', name: 'Ink Business Preferred', issuer: 'Chase', url: 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', source: 'scrape' },
  { card_id: 'chase-ink-business-cash', name: 'Ink Business Cash', issuer: 'Chase', url: 'https://creditcards.chase.com/business-credit-cards/ink/business-cash', source: 'scrape' },
  { card_id: 'chase-ink-business-unlimited', name: 'Ink Business Unlimited', issuer: 'Chase', url: 'https://creditcards.chase.com/business-credit-cards/ink/business-unlimited', source: 'scrape' },
  { card_id: 'chase-marriott-boundless', name: 'Marriott Bonvoy Boundless', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/marriott/bonvoy-boundless', source: 'scrape' },
  { card_id: 'chase-marriott-bold', name: 'Marriott Bonvoy Bold', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/marriott/bonvoy-bold', source: 'scrape' },
  { card_id: 'chase-ihg-premier', name: 'IHG Premier', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/ihg/ihg-premier', source: 'scrape' },
  { card_id: 'chase-hyatt', name: 'World of Hyatt', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/world-of-hyatt', source: 'scrape' },
  { card_id: 'chase-disney-premier', name: 'Disney Premier', issuer: 'Chase', url: 'https://creditcards.chase.com/rewards-credit-cards/disney/premier', source: 'scrape' },
  { card_id: 'chase-amazon-prime-visa', name: 'Amazon Prime Visa', issuer: 'Chase', url: 'https://www.amazon.com/b?node=180奈18', source: 'scrape' },
  { card_id: 'chase-amazon-visa', name: 'Amazon Visa', issuer: 'Chase', url: 'https://creditcards.chase.com/rewards-credit-cards/amazon', source: 'scrape' },
  { card_id: 'chase-united-explorer', name: 'United Explorer', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/united/united-explorer', source: 'scrape' },
  { card_id: 'chase-southwest-premier', name: 'Southwest Rapid Rewards Premier', issuer: 'Chase', url: 'https://creditcards.chase.com/travel-credit-cards/southwest/premier', source: 'scrape' },

  // === CAPITAL ONE (scrapable) ===
  { card_id: 'capital-one-venture-x', name: 'Capital One Venture X', issuer: 'Capital One', url: 'https://www.capitalone.com/credit-cards/venture-x/', source: 'scrape' },
  { card_id: 'capital-one-venture', name: 'Capital One Venture', issuer: 'Capital One', url: 'https://www.capitalone.com/credit-cards/venture/', source: 'scrape' },
  { card_id: 'capital-one-savorone', name: 'Capital One SavorOne', issuer: 'Capital One', url: 'https://www.capitalone.com/credit-cards/savorone/', source: 'scrape' },
  { card_id: 'capital-one-savor', name: 'Capital One Savor', issuer: 'Capital One', url: 'https://www.capitalone.com/credit-cards/savor/', source: 'scrape' },
  { card_id: 'capital-one-quicksilver', name: 'Capital One Quicksilver', issuer: 'Capital One', url: 'https://www.capitalone.com/credit-cards/quicksilver/', source: 'scrape' },

  // === WELLS FARGO (scrapable) ===
  { card_id: 'wells-fargo-autograph', name: 'Wells Fargo Autograph', issuer: 'Wells Fargo', url: 'https://creditcards.wellsfargo.com/autograph-visa-credit-card', source: 'scrape' },
  { card_id: 'wells-fargo-attune', name: 'Wells Fargo Attune', issuer: 'Wells Fargo', url: 'https://creditcards.wellsfargo.com/attract-visa-credit-card', source: 'scrape' },
  { card_id: 'wells-fargo-active-cash', name: 'Wells Fargo Active Cash', issuer: 'Wells Fargo', url: 'https://creditcards.wellsfargo.com/active-cash-credit-card', source: 'scrape' },

  // === CITI (scrapable) ===
  { card_id: 'citi-custom-cash', name: 'Citi Custom Cash', issuer: 'Citi', url: 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card', source: 'scrape' },
  { card_id: 'citi-strata-premier', name: 'Citi Strata Premier', issuer: 'Citi', url: 'https://www.citi.com/credit-cards/citi-strata-premier-card', source: 'scrape' },
  { card_id: 'citi-double-cash', name: 'Citi Double Cash', issuer: 'Citi', url: 'https://www.citi.com/credit-cards/citi-double-cash-credit-card', source: 'scrape' },
  { card_id: 'citi-rewards', name: 'Citi Rewards+', issuer: 'Citi', url: 'https://www.citi.com/credit-cards/citi-rewards-plus-card', source: 'scrape' },

  // === DISCOVER (scrapable) ===
  { card_id: 'discover-it', name: 'Discover it Cash Back', issuer: 'Discover', url: 'https://www.discover.com/credit-cards/cash-back/', source: 'scrape' },
  { card_id: 'discover-it-chrome', name: 'Discover it Chrome', issuer: 'Discover', url: 'https://www.discover.com/credit-cards/cash-back/chrome', source: 'scrape' },
  { card_id: 'discover-it-miles', name: 'Discover it Miles', issuer: 'Discover', url: 'https://www.discover.com/credit-cards/miles/', source: 'scrape' },

  // === AMEX (API fallback only - eval disabled) ===
  { card_id: 'amex-platinum', name: 'Amex Platinum', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/platinum/', source: 'api' },
  { card_id: 'amex-gold', name: 'Amex Gold', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/gold/', source: 'api' },
  { card_id: 'amex-blue-cash-preferred', name: 'Amex Blue Cash Preferred', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', source: 'api' },
  { card_id: 'amex-blue-cash-everyday', name: 'Amex Blue Cash Everyday', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', source: 'api' },
  { card_id: 'amex-everyday', name: 'Amex Everyday', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/everyday/', source: 'api' },
  { card_id: 'amex-green', name: 'Amex Green', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/green/', source: 'api' },
  { card_id: 'amex-hilton-honors', name: 'Amex Hilton Honors', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/hilton-honors/', source: 'api' },
  { card_id: 'amex-hilton-surpass', name: 'Amex Hilton Surpass', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/hilton-surpass/', source: 'api' },
  { card_id: 'amex-hilton-aspire', name: 'Amex Hilton Aspire', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/hilton-aspire/', source: 'api' },
  { card_id: 'amex-marriott-brilliant', name: 'Amex Marriott Brilliant', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-brilliant/', source: 'api' },
  { card_id: 'amex-marriott-bevy', name: 'Amex Marriott Bevy', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-bevy/', source: 'api' },
  { card_id: 'amex-delta-skymiles-gold', name: 'Delta SkyMiles Gold', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-gold-american-express-card/', source: 'api' },
  { card_id: 'amex-delta-skymiles-platinum', name: 'Delta SkyMiles Platinum', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-platinum-american-express-card/', source: 'api' },
  { card_id: 'amex-delta-skymiles-reserve', name: 'Delta SkyMiles Reserve', issuer: 'Amex', url: 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-reserve-american-express-card/', source: 'api' },
  { card_id: 'amex-biz-platinum', name: 'Amex Business Platinum', issuer: 'Amex', url: 'https://www.americanexpress.com/en-us/business/credit-cards/platinum/', source: 'api' },
  { card_id: 'amex-biz-gold', name: 'Amex Business Gold', issuer: 'Amex', url: 'https://www.americanexpress.com/en-us/business/credit-cards/gold/', source: 'api' },
  { card_id: 'amex-biz-blue', name: 'Amex Business Blue', issuer: 'Amex', url: 'https://www.americanexpress.com/en-us/business/credit-cards/blue/', source: 'api' },

  // === BANK OF AMERICA (API fallback) ===
  { card_id: 'boa-customized-cash', name: 'Bank of America Customized Cash', issuer: 'Bank of America', url: 'https://www.bankofamerica.com/credit-cards/customized-cash-rewards/', source: 'api' },
  { card_id: 'boa-premium-rewards', name: 'Bank of America Premium Rewards', issuer: 'Bank of America', url: 'https://www.bankofamerica.com/credit-cards/premium-rewards/', source: 'api' },
  { card_id: 'boa-travel-rewards', name: 'Bank of America Travel Rewards', issuer: 'Bank of America', url: 'https://www.bankofamerica.com/credit-cards/travel-rewards/', source: 'api' },

  // === US BANK (API fallback) ===
  { card_id: 'us-bank-altitude-reserve', name: 'US Bank Altitude Reserve', issuer: 'US Bank', url: 'https://www.usbank.com/credit-cards/altitude-reserve-visa-signature/', source: 'api' },
  { card_id: 'us-bank-altitude-connect', name: 'US Bank Altitude Connect', issuer: 'US Bank', url: 'https://www.usbank.com/credit-cards/altitude-connect-visa-signature/', source: 'api' },

  // === BARCLAYS (API fallback) ===
  { card_id: 'barclays-jetblue-plus', name: 'JetBlue Plus', issuer: 'Barclays', url: 'https://cards.barclaysus.com/menu/jetblue-plus/', source: 'api' },
  { card_id: 'barclays-aa-aviator-red', name: 'AAdvantage Aviator Red', issuer: 'Barclays', url: 'https://cards.barclaysus.com/menu/aa-aviator-red/', source: 'api' },

  // === BREX (API fallback) ===
  { card_id: 'brex', name: 'Brex', issuer: 'Brex', url: 'https://www.brex.com/', source: 'api' },
];

// Extract offer from scraped text
function extractOffer(text) {
  const t = text || '';
  const ptsMatch = t.match(/Earn\s+([\d,]+)\s+bonus\s+points/i)
    || t.match(/Earn\s+([\d,]+)\s+bonus\s+miles/i)
    || t.match(/Earn\s+([\d,]+)\s+bonus\s+membership\s+rewards/i)
    || t.match(/Earn\s+([\d,]+)\s+Membership\s+Rewards/i)
    || t.match(/Earn\s+([\d,]+)\s+points/i)
    || t.match(/([\d,]+)\s+bonus\s+points/i)
    || t.match(/([\d,]+)\s+bonus\s+miles/i);

  const cashMatch = t.match(/Earn\s+\$([\d,]+)\s+cash\s+back\s+bonus/i)
    || t.match(/Earn\s+\$?([\d,]+)\s+(?:cash\s+back\s+)?bonus/i)
    || t.match(/\$?([\d,]+)\s+bonus/i)
    || t.match(/bonus[\s\S]{0,30}\$([\d,]+)/i);

  const spendMatch = t.match(/spend\s+\$([\d,]+)/i)
    || t.match(/spending\s+\$([\d,]+)/i)
    || t.match(/after\s+\$([\d,]+)/i);

  const monthsMatch = t.match(/first\s+(\d+)\s+months?/i)
    || t.match(/within\s+(\d+)\s+months?/i);

  const pts = ptsMatch ? parseInt(ptsMatch[1].replace(/,/g, ''), 10) : null;
  const cash = (!ptsMatch && cashMatch) ? parseInt(cashMatch[1].replace(/,/g, ''), 10) : null;
  const spend = spendMatch ? parseInt(spendMatch[1].replace(/,/g, ''), 10) : null;
  const months = monthsMatch ? parseInt(monthsMatch[1], 10) : null;

  return { pts, cash, spend, months };
}

// Match free API card by name
function findFreeAPICard(cardName) {
  for (const [name, data] of Object.entries(FREE_API_CARDS)) {
    if (name.toLowerCase().includes(cardName.toLowerCase()) ||
        cardName.toLowerCase().includes(name.toLowerCase())) {
      return data;
    }
  }
  return null;
}

async function scrapePage(browser, card) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const bodyText = await page.evaluate(() => document.body.innerText);
    return { success: true, raw: bodyText.slice(0, 3000) };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`🚀 Phase 3 Scraper — ${CARDS.length} cards\n`);
  
  const scrapeCards = CARDS.filter(c => c.source === 'scrape');
  const apiCards = CARDS.filter(c => c.source === 'api');
  
  // Step 1: Scrape scrapable cards
  const browser = await chromium.launch({ headless: true });
  const scrapeResults = [];
  
  for (const card of scrapeCards) {
    process.stdout.write(`Scraping ${card.issuer} ${card.name}... `);
    const r = await scrapePage(browser, card);
    scrapeResults.push({ ...card, ...r });
    console.log(r.success ? '✅' : `❌ ${r.error?.slice(0,40)}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  await browser.close();

  // Step 2: Get API fallback for Amex/others
  const apiResults = [];
  for (const card of apiCards) {
    const apiData = findFreeAPICard(card.name);
    apiResults.push({ ...card, api: apiData, success: !!apiData });
  }

  // Step 3: Combine + diff
  const allResults = [
    ...scrapeResults.map(r => ({ ...r, offer: extractOffer(r.raw), source: 'scrape' })),
    ...apiResults.map(r => ({ 
      ...r, 
      offer: { pts: r.api?.pts || null, cash: null, spend: null, months: null },
      source: 'api' 
    })),
  ];

  // Step 4: Compare with local DB
  console.log('\n📊 Diff Results:\n');
  const report = [];
  
  for (const r of allResults) {
    const localCard = localDB[r.card_id];
    const curr = localCard?.welcome_offer?.bonus_points || 0;
    const ext = r.offer.pts || r.offer.cash || 0;
    const changed = ext > 0 && curr > 0 && Math.abs(ext - curr) / Math.max(curr, 1) > 0.10;
    
    report.push({
      card_id: r.card_id,
      name: r.name,
      issuer: r.issuer,
      source: r.source,
      status: r.success === false ? 'failed' : (changed ? 'changed' : 'unchanged'),
      current: curr,
      extracted: ext,
      pct: curr > 0 ? Math.round(Math.abs(ext - curr) / curr * 100) : 0,
      db_pts: curr,
      api_pts: ext,
    });
    
    if (!r.success) {
      console.log(`⏭️  ${r.name} (${r.source}): ${r.error || 'no api data'}`);
    } else if (changed) {
      console.log(`🔄 ${r.name}: ${curr.toLocaleString()} → ${ext.toLocaleString()} pts (${report[report.length-1].pct}%)`);
    } else {
      console.log(`✅ ${r.name}: ${ext.toLocaleString()} pts`);
    }
  }

  // Save
  writeFileSync('./data/scraper-results.json', JSON.stringify(allResults, null, 2));
  writeFileSync('./data/extract-results.json', JSON.stringify(report, null, 2));
  
  const changedCount = report.filter(r => r.status === 'changed').length;
  const failedCount = report.filter(r => r.status === 'failed').length;
  console.log(`\n💾 Saved — ${changedCount} changed, ${failedCount} failed, ${CARDS.length - changedCount - failedCount} unchanged`);
}

main().catch(console.error);
