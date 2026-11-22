import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, Suspense, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import HomePage, { generateStaticParams } from "../app/[lang]/page";
import CardGrid from "../app/components/CardGrid";
import { getOpenCards } from "../lib/cards";

function gridBoundary(node: ReactNode): ReactElement<{ fallback: ReactNode }> | undefined {
  if (!isValidElement<{ children?: ReactNode; fallback: ReactNode }>(node)) return;
  if (node.type === Suspense && Children.toArray(node.props.children).some(child => isValidElement(child) && child.type === CardGrid)) return node;
  return Children.toArray(node.props.children).map(gridBoundary).find(Boolean);
}

test("real homepage prerender fallback includes all default card links beyond six per tier", async () => {
  const params = await generateStaticParams();
  assert.deepEqual(params.map(({ lang }) => lang), ["en", "zh", "zh-cn", "es"]);
  for (const { lang } of params) {
    // Inspect the actual page's Suspense fallback, without a fake search-params
    // context. This is the tree Next emits when useSearchParams bails out of
    // prerendering; a Loading-only fallback must fail this test.
    const page = await HomePage({ params: Promise.resolve({ lang }) });
    const boundary = gridBoundary(page);
    assert.ok(boundary, "Expected the query-dependent card grid's Suspense boundary");
    const fallback = parse(renderToStaticMarkup(boundary.props.fallback));
    for (const card of getOpenCards()) {
      assert.ok(fallback.querySelector(`a[href="/${lang}/cards/${card.card_id}"]`), `${lang}: ${card.card_id}`);
    }
    const extras = fallback.querySelectorAll('[id^="cards-"][id$="-extra"]');
    assert.ok(extras.length > 0, "Real data must exercise cards beyond the sixth in a tier");
    for (const extra of extras) {
      assert.ok(extra.querySelectorAll(`a[href^="/${lang}/cards/"]`).length > 0);
      assert.ok(extra.hasAttribute("inert"));
      assert.ok(extra.classList.contains("max-h-0"));
      const section = extra.parentNode;
      assert.equal(section.querySelector(".space-y-2")!.querySelectorAll("a[href]").length, 6);
    }
  }
});
