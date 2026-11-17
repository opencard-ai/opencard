import test from 'node:test';
import assert from 'node:assert/strict';

process.env.URL_CHECK_NO_RUN = '1';
const load = async () => (await import('../scripts/audit/url-check.ts')).pickReferer as (u: string, o: string[]) => string;

const apply = 'https://www.americanexpress.com/us/credit-cards/card-application/apply/partner/print/personal-card/msb/morgan-stanley-platinum-card/ep-msb-mcs-58?print=false';

test('pickReferer prefers a same-issuer /card/ product page, skipping PDFs and other domains', async () => {
  const pickReferer = await load();
  const others = [
    'https://www.americanexpress.com/content/dam/amex/x.pdf',
    apply,
    'https://www.morganstanley.com/what-we-do/wealth-management/cashplus',
    'https://global.americanexpress.com/card-benefits/view-all/morgan-stanley-platinum-card',
    'https://www.americanexpress.com/us/credit-cards/card/platinum/',
  ];
  assert.equal(pickReferer(apply, others), 'https://www.americanexpress.com/us/credit-cards/card/platinum/');
});

test('pickReferer falls back to the host root', async () => {
  const pickReferer = await load();
  assert.equal(pickReferer('https://apply.americanexpress.com/x', ['https://www.nerdwallet.com/a']), 'https://apply.americanexpress.com/');
});
