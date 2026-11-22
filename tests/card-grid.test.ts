import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import CardGrid, { DefaultCardGrid } from "../app/components/CardGrid";
import type { CreditCard } from "../lib/cards";

const tiers = [
  { id: "premium", fee: 200, tags: ["travel"] },
  { id: "mid-premium", fee: 95, tags: ["travel"] },
  { id: "low-fee", fee: 50, tags: ["travel"] },
  { id: "no-fee", fee: 0, tags: ["cash-back"] },
  { id: "business", fee: 0, tags: ["business"] },
  { id: "secured-student", fee: 0, tags: ["student"] },
];
const cards: CreditCard[] = tiers.flatMap(tier => Array.from({ length: 8 }, (_, i) => ({
  card_id: `fixture-${tier.id}-${i + 1}`,
  name: `${tier.id} card ${i + 1}`,
  issuer: i % 2 ? "Fixture Bank B" : "Fixture Bank A",
  network: "Visa",
  annual_fee: tier.fee,
  foreign_transaction_fee: 0,
  credit_required: "Good",
  earning_rates: [],
  travel_benefits: {},
  insurance: {},
  last_updated: "2026-01-01",
  sources: [],
  tags: tier.tags,
  featured: i === 7,
})));

function render(locale = "en", query = "", input = cards) {
  const navigate = () => { throw new Error("Server rendering must not navigate"); };
  const router: AppRouterInstance = {
    back: navigate, forward: navigate, refresh: navigate,
    push: navigate, replace: navigate, prefetch: navigate,
  };
  return parse(renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router },
      createElement(PathnameContext.Provider, { value: `/${locale}` },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams(query) },
          createElement(CardGrid, {
            cards: input, issuers: ["Fixture Bank A", "Fixture Bank B"],
            tags: tiers.flatMap(tier => tier.tags), locale,
          }),
        ),
      ),
    ),
  ));
}

test("initial collapsed HTML links to every card in every tier and locale", () => {
  for (const locale of ["en", "zh", "zh-cn", "es"]) {
    const page = render(locale);
    const links = page.querySelectorAll("a[href]");
    assert.equal(links.length, cards.length, locale);
    for (const card of cards) {
      assert.ok(page.querySelector(`a[href="/${locale}/cards/${card.card_id}"]`), card.card_id);
    }
    assert.equal(page.querySelectorAll("section").length, tiers.length);
    for (const tier of tiers) {
      const extra = page.querySelector(`#cards-${tier.id}-extra`)!;
      const toggle = page.querySelector(`button[aria-controls="cards-${tier.id}-extra"]`)!;
      assert.ok(toggle);
      assert.equal(toggle.getAttribute("type"), "button");
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.ok(toggle.textContent.trim());
      assert.ok(extra.classList.contains("max-h-0"));
      assert.ok(extra.classList.contains("overflow-hidden"));
      assert.ok(extra.hasAttribute("inert"), "Clipped controls must not receive keyboard focus");
      assert.equal(extra.querySelectorAll("a[href]").length, 2);
      // Featured card 8 stays first; cards 6 and 7 are beyond the six-row preview.
      for (const index of [6, 7]) {
        assert.ok(extra.querySelector(`a[href="/${locale}/cards/fixture-${tier.id}-${index}"]`));
      }
      assert.equal(extra.querySelectorAll("[hidden], .hidden").length, 0);
    }
  }
});

test("six or fewer cards need no tier toggle", () => {
  for (const count of [1, 6]) {
    const page = render("en", "", cards.slice(0, count));
    assert.equal(page.querySelectorAll("a[href]").length, count);
    assert.equal(page.querySelectorAll("button[aria-controls]").length, 0);
    assert.equal(page.querySelectorAll("[inert]").length, 0);
  }
});

