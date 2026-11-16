import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import ComparePage from "../app/[lang]/compare/page";
import { getAllCards } from "../lib/cards";
import { type CardsParam } from "../lib/compare-suggestions";

const cards = getAllCards();
const preferred = "chase-sapphire-preferred";
const reserve = "chase-sapphire-reserve";

async function render(lang: string, value?: CardsParam) {
  return parse(renderToStaticMarkup(await ComparePage({
    params: Promise.resolve({ lang }), searchParams: Promise.resolve({ cards: value }),
  })));
}

test("empty, invalid and single-card pages have working localized routes and valid card links", async () => {
  for (const lang of ["en", "zh", "zh-cn", "es"]) {
    for (const value of [undefined, "typo", preferred, `${preferred},typo`, [preferred, "typo"]]) {
      const page = await render(lang, value);
      assert.equal(page.querySelectorAll("h1").length, 1);
      assert.equal(page.querySelector("table"), null);
      const links = page.querySelectorAll("a");
      assert.ok(links.length >= 4);
      for (const link of links) {
        const url = new URL(link.getAttribute("href")!, "https://example.invalid");
        assert.ok(url.pathname.startsWith(`/${lang}`));
        const route = url.pathname.split("/").slice(2);
        if (route[0] === "cards") {
          assert.ok(cards.some(card => card.card_id === route[1]), url.pathname);
          route[1] = "[card_id]";
        }
        assert.ok(existsSync(["app/[lang]", ...route, "page.tsx"].join("/")), url.pathname);
        if (route[0] === "compare") {
          const ids = url.searchParams.get("cards")!.split(",");
          assert.equal(new Set(ids).size, 2);
          assert.ok(ids.every(id => cards.some(card => card.card_id === id)));
          if (value?.includes(preferred)) assert.ok(ids.includes(preferred));
        }
      }
      assert.ok(page.querySelector(`a[href="/${lang}#cards-section"]`));
      assert.ok(page.querySelector(`a[href="/${lang}/${value?.includes(preferred) ? `cards/${preferred}` : "find"}"]`));
    }
  }
});

test("invalid IDs show a notice alongside zero, one or two valid cards", async () => {
  for (const value of ["typo", `${preferred},typo`, `${preferred},${reserve},typo`, [preferred, "typo"]]) {
    assert.match((await render("en", value)).textContent, /couldn’t find some requested cards/);
  }
  for (const value of [undefined, preferred, `${preferred},${preferred}`, `${preferred},${reserve}`]) {
    assert.doesNotMatch((await render("en", value)).textContent, /couldn’t find/);
  }
  const alias = "us-bank-altitude-connect-biz,us-bank-biz-altitude-connect";
  assert.doesNotMatch((await render("en", alias)).textContent, /couldn’t find/);
});

test("single-card suggestions use a dedicated localized section label and consistent punctuation", async () => {
  const labels = { en: "Suggested comparisons", zh: "建議比較", "zh-cn": "建议比较", es: "Comparaciones sugeridas" };
  for (const [lang, label] of Object.entries(labels)) {
    const page = await render(lang, preferred);
    assert.equal(page.querySelector("section")?.getAttribute("aria-label"), label);
    assert.notEqual(label, page.querySelector("h1")?.textContent);
    assert.match(page.querySelector("p")!.textContent, /[:：] /);
    assert.equal((await render(lang)).querySelector("section")?.getAttribute("aria-label"), (await render(lang)).querySelector("h2")?.textContent);
  }
});
