import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FORBIDDEN_FIELD_RE, PUBLIC_CARD_FIELDS, PUBLIC_WELCOME_OFFER_FIELDS, toPublicCardRecord } from "../lib/public-card";
import { getAllCards } from "../lib/cards";
import { getCard, searchCards, currentWelcomeOffers } from "../lib/developer-api";
import { handleRpc } from "../lib/mcp-server";
import { openApiSpec, cardSchemaProperties, welcomeOfferSchemaProperties } from "../lib/openapi-spec";
import { GET as legacyCards } from "../app/api/cards/route";

const LISTED = ["notes", "metadata_notes", "confidence", "source_conflicts", "next_review", "last_scraped", "affiliate_url", "featured"];
const ALLOWED_TOP = new Set<string>([...PUBLIC_CARD_FIELDS, "url"]);
const ALLOWED_OFFER = new Set<string>(PUBLIC_WELCOME_OFFER_FIELDS);

function assertClean(card: Record<string, unknown>, where: string) {
  for (const k of Object.keys(card)) {
    assert.ok(ALLOWED_TOP.has(k), `${where}: unexpected field ${k}`);
    assert.ok(!FORBIDDEN_FIELD_RE.test(k) && !k.startsWith("_") && !k.startsWith("cfpb_") && !k.startsWith("deprecated") && !LISTED.includes(k), `${where}: ${k}`);
  }
  for (const src of (card.sources as Record<string, unknown>[] | undefined) ?? []) {
    assert.ok(Object.keys(src).every((k) => k === "url" || k === "title"), `${where}: source keys ${Object.keys(src)}`);
    assert.equal(typeof src.url, "string");
  }
  const w = card.welcome_offer as Record<string, unknown> | undefined;
  if (w) for (const k of Object.keys(w)) {
    assert.ok(ALLOWED_OFFER.has(k), `${where}: unexpected welcome_offer.${k}`);
    assert.ok(!k.startsWith("_") && !LISTED.includes(k), `${where}: welcome_offer.${k}`);
  }
}

const files = fs.readdirSync("data/cards").filter((f) => f.endsWith(".json"));

test("every card file: toPublicCardRecord and get_card drop internal fields", () => {
  const ids = new Set(getAllCards().map((c) => c.card_id));
  let checked = 0;
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join("data/cards", f), "utf8"));
    if (!raw.card_id || !ids.has(raw.card_id)) continue;
    assertClean(toPublicCardRecord(raw) as unknown as Record<string, unknown>, f);
    const r = getCard({ card_id: raw.card_id });
    assert.ok(r, f);
    assertClean(r!.card as unknown as Record<string, unknown>, `get_card ${f}`);
    checked++;
  }
  assert.ok(checked > 200, `checked ${checked}`);
});

test("public data still keeps documented values", () => {
  const raw = JSON.parse(fs.readFileSync("data/cards/amex-gold.json", "utf8"));
  const pub = toPublicCardRecord(raw);
  assert.equal(pub.annual_fee, raw.annual_fee);
  assert.deepEqual(pub.earning_rates, raw.earning_rates);
  assert.equal(pub.welcome_offer?.bonus_points, raw.welcome_offer.bonus_points);
  assert.ok(!("_revert_history" in pub));
});

test("MCP tools and search/offers outputs are clean", () => {
  const all = JSON.stringify(searchCards({ limit: 50, include_discontinued: true })) + JSON.stringify(currentWelcomeOffers({ limit: 50 }));
  for (const k of [...LISTED, "_revert_history", "cfpb_source", "deprecated_reason"]) assert.ok(!all.includes(`"${k}"`), k);
  const res = handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_card", arguments: { card_id: "amex-gold" } } }) as { result: { content: { text: string }[] } };
  assertClean(JSON.parse(res.result.content[0].text).card, "mcp amex-gold");
});

test("legacy /api/cards card_id, ids and summary=1 are clean", async () => {
  assertClean(await (await legacyCards(new Request("http://x/api/cards?card_id=amex-gold"))).json(), "card_id");
  for (const c of await (await legacyCards(new Request("http://x/api/cards?ids=amex-gold,chase-sapphire-reserve"))).json()) assertClean(c, "ids");
  for (const c of await (await legacyCards(new Request("http://x/api/cards?summary=1"))).json()) {
    if (c.welcome_offer) for (const k of Object.keys(c.welcome_offer)) assert.ok(ALLOWED_OFFER.has(k), `summary welcome_offer.${k}`);
    assert.ok(!Object.keys(c).some((k) => FORBIDDEN_FIELD_RE.test(k)));
  }
});

test("OpenAPI Card schema matches the whitelist", () => {
  assert.deepEqual(Object.keys(cardSchemaProperties).sort(), [...ALLOWED_TOP].sort());
  assert.deepEqual(Object.keys(welcomeOfferSchemaProperties).sort(), [...ALLOWED_OFFER].sort());
  assert.ok(Object.values(cardSchemaProperties).every(Boolean));
  assert.ok(Object.values(welcomeOfferSchemaProperties).every(Boolean));
  assert.equal(openApiSpec.components.schemas.Card.additionalProperties, false);
});

test("restored fee/credit fields and source titles", () => {
  const raw = JSON.parse(fs.readFileSync("data/cards/amex-gold.json", "utf8"));
  const pub = toPublicCardRecord(raw) as unknown as Record<string, unknown>;
  for (const k of ["late_fee", "cash_advance_fee_flat", "cash_advance_fee_pct", "last_verified", "foreign_transaction_fee"]) {
    if (k in raw) assert.deepEqual(pub[k], raw[k], k);
  }
  assert.ok(!("fhr_thc" in pub));
  assert.equal((pub.sources as unknown[]).length, raw.sources.filter((s: { url?: string }) => s && s.url).length);
  const named = toPublicCardRecord(JSON.parse(fs.readFileSync("data/cards/chase-southwest-priority.json", "utf8"))).sources as unknown as { url: string; title?: string }[];
  assert.ok(named.some((s) => s.title === "Chase"));
  const strOnly = toPublicCardRecord(JSON.parse(fs.readFileSync("data/cards/chase-ritz-carlton.json", "utf8"))).sources as unknown as unknown[];
  assert.ok(strOnly.every((s) => typeof s === "object"));
});
