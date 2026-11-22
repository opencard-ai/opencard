import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import CardDetailPage from "../app/[lang]/cards/[card_id]/page";
import LanguageSwitcher from "../app/components/LanguageSwitcher";
import FTCDisclosure from "../app/components/FTCDisclosure";
import CardGrid from "../app/components/CardGrid";
import CardRow from "../app/components/CardRow";
import CompareTable from "../app/components/CompareTable";
import { getAllCards, isClosedToNewApplicants } from "../lib/cards";
import { getCardEditorial } from "../lib/card-editorial";
import { getReferralOfferForCard } from "../lib/referrals";
import { readFileSync } from "node:fs";

const cards = getAllCards();
const card = cards.find(c => c.card_id === "chase-sapphire-preferred")!;
function render(element: React.ReactNode, lang = "en") {
  return parse(renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as any },
    createElement(PathnameContext.Provider, { value: `/${lang}` },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, element)))));
}

test("card detail preserves disclosed offers in all locales and English-only suitability", async () => {
  for (const lang of ["en", "zh", "zh-cn", "es"]) {
    const page = render(await CardDetailPage({ params: Promise.resolve({ lang, card_id: card.card_id }) }), lang);
    const html = page.toString();
    const referral = page.querySelector('[data-issuer-outbound="referral"]')!;
    assert.equal(referral.getAttribute("href"), getReferralOfferForCard(card)!.referralUrl);
    assert.equal(referral.getAttribute("rel"), "sponsored nofollow noopener noreferrer");
    const suitability = page.querySelectorAll('[data-card-section="suitability"]');
    if (lang === "en") {
      assert.ok(html.indexOf('id="card-referral-disclosure"') < html.indexOf('data-card-section="suitability"'));
      assert.ok(html.indexOf('data-card-section="suitability"') < html.indexOf('data-card-section="rewards"'));
      assert.equal(suitability.length, 1);
      assert.deepEqual(suitability[0].querySelectorAll('li').map(li => li.textContent.slice(2)),
        [...getCardEditorial(card.card_id)!.bestFor, ...getCardEditorial(card.card_id)!.notFor]);
      assert.equal(page.querySelectorAll('h3').filter(h => h.textContent === "Best for").length, 1);
      assert.equal(page.querySelector('#card-referral-disclosure p')!.textContent,
        "The Chase referral page currently lists Sapphire Preferred and the personal Sapphire Reserve. Confirm current offers and eligibility on Chase. The referrer may receive a reward if you are approved; this does not influence OpenCard's evaluation.");
    } else {
      assert.equal(suitability.length, 0);
      assert.doesNotMatch(page.textContent, /Best for|Not ideal for/);
      const editorial = getCardEditorial(card.card_id)!;
      for (const text of [editorial.take, ...editorial.bestFor, ...editorial.notFor]) {
        assert.ok(!page.textContent.includes(text), `${lang} must hide English editorial`);
      }
    }
    assert.doesNotMatch(page.textContent, /Who it's for|Who should skip it/);
    const sticky = page.querySelector('[data-mobile-card-cta]')!;
    assert.match(sticky.classNames, /sm:hidden/);
    assert.equal(sticky.querySelector('a')!.getAttribute('href'), '#card-referral-disclosure');
    assert.ok(page.querySelector('#card-referral-disclosure p')!.textContent.length > 0);
    assert.match(sticky.classNames, /safe-area-inset-bottom/);
  }
});

test("closed cards keep the application gate and have no sticky offer", async () => {
  const closed = cards.find(c => c.status === "discontinued")!;
  const page = render(await CardDetailPage({ params: Promise.resolve({ lang: "en", card_id: closed.card_id }) }));
  assert.equal(page.querySelector('[data-mobile-card-cta]'), null);
  assert.equal(page.querySelector('[data-issuer-outbound="referral"]'), null);
});

test("language and homepage filter selects have localized accessible names", () => {
  for (const lang of ["en", "zh", "zh-cn", "es"]) {
    const select = render(createElement(LanguageSwitcher), lang).querySelector('select')!;
    assert.ok(select.getAttribute('aria-label'));
    const grid = render(createElement(CardGrid, { cards: [card], issuers: [card.issuer], tags: card.tags, locale: lang }), lang);
    for (const select of grid.querySelectorAll('select')) assert.ok(select.getAttribute('aria-label'));
  }
});

test("footer links have 44px targets and comparison is visible on collapsed card rows", () => {
  const footer = render(createElement(FTCDisclosure, { locale: "en" }));
  assert.ok(footer.querySelectorAll('a').length > 0);
  for (const link of footer.querySelectorAll('a')) assert.match(link.classNames, /min-h-11/);
  const row = render(createElement(CardRow, { card, lang: "en", locale: "en", isCompared: false, isMaxed: false, onToggleCompare() {} }));
  const compare = row.querySelector('button[aria-pressed="false"]')!;
  assert.match(compare.textContent, /Compare/);
  assert.match(compare.classNames, /min-h-11/);
  assert.equal(compare.closest('[role="button"]'), null);
  assert.match(compare.parentNode.classNames, /sm:hidden/);
});

test("mobile comparison preserves both card columns and small copy uses stronger contrast", () => {
  const page = render(createElement(CompareTable, { cards: cards.slice(0, 2), lang: "en" }));
  const hint = page.querySelector('.sm\\:block')!;
  assert.ok(hint);
  assert.match(hint.classNames, /hidden sm:block md:hidden/);
  const table = page.querySelector('table.mobile-compare-table')!;
  assert.match(table.getAttribute('style')!, /--compare-count:2/);
  assert.equal(table.querySelectorAll('thead th').length, 3);
  assert.ok(page.querySelectorAll('.text-slate-500').length > 0);
  assert.equal(page.querySelectorAll('.text-slate-400').length, 0);
  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(css, /repeat\(var\(--compare-count\), minmax\(0, 1fr\)\)/);
});


test("empty suitability columns and wholly empty sections are omitted", async () => {
  const editorial = getCardEditorial(card.card_id)!;
  const original = { bestFor: editorial.bestFor, notFor: editorial.notFor };
  try {
    for (const [bestFor, notFor] of [[original.bestFor, []], [[], original.notFor], [[], []]]) {
      editorial.bestFor = bestFor;
      editorial.notFor = notFor;
      const page = render(await CardDetailPage({ params: Promise.resolve({ lang: "en", card_id: card.card_id }) }));
      const section = page.querySelector('[data-card-section="suitability"]');
      if (!bestFor.length && !notFor.length) {
        assert.equal(section, null);
      } else {
        assert.ok(section);
        assert.deepEqual(section.querySelectorAll('h3').map(h => h.textContent),
          bestFor.length ? ["Best for"] : ["Not ideal for"]);
        assert.equal(section.querySelectorAll('ul').length, 1);
        assert.ok(section.querySelectorAll('li').length > 0);
      }
    }
  } finally {
    Object.assign(editorial, original);
  }
});

test("sticky referral destination retains the full disclosure and terms link", async () => {
  const amex = cards.find(c => getReferralOfferForCard(c)?.program === "amex")!;
  assert.ok(amex);
  const offer = getReferralOfferForCard(amex)!;
  const page = render(await CardDetailPage({ params: Promise.resolve({ lang: "en", card_id: amex.card_id }) }));
  const target = page.querySelector(page.querySelector('[data-mobile-card-cta] a')!.getAttribute('href')!)!;
  assert.equal(target.querySelector('p')!.textContent,
    "The link opens on the Platinum Card first. Use the Amex page to view currently eligible personal and business cards. Not every Amex product is necessarily included, and offers and eligibility may vary. The referrer may receive a reward if you are approved; this does not influence OpenCard's evaluation.");
  const terms = target.querySelector('[data-issuer-outbound="terms"]')!;
  assert.ok(offer.termsUrl);
  assert.equal(terms.getAttribute('href'), offer.termsUrl);
  assert.equal(terms.getAttribute('rel'), 'noopener noreferrer nofollow');
  assert.equal(terms.textContent, 'Full referral terms');
  assert.equal(target.querySelector('[data-issuer-outbound="referral"]')!.getAttribute('href'), offer.referralUrl);
});

test("issuer-only sticky CTA reaches official terms and affiliate links remain dormant", async () => {
  // Public card data deliberately has no affiliate URLs; do not enable the dormant path.
  assert.ok(cards.every(c => !c.affiliate_url));
  const issuerOnly = cards.find(c => !isClosedToNewApplicants(c) && !getReferralOfferForCard(c) &&
    c.sources?.some(source => source.url.startsWith("https://www.citi.com/")))!;
  assert.ok(issuerOnly);
  const page = render(await CardDetailPage({ params: Promise.resolve({ lang: "en", card_id: issuerOnly.card_id }) }));
  assert.equal(page.querySelector('[data-mobile-card-cta] a')!.getAttribute('href'), '#card-official-terms');
  const terms = page.querySelector('#card-official-terms')!;
  assert.ok(issuerOnly.sources!.some(source => source.url === terms.getAttribute('href')));
  assert.equal(terms.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(page.querySelector('#card-apply-disclosure'), null);
  assert.equal(page.querySelector('[data-affiliate-link]'), null);
});
