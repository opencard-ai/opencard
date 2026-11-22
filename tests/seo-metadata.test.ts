import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import type { Metadata } from "next";
import { locales, t } from "../lib/i18n";
import { getGuide, hasLocalizedGuide } from "../lib/guides";
import { getCompareMetadata } from "../lib/compare-suggestions";
import { getAllCards } from "../lib/cards";
import { pageMetadata } from "../lib/seo";

const routes = ["about", "contact", "methodology", "find", "elevated-offers", "developers", "benefit-expiration-tracker", "privacy", "terms", "guides", "stay", "stay/saved", "stay/how-we-rank"];
async function metadata(route: string, lang: string, extra: Record<string, string> = {}): Promise<Metadata> {
  const file = route === "my-cards" ? "layout" : "page";
  const page = await import(`../app/[lang]/${route}/${file}.tsx`);
  return page.generateMetadata({ params: Promise.resolve({ lang, ...extra }) });
}
function checkSocial(meta: Metadata, lang: string, path: string) {
  assert.ok(meta.title);
  assert.ok(meta.description);
  const social = meta.openGraph!;
  const twitter = meta.twitter!;
  const title = typeof meta.title === "string" ? meta.title : (meta.title as { absolute: string }).absolute;
  assert.equal(social.title, title);
  assert.equal(social.description, meta.description);
  assert.equal("url" in social && social.url, `/${lang}${path}`);
  assert.equal(twitter.title, title);
  assert.equal(twitter.description, meta.description);
  assert.match(JSON.stringify(social.images), /opencardai.com\/og-image.png/);
  assert.match(JSON.stringify(twitter.images), /opencardai.com\/og-image.png/);
  assert.notEqual(title, t("site.metaTitle", lang as typeof locales[number]));
  assert.notEqual(meta.description, t("site.metaDescription", lang as typeof locales[number]));
}

test("static non-home metadata has localized snippets and complete route-specific social fields", async () => {
  for (const route of routes) {
    for (const lang of locales) {
      const meta = await metadata(route, lang);
      checkSocial(meta, lang, `/${route}`);
      if (lang === "zh" || lang === "zh-cn") {
        assert.match(meta.description!, /[\u3400-\u9fff]/, `${lang}/${route}`);
        assert.match(String(meta.title), /[\u3400-\u9fff]/, `${lang}/${route}`);
        assert.notEqual(meta.description, (await metadata(route, "en")).description);
      }
    }
  }
});

test("My Cards server boundary has unique localized metadata, noindex/nofollow and alternates", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const lang of locales) {
    const meta = await metadata("my-cards", lang);
    checkSocial(meta, lang, "/my-cards");
    assert.deepEqual(meta.robots, { index: false, follow: false });
    assert.equal(meta.alternates?.canonical, `/${lang}/my-cards`);
    assert.deepEqual(meta.alternates?.languages, { en: "/en/my-cards", "zh-Hant": "/zh/my-cards", "zh-Hans": "/zh-cn/my-cards", es: "/es/my-cards", "x-default": "/en/my-cards" });
    titles.add(meta.title); descriptions.add(meta.description);
  }
  assert.equal(titles.size, 4); assert.equal(descriptions.size, 4);
  assert.match(readFileSync("app/[lang]/my-cards/page.tsx", "utf8"), /^"use client"/);
  assert.doesNotMatch(readFileSync("app/[lang]/my-cards/layout.tsx", "utf8"), /use client/);
});

test("guides, cards, categories and hotel routes supply their own social metadata and preserve robots", async () => {
  for (const lang of locales) {
    for (const [route, extra, path] of [
      ["guides/[slug]", { slug: "credit-card-application-sequencing" }, "/guides/credit-card-application-sequencing"],
      ["cards/[card_id]", { card_id: "chase-sapphire-preferred" }, "/cards/chase-sapphire-preferred"],
      ["stay/hotel/[slug]", { slug: "bellagio-las-vegas" }, "/stay/hotel/bellagio-las-vegas"],
      ["stay/hotel/[slug]", { slug: "missing-hotel" }, "/stay/hotel/missing-hotel"],
    ] as const) {
      const meta = await metadata(route, lang, extra);
      checkSocial(meta, lang, path);
      if (route === "cards/[card_id]") {
        assert.deepEqual(meta.robots, { index: lang === "en", follow: true });
        assert.deepEqual(meta.alternates?.languages, { en: "/en/cards/chase-sapphire-preferred", "x-default": "/en/cards/chase-sapphire-preferred" });
      }
      if (route === "guides/[slug]") {
        assert.equal(meta.openGraph && "type" in meta.openGraph && meta.openGraph.type, "article");
        assert.ok(meta.openGraph && "publishedTime" in meta.openGraph && meta.openGraph.publishedTime);
      }
    }
    const compare = getCompareMetadata(lang, "chase-sapphire-preferred,chase-sapphire-reserve", getAllCards());
    checkSocial(compare, lang, "/compare?cards=chase-sapphire-preferred,chase-sapphire-reserve");
    if (lang === "en" || lang === "zh") {
      checkSocial(await metadata("best", lang), lang, "/best");
      checkSocial(await metadata("best/[slug]", lang, { slug: "business-credit-cards" }), lang, "/best/business-credit-cards");
    }
  }
  const future = pageMetadata("en", "/future", { title: "Future page", description: "Future description" });
  checkSocial(future, "en", "/future");
});

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? mdxFiles(`${dir}/${entry.name}`) : entry.name.endsWith(".mdx") ? [`${dir}/${entry.name}`] : []);
}
test("literal localized guide links resolve to registered guides and existing localized bodies", () => {
  let count = 0;
  for (const file of mdxFiles("content/guides")) {
    for (const match of readFileSync(file, "utf8").matchAll(/\/(en|zh|zh-cn|es)\/guides\/([a-z0-9-]+)/g)) {
      const [, lang, slug] = match;
      const guide = getGuide(slug);
      assert.ok(guide, `${file}: ${match[0]}`);
      assert.ok(hasLocalizedGuide(guide, lang), `${file}: ${match[0]}`);
      assert.ok(existsSync(`content/guides/${lang === "en" ? "" : `${lang}/`}${slug}.mdx`));
      count++;
    }
  }
  assert.ok(count >= 188);
});

test("all eight former 404 links retain explicit English labels and valid English targets", () => {
  for (const lang of ["zh", "zh-cn", "es"]) {
    const files = lang === "zh-cn" ? ["credit-card-application-sequencing"] : ["credit-card-application-sequencing", "transfer-credit-card-points-guide"];
    for (const slug of files) {
      const text = readFileSync(`content/guides/${lang}/${slug}.mdx`, "utf8");
      const targets = slug === "credit-card-application-sequencing" ? ["chase-5-24-rule", "welcome-offer-strategy"] : ["transferable-points-101"];
      for (const target of targets) {
        const label = text.match(new RegExp(`\\[([^\\]]+)\\]\\(/en/guides/${target}\\)`))?.[1];
        assert.ok(label, `${lang}/${slug}: ${target}`);
        assert.match(label, lang === "es" ? /en inglés/ : /英文/);
        assert.ok(getGuide(target));
        assert.ok(existsSync(`content/guides/${target}.mdx`));
        assert.ok(!text.includes(`/${lang}/guides/${target}`));
      }
    }
  }
});
