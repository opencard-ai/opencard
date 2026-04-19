const { chromium } = require('playwright');
const CARDS = [
  { name: 'Chase Sapphire Preferred', url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred' },
  { name: 'Chase Sapphire Reserve', url: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve' },
  { name: 'Capital One Venture X', url: 'https://www.capitalone.com/credit-cards/venture-x/' },
  { name: 'Citi Custom Cash', url: 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card' },
  { name: 'Chase Freedom Unlimited', url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited' },
  { name: 'Discover it', url: 'https://www.discover.com/credit-cards/cash-back/' },
  { name: 'Wells Fargo Autograph', url: 'https://creditcards.wellsfargo.com/autograph-visa-credit-card' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const start = Date.now();
  for (const c of CARDS) {
    const t0 = Date.now();
    const page = await browser.newPage();
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const ms = Date.now() - t0;
    console.log(ms + 'ms', c.name);
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
  await browser.close();
  console.log('Total:', Date.now() - start + 'ms', '(7 cards)');
}
run().catch(console.error);
