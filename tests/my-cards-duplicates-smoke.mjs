// Run against a local production server: BASE_URL=http://localhost:3012 node tests/my-cards-duplicates-smoke.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

(async () => {
  const base = process.env.BASE_URL || 'http://localhost:3012';
  assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local server required');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      // No external calls, subscription requests, or store writes in this smoke test.
      if (url.origin !== new URL(base).origin || request.method() !== 'GET') return request.abort();
      request.continue();
    });
    const product = 'amex-hilton-honors-aspire';
    const storage = 'opencard_existing_cards';
    await page.goto(`${base}/en/cards/${product}`, {waitUntil: 'networkidle0'});
    const clickText = async text => {
      const button = await page.waitForSelector(`::-p-text(${text})`);
      await button.click();
    };
    await clickText('Add to My Cards');
    await clickText('Add another copy');
    await page.goto(`${base}/en/my-cards`, {waitUntil: 'networkidle0'});
    const expectCopies = async () => {
      await page.waitForSelector('::-p-text(Card #1)');
      await page.waitForSelector('::-p-text(Card #2)');
      const rows = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storage);
      assert.equal(rows.length, 2);
      assert.equal(new Set(rows.map(row => row.instance_id)).size, 2);
      return rows;
    };
    await expectCopies();
    await page.reload({waitUntil: 'networkidle0'});
    await expectCopies();
    await page.evaluate((key, id) => localStorage.setItem(key, JSON.stringify([
      {card_id: id, nickname: 'first copy', open_date: '2020-04', created_at: 1},
      {card_id: id, extra: 'drop me', last4: '5678'},
    ])), storage, product);
    await page.reload({waitUntil: 'networkidle0'});
    await page.waitForSelector('::-p-text(•••• 5678)');
    const migrated = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storage);
    assert.equal(migrated.length, 2);
    assert.equal(new Set(migrated.map(row => row.instance_id)).size, 2);
    assert.equal(migrated[0].nickname, 'first copy');
    assert.equal(migrated[0].open_date, '2020-04');
    assert.equal(migrated[0].created_at, 1);
    assert.equal(Object.hasOwn(migrated[1], 'extra'), false);
    await page.reload({waitUntil: 'networkidle0'});
    await page.waitForSelector('::-p-text(•••• 5678)');
    // Remove only the second rendered copy.
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('span')].find(el => el.textContent === '•••• 5678');
      const header = label.parentElement.parentElement.parentElement.parentElement;
      [...header.querySelectorAll('button')].find(el => el.textContent.includes('Remove card')).click();
    });
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).length === 1, {}, storage);
    const remaining = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storage);
    assert.equal(remaining[0].nickname, 'first copy');
    console.log('PASS: two Aspire copies survive add/reload, metadata migrates, removal isolates one copy');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
