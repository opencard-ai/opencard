import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import CookieConsentBanner from "../app/components/CookieConsentBanner";

const source = (path: string) => readFileSync(path, "utf8");
const banner = source("app/components/CookieConsentBanner.tsx");

test("consent storage, event, server rendering, and choice actions stay compatible", () => {
  assert.match(banner, /const CONSENT_KEY = "opencard_cookie_consent"/);
  assert.match(banner, /type ConsentValue = "accepted" \| "rejected" \| "managed"/);
  assert.match(banner, /localStorage\.setItem\(CONSENT_KEY, value\)/);
  assert.match(banner, /new CustomEvent\("opencard-cookie-consent", \{ detail: value \}\)/);
  for (const event of ["opencard-cookie-consent", "storage"]) {
    assert.ok(banner.includes(`addEventListener("${event}", callback)`));
    assert.ok(banner.includes(`removeEventListener("${event}", callback)`));
  }
  assert.match(banner, /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/);
  assert.match(banner, /function getServerSnapshot\(\)\s*\{\s*return null;/);
  assert.match(banner, /onClick=\{\(\) => saveConsent\("rejected"\)\}/);
  assert.match(banner, /manageOpen \? saveConsent\("managed"\) : setManageOpen\(true\)/);
  assert.match(banner, /manageOpen \? t.save : t.manage/);
  assert.match(banner, /onClick=\{\(\) => saveConsent\("accepted"\)\}/);
  assert.match(source("app/globals.css"), /html\.oc-consent-set \[data-cookie-banner\]\s*\{\s*display: none;/);
  assert.match(source("app/[lang]/layout.tsx"), /localStorage\.getItem\("opencard_cookie_consent"\)\)document\.documentElement\.classList\.add\("oc-consent-set"\)/);
});

test("every locale keeps reject, manage, accept, save, and privacy copy", () => {
  const file = ts.createSourceFile("banner.tsx", banner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let copy: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "copy" && node.initializer && ts.isAsExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.expression)) {
      copy = node.initializer.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(copy);
  const expected = {
    en: ["Reject optional", "Manage", "Accept all", "Save preferences", "Privacy Policy"],
    zh: ["拒絕選用", "管理偏好", "接受全部", "儲存偏好", "隱私權政策"],
    "zh-cn": ["拒绝可选", "管理偏好", "接受全部", "保存偏好", "隐私政策"],
    es: ["Rechazar opcionales", "Gestionar", "Aceptar todo", "Guardar preferencias", "Política de Privacidad"],
  };
  assert.equal(copy.properties.length, 4);
  for (const [locale, labels] of Object.entries(expected)) {
    const entry: ts.ObjectLiteralElementLike | undefined = copy.properties.find((property) => property.name && (ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file)) === locale);
    assert.ok(entry && ts.isPropertyAssignment(entry) && ts.isObjectLiteralExpression(entry.initializer), locale);
    const fields: Record<string, string> = Object.fromEntries(entry.initializer.properties.map((property) => {
      assert.ok(ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer));
      return [property.name.getText(file), property.initializer.text];
    }));
    assert.deepEqual([fields.reject, fields.manage, fields.accept, fields.save, fields.privacy], labels, locale);
    assert.ok(fields.title && fields.essential && fields.body && fields.optional, locale);
  }
});

test("analytics and advertising still require accepted consent", () => {
  const analytics = source("app/components/Analytics.tsx");
  const ads = source("app/components/AdSenseScript.tsx");
  assert.match(analytics, /if \(consent === "accepted" && !injected\.current\)\s*\{\s*inject\(/);
  assert.match(analytics, /beforeSend: event => hasAnalyticsConsent\(\) \? event : null/);
  assert.match(ads, /if \(consent !== "accepted" \|\| !isHighValueRoute\) return null;/);
  assert.ok(ads.indexOf('consent !== "accepted"') < ads.indexOf("<Script"));
  assert.match(source("lib/analytics.ts"), /localStorage\.getItem\("opencard_cookie_consent"\) === "accepted"/);
});

test("server HTML exposes labelled cookie choices, purposes, buttons, and localized privacy", () => {
  const locales = {
    en: {
      title: "Cookie choices",
      essential: "We use essential cookies to run the site.",
      body: "With your consent, we also use analytics, ad and affiliate cookies to improve the site and fund free guides.",
    },
    es: {
      title: "Preferencias de cookies",
      essential: "Usamos cookies esenciales para el sitio.",
      body: "Con su consentimiento, también usamos cookies de analítica, publicidad y afiliados para mejorar el sitio y financiar guías gratuitas.",
    },
  };
  for (const [lang, copy] of Object.entries(locales)) {
    const page = parse(renderToStaticMarkup(createElement(CookieConsentBanner, { lang })));
    const section = page.querySelector("section[data-cookie-banner]");
    assert.ok(section, lang);
    assert.equal(section.getAttribute("aria-labelledby"), "cookie-choices-title");
    const heading = section.querySelector("h2#cookie-choices-title.sr-only");
    assert.equal(heading?.textContent, copy.title, lang);
    assert.equal(section.querySelectorAll("button").length, 3, lang);
    assert.equal(section.querySelectorAll('button[type="button"]').length, 3, lang);
    assert.ok(section.querySelector(`a[href="/${lang}/privacy"]`), lang);
    const paragraphs = section.querySelectorAll("p");
    assert.deepEqual(paragraphs.map(p => p.textContent), [copy.essential, copy.body], lang);
  }
});

test("consent layout reserves space and offsets controls before and after hydration", () => {
  const css = source("app/globals.css");
  for (const selector of [
    "html:not(.oc-consent-set) body:has([data-cookie-banner])",
    "html.oc-consent-open body",
  ]) {
    assert.ok(css.includes(`${selector} {\n  padding-bottom: var(--oc-consent-height, 120px);`), selector);
  }
  for (const prefix of [
    "html:not(.oc-consent-set) body:has([data-cookie-banner])",
    "html.oc-consent-open",
  ]) {
    for (const [target, gap] of [["data-floating-buttons", "1.5rem"], ["data-toast-viewport", "1rem"]]) {
      assert.ok(css.includes(`${prefix} [${target}] {\n  bottom: calc(var(--oc-consent-height, 120px) + ${gap});`), `${prefix} ${target}`);
    }
  }
  assert.match(source("app/components/ToastViewport.tsx"), /data-toast-viewport=""/);
});
