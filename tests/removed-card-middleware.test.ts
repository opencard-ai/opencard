import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const origin = "http://localhost:3410";

for (const path of [
  "/en/cards/robinhood-gold",
  "/es/cards/robinhood-gold/",
  "/en/cards/robinhood-gold?_rsc=abc",
]) {
  test(`removed-card middleware plainly rewrites ${path}`, () => {
    const response = middleware(new NextRequest(new URL(path, origin)));
    assert.equal(response.status, 200);
    const rewrite = new URL(response.headers.get("x-middleware-rewrite")!);
    const locale = path.split("/")[1];
    assert.equal(rewrite.pathname, "/api/removed-card");
    assert.equal(rewrite.searchParams.get("lang"), locale);
    assert.equal(rewrite.searchParams.get("id"), "robinhood-gold");
    assert.equal(rewrite.searchParams.get("_rsc"), new URL(path, origin).searchParams.get("_rsc"));
    assert.equal(response.cookies.get("NEXT_LOCALE")?.value, locale);
  });
}

test("bare removed-card URL redirects to the default locale", () => {
  const response = middleware(new NextRequest(`${origin}/cards/robinhood-gold`));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${origin}/en/cards/robinhood-gold`);
});

for (const headers of [{}, { "x-opencard-removed-render": "0" }] as Record<string, string>[]) {
  test(`direct removed-card destination rewrites to localized 404 with header ${JSON.stringify(headers)}`, () => {
    const response = middleware(new NextRequest(`${origin}/en/removed-card/robinhood-gold`, { headers }));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("x-middleware-rewrite")!.endsWith("/en/removed-card-unavailable"));
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });
}

test("current cards pass through middleware", () => {
  const response = middleware(new NextRequest(`${origin}/en/cards/citi-double-cash`));
  assert.notEqual(response.status, 410);
  assert.equal(response.headers.get("x-middleware-rewrite"), null);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("internal removed-card render passes through with its header", () => {
  const response = middleware(new NextRequest(`${origin}/en/removed-card/robinhood-gold`, {
    headers: { "x-opencard-removed-render": "1" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("x-middleware-rewrite"), null);
});
