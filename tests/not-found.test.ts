import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { locales, t } from "../lib/i18n";
import { getNotFoundLinks, getNotFoundLocale, notFoundCopy } from "../lib/not-found";

test("404 copy and recovery links cover every supported locale", () => {
  assert.deepEqual(Object.keys(notFoundCopy).sort(), [...locales].sort());
  for (const locale of locales) {
    const copy = notFoundCopy[locale];
    assert.equal(copy.myCards, t("home.heroMyCards", locale));
    for (const value of Object.values(copy)) assert.ok(value.trim(), locale);
    if (locale !== "en") {
      assert.notEqual(copy.heading, notFoundCopy.en.heading);
      assert.notEqual(copy.description, notFoundCopy.en.description);
    }
    const links = getNotFoundLinks(locale);
    assert.deepEqual(links.map(({ href }) => href), [
      `/${locale}/find`, `/${locale}`, `/${locale}#cards-section`,
      `/${locale}/guides`, `/${locale}/my-cards`,
    ]);
    for (const { href, label } of links) {
      assert.ok(label.trim());
      const route = href.split("#")[0].replace(`/${locale}`, "app/[lang]");
      assert.ok(fs.existsSync(`${route}/page.tsx`), href);
    }
  }
  assert.match(fs.readFileSync("app/components/CardGrid.tsx", "utf8"), /id="cards-section"/);
});

test("404 locale follows the URL and defaults safely to English", () => {
  for (const locale of locales) {
    for (const suffix of ["/missing", "/cards/missing", "/guides/missing", "/missing.html"]) {
      assert.equal(getNotFoundLocale(`/${locale}${suffix}`), locale);
    }
  }
  for (const pathname of ["/", "/unsupported/missing", "/zh-cn-invalid/missing"]) {
    assert.equal(getNotFoundLocale(pathname), "en");
  }
});
