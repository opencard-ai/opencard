import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LICENSE, searchCards, getCard, currentWelcomeOffers, InputError, MAX_LIMIT, boundedJson, MAX_RESPONSE_BYTES } from "../lib/developer-api";
import { handleRpc, TOOLS } from "../lib/mcp-server";
import { openApiSpec } from "../lib/openapi-spec";
import { LLMS_TXT } from "../lib/llms-txt";
import { POST as mcpPost, GET as mcpGet } from "../app/api/mcp/route";
import { GET as cardsGet } from "../app/api/public/cards/route";
import { GET as cardGet } from "../app/api/public/cards/[id]/route";
import { GET as offersGet, OPTIONS as offersOptions } from "../app/api/public/welcome-offers/route";
import { OPTIONS as mcpOptions } from "../app/api/mcp/route";
import sitemap from "../app/sitemap";

const rpc = (body: unknown) => mcpPost(new Request("http://x/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

test("searchCards filters, limits and excludes closed cards", () => {
  const all = searchCards({ limit: MAX_LIMIT });
  assert.ok(all.total > 50);
  assert.equal(all.cards.length, MAX_LIMIT);
  assert.ok(all.cards.every((c) => c.status !== "discontinued"));
  const free = searchCards({ max_annual_fee: 0, limit: 50 });
  assert.ok(free.cards.every((c) => c.annual_fee === 0));
  const chase = searchCards({ issuer: "chase", query: "sapphire" });
  assert.ok(chase.cards.some((c) => c.card_id === "chase-sapphire-preferred"));
  assert.ok(chase.cards[0].url.startsWith("https://opencardai.com/en/cards/"));
  assert.throws(() => searchCards({ limit: 51 }), InputError);
  assert.throws(() => searchCards({ network: "jcb" }), InputError);
  assert.throws(() => searchCards({ query: "x".repeat(101) }), InputError);
  assert.throws(() => searchCards({ max_annual_fee: "abc" }), InputError);
});

test("getCard returns a public record without dormant affiliate fields", () => {
  const r = getCard({ card_id: "chase-sapphire-preferred" });
  assert.ok(r);
  assert.equal(r!.card.card_id, "chase-sapphire-preferred");
  assert.equal("affiliate_url" in r!.card, false);
  assert.equal(getCard({ card_id: "no-such-card-xyz" }), null);
  assert.throws(() => getCard({ card_id: "../etc/passwd" }), InputError);
  assert.throws(() => getCard({}), InputError);
});

test("currentWelcomeOffers is sorted, open-only and bounded", () => {
  const r = currentWelcomeOffers({ limit: 10 });
  assert.ok(r.offers.length > 0 && r.offers.length <= 10);
  for (let i = 1; i < r.offers.length; i++) assert.ok((r.offers[i - 1].estimated_value_usd ?? 0) >= (r.offers[i].estimated_value_usd ?? 0));
  assert.match(r.disclosure, /compensation/);
  assert.ok(Buffer.byteLength(JSON.stringify(currentWelcomeOffers({ limit: MAX_LIMIT }))) < MAX_RESPONSE_BYTES);
  assert.match(boundedJson({ big: "x".repeat(MAX_RESPONSE_BYTES) }), /too large/);
});

test("MCP: initialize, tools/list, tools/call, errors", async () => {
  const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.ok(init.result.capabilities.tools);
  const note = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);
  const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), ["search_cards", "get_card", "current_welcome_offers"]);
  assert.ok(TOOLS.every((t) => t.annotations.readOnlyHint));
  const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_card", arguments: { card_id: "chase-sapphire-preferred" } } })).json();
  assert.equal(call.result.isError, false);
  assert.equal(JSON.parse(call.result.content[0].text).card.card_id, "chase-sapphire-preferred");
  const bad = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_cards", arguments: { limit: 999 } } })).json();
  assert.equal(bad.result.isError, true);
  const extra = await (await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "search_cards", arguments: { sql: "drop" } } })).json();
  assert.equal(extra.result.isError, true);
  const unknown = await (await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_card", arguments: {} } })).json();
  assert.equal(unknown.error.code, -32602);
  assert.equal((await (await rpc({ jsonrpc: "2.0", id: 7, method: "nope" })).json()).error.code, -32601);
  assert.equal((await rpc("{not json")).status, 400);
  assert.equal((await rpc([{ jsonrpc: "2.0", id: 1, method: "ping" }])).status, 400);
  assert.equal((await rpc("x".repeat(20_000))).status, 413);
  assert.equal((await mcpGet()).status, 405);
  assert.equal(handleRpc(null)!.error !== undefined, true);
});