test("filters and custom sorts retain every matching card link with localized paths", () => {
  const views = [
    { query: "issuer=Fixture+Bank+A", expected: cards.filter(c => c.issuer === "Fixture Bank A") },
    { query: "tag=travel", expected: cards.filter(c => c.tags.includes("travel")) },
    { query: "af=no", expected: cards.filter(c => c.annual_fee === 0) },
    { query: "af=lt95", expected: cards.filter(c => c.annual_fee < 95) },
    { query: "af=ge95", expected: cards.filter(c => c.annual_fee >= 95) },
    { query: "search=card+7", expected: cards.filter(c => c.name.includes("card 7")) },
    { query: "sort=fee-desc", expected: [...cards].sort((a, b) => b.annual_fee - a.annual_fee) },
    { query: "sort=fee-asc", expected: [...cards].sort((a, b) => a.annual_fee - b.annual_fee) },
    { query: "search=missing", expected: [] },
  ];
  for (const { query, expected } of views) {
    const page = render("es", query);
    const hrefs = page.querySelectorAll("a[href]").map(a => a.getAttribute("href"));
    const expectedHrefs = expected.map(c => `/es/cards/${c.card_id}`);
    if (query.startsWith("sort=")) assert.deepEqual(hrefs, expectedHrefs, query);
    else assert.deepEqual(hrefs.sort(), expectedHrefs.sort(), query);
    assert.equal(page.querySelectorAll("button[aria-controls]").length, 0, query);
  }
});

test("tier toggle expands and collapses the existing rows through its click handler", (t) => {
  // Exercise the real component and event handler with a small hook harness;
  // no browser/DOM dependency is needed to verify the resulting HTML attributes.
  const list = DefaultCardGrid({ cards, tags: [], locale: "en" }).props.children;
  const state: unknown[] = [];
  let cursor = 0;
  const mocks = [
    t.mock.method(React, "useState", ((initial: unknown) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next: unknown) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    }) as typeof React.useState),
    t.mock.method(React, "useMemo", <T>(compute: () => T) => compute()),
    t.mock.method(React, "useCallback", <T extends Function>(callback: T) => callback),
  ];
  const output = () => {
    cursor = 0;
    return list.type(list.props) as ReactElement;
  };
  let tree = output();
  const findToggle = (node: ReactNode): ReactElement<any> | undefined => {
    if (!React.isValidElement<{ children?: ReactNode; "aria-controls"?: string }>(node)) return;
    if (node.type === "button" && node.props["aria-controls"] === "cards-premium-extra") return node;
    return React.Children.toArray(node.props.children).map(findToggle).find(Boolean);
  };
  findToggle(tree)!.props.onClick();
  tree = output();
  findToggle(tree)!.props.onClick();
  const collapsedTree = output();
  // Restore hooks before React renders descendant components normally.
  for (const mock of mocks) mock.mock.restore();
  const expanded = parse(renderToStaticMarkup(tree));
  const toggle = expanded.querySelector('button[aria-controls="cards-premium-extra"]')!;
  const extra = expanded.querySelector("#cards-premium-extra")!;
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(extra.hasAttribute("inert"), false);
  assert.equal(extra.classList.contains("max-h-0"), false);
  assert.equal(extra.classList.contains("overflow-hidden"), false);
  assert.ok(extra.classList.contains("mt-2"));
  assert.equal(extra.querySelectorAll("a[href]").length, 2);
  assert.equal(expanded.querySelectorAll("a[href]").length, cards.length);
  const collapsed = parse(renderToStaticMarkup(collapsedTree));
  assert.equal(collapsed.querySelector('button[aria-controls="cards-premium-extra"]')!.getAttribute("aria-expanded"), "false");
  const collapsedExtra = collapsed.querySelector("#cards-premium-extra")!;
  assert.ok(collapsedExtra.hasAttribute("inert"));
  assert.ok(collapsedExtra.classList.contains("max-h-0"));
  assert.equal(collapsedExtra.classList.contains("mt-2"), false);
  assert.equal(collapsed.querySelectorAll("a[href]").length, cards.length);
});

test("row title, save and native expand button are separate interactive controls", () => {
  const page = render("en", "", cards.slice(0, 1));
  assert.equal(page.querySelectorAll('[role="button"]').length, 0);
  for (const control of page.querySelectorAll("button, a")) {
    assert.equal(control.querySelectorAll("button, a").length, 0);
  }
  const expand = page.querySelector('button[aria-label="Expand details: premium card 1"]')!;
  assert.ok(expand);
  assert.equal(expand.getAttribute("type"), "button");
  assert.equal(expand.getAttribute("aria-expanded"), "false");
});
