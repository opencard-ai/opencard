/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true, channel:"chrome"});
 const context = await browser.newContext();
 await context.route('**/_vercel/insights/**', route => route.fulfill({body:'', contentType:'application/javascript'}));
 await context.route('**/script*.js', route => route.fulfill({body:'', contentType:'application/javascript'}));
 await context.addInitScript(() => { window.__events=[]; window.va=(kind,data)=>{if(kind==='event')window.__events.push(data.name)}; });
 await context.route('**/pagead/**', route => route.fulfill({body:'', contentType:'application/javascript'}));
 const page = await context.newPage();
 await page.goto('http://localhost:3011/en/find');
 await page.getByRole('button',{name:'Cash back / everyday',exact:true}).click();
 await page.getByRole('button',{name:'Up to $99',exact:true}).click();
 await page.getByRole('button',{name:'Excellent (760+)',exact:true}).click();
 await page.getByText('Top picks for you',{exact:true}).waitFor();
 if ((await page.evaluate(()=>window.__events)).length) throw Error('Events before consent');
 console.log('PASS no custom events before consent; wizard completes');
 await page.evaluate(()=>{ localStorage.setItem('opencard_cookie_consent','accepted');window.dispatchEvent(new Event('opencard-cookie-consent')); });
 await page.getByRole('button',{name:'Start over',exact:true}).click();
 await page.getByRole('button',{name:'Cash back / everyday',exact:true}).click();
 await page.getByRole('button',{name:'Up to $99',exact:true}).click();
 await page.getByRole('button',{name:'Excellent (760+)',exact:true}).click();
 await page.getByText('Top picks for you',{exact:true}).waitFor();
 await page.waitForTimeout(300); const events=await page.evaluate(()=>window.__events); if(!events.includes('selection_started') || !events.includes('recommendation_completed')) throw Error('Missing consented events '+JSON.stringify(events)); console.log('PASS consented wizard events', events);
 const rows = page.locator('div[role="button"]');
 await rows.nth(0).click();
 await page.getByRole('button',{name:'Compare',exact:true}).click();
 await rows.nth(1).click();
 await page.getByRole('button',{name:'Compare',exact:true}).click();
 await page.getByRole('link',{name:/Compare Now/}).click();
 await page.waitForURL('**/compare?cards=*');
 console.log('PASS wizard comparison navigation', new URL(page.url()).pathname);
 await page.waitForTimeout(100); const comparisonEvents = await page.evaluate(()=>window.__events); if(!comparisonEvents.includes('comparison_viewed')) throw Error('Missing comparison event'); console.log('PASS comparison viewed event');
 for (const lang of ['en','zh','zh-cn','es']) { await page.goto('http://localhost:3011/'+lang); if(await page.locator('a[href="/'+lang+'/find"]').count()<1 || await page.locator('a[href="/'+lang+'/my-cards"]').count()<1) throw Error('Missing localized journey '+lang); }
 await page.goto('http://localhost:3011/en/cards/chase-sapphire-preferred');
 await page.locator('a[data-issuer-outbound="official_terms"]').waitFor();
 console.log('PASS localized journeys and issuer terms CTA');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