test("public JSON routes", async () => {
  const s = await cardsGet(new Request("http://x/api/public/cards?q=sapphire&limit=3"));
  assert.equal(s.status, 200);
  assert.ok((await s.json()).cards.length <= 3);
  assert.equal((await cardsGet(new Request("http://x/api/public/cards?limit=0"))).status, 400);
  assert.equal((await cardGet(new Request("http://x"), { params: Promise.resolve({ id: "chase-sapphire-preferred" }) })).status, 200);
  assert.equal((await cardGet(new Request("http://x"), { params: Promise.resolve({ id: "nope-nope" }) })).status, 404);
  assert.equal((await cardGet(new Request("http://x"), { params: Promise.resolve({ id: "BAD ID" }) })).status, 400);
  assert.equal((await offersGet(new Request("http://x/api/public/welcome-offers?limit=2"))).status, 200);
});

test("OpenAPI, llms.txt and developer page", () => {
  assert.equal(openApiSpec.openapi, "3.1.0");
  for (const p of ["/api/public/cards", "/api/public/cards/{card_id}", "/api/public/welcome-offers", "/api/mcp"]) assert.ok(p in openApiSpec.paths);
  assert.match(LLMS_TXT, /^# OpenCard/);
  assert.match(LLMS_TXT, /openapi\.json/);
  const page = fs.readFileSync("app/[lang]/developers/page.tsx", "utf8");
  assert.match(page, /AffiliateDisclosure/);
  for (const f of ["lib/developer-api.ts", "lib/mcp-server.ts", "app/api/mcp/route.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /process\.env|V1_|@vercel\/kv|@upstash|neon/i, f);
  }
});

test("relevance ranking: name, then issuer, then other; alphabetical within group", () => {
  const r = searchCards({ query: "sapphire", limit: 50 });
  assert.ok(r.cards.length > 0 && r.cards.every((c) => /sapphire/i.test(c.name + c.card_id)));
  const names = r.cards.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  const chase = searchCards({ query: "chase", limit: 50 }).cards;
  const firstIssuerOnly = chase.findIndex((c) => !/chase/i.test(c.name + c.card_id));
  if (firstIssuerOnly >= 0) assert.ok(chase.slice(firstIssuerOnly).every((c) => !/chase/i.test(c.name + c.card_id)));
  const travel = searchCards({ query: "travel", limit: 50 }).cards;
  const firstOther = travel.findIndex((c) => !/travel/i.test(c.name + c.card_id + c.issuer));
  if (firstOther >= 0) assert.ok(travel.slice(firstOther).every((c) => !/travel/i.test(c.name + c.card_id)));
});

test("CORS, preflight, cache headers, license", async () => {
  const res = await cardsGet(new Request("http://x/api/public/cards?q=sapphire"));
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("cache-control")!, /s-maxage=3600, stale-while-revalidate=86400/);
  const body = await res.json();
  assert.deepEqual(body.license, LICENSE);
  assert.match(body.attribution, /CC BY 4\.0.*https:\/\/opencardai\.com/);
  const pre = offersOptions();
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-methods")!, /GET/);
  assert.match(pre.headers.get("access-control-allow-headers")!, /Content-Type/);
  const mpre = mcpOptions();
  assert.match(mpre.headers.get("access-control-allow-methods")!, /POST/);
  const m = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "current_welcome_offers", arguments: { limit: 1 } } });
  assert.equal(m.headers.get("access-control-allow-origin"), "*");
  assert.match(JSON.parse((await m.json()).result.content[0].text).attribution, /CC BY 4\.0/);
  assert.equal((await mcpGet()).status, 405);
  assert.deepEqual(openApiSpec.info.license, { name: "CC-BY-4.0", url: "https://creativecommons.org/licenses/by/4.0/" });
  assert.match(LLMS_TXT, /CC BY 4\.0/);
});

test("sitemap and footer include /developers", () => {
  assert.ok(sitemap().some((e) => e.url === "https://opencardai.com/en/developers"));
  assert.match(fs.readFileSync("app/[lang]/layout.tsx", "utf8"), /\/developers`/);
  assert.match(fs.readFileSync("app/[lang]/developers/page.tsx", "utf8"), /CC BY 4\.0/);
});
