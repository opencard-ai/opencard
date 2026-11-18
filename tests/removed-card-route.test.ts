import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/removed-card/route";
import { locales } from "../lib/i18n";
import { removedCardCopy } from "../lib/removed-card-copy";
import { removedCards } from "../lib/removed-cards";
import { getCardById } from "../lib/cards";

const origin = "http://localhost:3410";
const request = (query = "lang=en&id=robinhood-gold", headers = {}) =>
  new NextRequest(`${origin}/api/removed-card?${query}`, { headers });
const renderedHtml = '<html><body><h1 id="removed-card-heading">Rendered page</h1></body></html>';
const cacheControl = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

test("removed-card handler rejects missing or invalid locale/id without fetching", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch"); });
  for (const query of ["", "lang=fr&id=robinhood-gold", "lang=en&id=missing", "lang=en", "id=robinhood-gold"]) {
    const response = await GET(request(query));
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type")!, /^text\/plain/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
  }
  assert.equal(mocked.mock.calls.length, 0);
});

test("failed self-fetch returns localized, self-contained 410 HTML with internal alternatives", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("render unavailable"); });
  for (const locale of locales) {
    const response = await GET(request(`lang=${locale}&id=robinhood-gold`));
    const html = await response.text();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
    assert.equal(response.headers.get("cache-control"), cacheControl);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(html.includes(`<html lang="${locale}">`));
    assert.ok(html.includes('<meta name="robots" content="noindex">'));
    assert.ok(html.includes(removedCardCopy[locale].heading));
    for (const id of removedCards[0].alternatives) {
      assert.ok(html.includes(`href="/${locale}/cards/${id}"`));
      assert.ok(html.includes(getCardById(id)!.name));
    }
    for (const path of ["/find", "#cards-section", ""]) assert.ok(html.includes(`href="/${locale}${path}"`));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    assert.ok(hrefs.length >= 6);
    assert.ok(hrefs.every((href) => href.startsWith(`/${locale}`)));
    assert.doesNotMatch(html, /sponsored|referral|<script|<link\b|<img\b/i);
  }
});

test("fallback escapes interpolated copy and card names", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  const original = removedCardCopy.en;
  const name = removedCards[0].name;
  const unsafe = `<script>"O'Reilly" & friends</script>`;
  try {
    removedCardCopy.en = { ...original, heading: unsafe, title: unsafe, alternatives: unsafe };
    removedCards[0].name = unsafe;
    const html = await (await GET(request())).text();
    assert.ok(html.includes("&lt;script&gt;&quot;O&#39;Reilly&quot; &amp; friends&lt;/script&gt;"));
    assert.doesNotMatch(html, /<script>/);
  } finally {
    removedCardCopy.en = original;
    removedCards[0].name = name;
  }
});

test("self-fetch only requests full HTML and never forwards render cookies or headers", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, `${origin}/en/removed-card/robinhood-gold`);
    assert.deepEqual(options?.headers, { "x-opencard-removed-render": "1" });
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "manual");
    assert.ok(options?.signal instanceof AbortSignal);
    return new Response(renderedHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "render=private", "X-Render": "private" },
    });
  });
  for (const headers of [{}, { RSC: "1" }, { "Next-Router-Prefetch": "1" }]) {
    const response = await GET(request(undefined, headers));
    assert.equal(response.status, 410);
    assert.equal(await response.text(), renderedHtml);
    assert.equal(response.headers.get("vary"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-render"), null);
    assert.equal(response.headers.get("cache-control"), cacheControl);
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
  }
  assert.equal(mocked.mock.calls.length, 3);
});

test("non-200 and non-HTML renders use the fallback", async (t) => {
  for (const [status, contentType] of [[302, "text/html"], [401, "text/html"], [200, "text/x-component"]] as const) {
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response("not the page", {
      status, headers: { "Content-Type": contentType },
    }));
    const response = await GET(request());
    assert.equal(response.status, 410);
    assert.ok((await response.text()).includes(removedCardCopy.en.heading));
    mocked.mock.restore();
  }
});

test("rewrites exposing the original URL validate its path, including slash and RSC query", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  for (const path of [
    "/en/cards/robinhood-gold",
    "/en/cards/robinhood-gold/",
    "/en/cards/robinhood-gold?_rsc=abc&lang=fr&id=missing",
  ]) {
    const response = await GET(new NextRequest(`${origin}${path}`));
    assert.equal(response.status, 410);
    assert.ok((await response.text()).includes(removedCardCopy.en.heading));
  }
  for (const path of ["/fr/cards/robinhood-gold", "/en/cards/missing"]) {
    assert.equal((await GET(new NextRequest(`${origin}${path}`))).status, 404);
  }
});

test("foreign request hosts skip self-fetch and return fallback 410", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch"); });
  for (const host of ["foreign.example", "opencardai.com.foreign.example", "localhost.foreign.example", "opencardai.com:8443"]) {
    const response = await GET(new NextRequest(`https://${host}/en/cards/robinhood-gold`, {
      headers: { Host: host },
    }));
    assert.equal(response.status, 410);
    assert.ok((await response.text()).includes(removedCardCopy.en.heading));
  }
  assert.equal(mocked.mock.calls.length, 0);
});

test("production, configured Vercel and loopback hosts allow self-fetch", async (t) => {
  const envNames = ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
  const saved = envNames.map((name) => process.env[name]);
  try {
    envNames.forEach((name, index) => { process.env[name] = `deployment-${index}.vercel.app`; });
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response(renderedHtml, {
      headers: { "Content-Type": "text/html" },
    }));
    const hosts = ["opencardai.com", "www.opencardai.com", "localhost", "localhost:3410", "127.0.0.1", "127.0.0.1:3410",
      ...envNames.map((name) => process.env[name]!)];
    for (const host of hosts) {
      const response = await GET(new NextRequest(`http://${host}/en/cards/robinhood-gold`));
      assert.equal(response.status, 410);
      assert.equal(await response.text(), renderedHtml);
    }
    assert.equal(mocked.mock.calls.length, hosts.length);
  } finally {
    envNames.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});

test("200 HTML without the removed-card marker uses fallback", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html><body>Wrong page</body></html>", {
    headers: { "Content-Type": "text/html" },
  }));
  const response = await GET(request());
  assert.equal(response.status, 410);
  const html = await response.text();
  assert.ok(html.includes(removedCardCopy.en.heading));
  assert.ok(!html.includes("Wrong page"));
});

test("render body read failure uses fallback", async (t) => {
  const rendered = new Response(renderedHtml, { headers: { "Content-Type": "text/html" } });
  t.mock.method(rendered, "text", async () => { throw new Error("body read failed"); });
  t.mock.method(globalThis, "fetch", async () => rendered);
  const response = await GET(request());
  assert.equal(response.status, 410);
  assert.ok((await response.text()).includes(removedCardCopy.en.heading));
});
