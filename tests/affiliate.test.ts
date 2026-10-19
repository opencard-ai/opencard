import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { affiliateLinksEnabled, getAffiliateUrl, isValidAffiliateUrl } from "../lib/affiliate";
import { locales, t } from "../lib/i18n";
import AffiliateLink from "../app/components/AffiliateLink";
import AffiliateDisclosure from "../app/components/AffiliateDisclosure";

// Flag: default OFF; only the exact string "true" enables.
assert.equal(affiliateLinksEnabled(undefined), false);
for (const v of ["", "1", "TRUE", "yes", "false"]) assert.equal(affiliateLinksEnabled(v), false, v);
assert.equal(affiliateLinksEnabled("true"), true);
assert.equal(affiliateLinksEnabled(), process.env.NEXT_PUBLIC_AFFILIATE_LINKS_ENABLED === "true");

// URL validation.
assert.equal(isValidAffiliateUrl("https://partner.example.com/apply?id=1"), true);
for (const bad of [undefined, null, 1, "", "http://x.com", "javascript:alert(1)", "/relative", " https://x.com", "https://u:p@x.com", "not a url"]) {
  assert.equal(isValidAffiliateUrl(bad), false, String(bad));
}

// getAffiliateUrl stays dormant unless flag on AND valid URL.
const url = "https://partner.example.com/apply";
assert.equal(getAffiliateUrl({ affiliate_url: url }, false), null);
assert.equal(getAffiliateUrl({}, true), null);
assert.equal(getAffiliateUrl({ affiliate_url: "http://insecure.example.com" }, true), null);
assert.equal(getAffiliateUrl({ affiliate_url: url }, true), url);

// Disclosure: present and mentions commission in every locale.
const commission: Record<string, RegExp> = { en: /commission/i, es: /comisión/i, zh: /佣金/, "zh-cn": /佣金/ };
for (const lang of locales) {
  const text = t("affiliate.disclosure", lang);
  assert.notEqual(text, "affiliate.disclosure", `missing key for ${lang}`);
  assert.match(text, commission[lang], lang);
  if (lang !== "en") assert.notEqual(text, t("affiliate.disclosure", "en"), `${lang} not translated`);
  assert.match(renderToStaticMarkup(createElement(AffiliateDisclosure, { lang })), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

// Component: null href renders nothing; otherwise sponsored link + adjacent disclosure.
const props = { cardId: "example", placement: "test", lang: "en" as const, children: "Apply" };
assert.equal(renderToStaticMarkup(createElement(AffiliateLink, { ...props, href: null })), "");
const html = renderToStaticMarkup(createElement(AffiliateLink, { ...props, href: url }));
assert.match(html, /rel="sponsored nofollow noopener noreferrer"/);
assert.match(html, /<\/a><span data-affiliate-disclosure="[^"]*"[^>]*>Ad: we may earn a commission/);

// Dormant guard: no card record may ship an affiliate_url yet.
const dir = path.join(process.cwd(), "data/cards");
const withUrl = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  .filter((f) => { try { return "affiliate_url" in JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return false; } });
assert.deepEqual(withUrl, [], "affiliate links must stay dormant (Vercel Hobby): no card may set affiliate_url");

console.log("PASS affiliate flag, URL validation, 4-locale disclosure, component, dormant data");
