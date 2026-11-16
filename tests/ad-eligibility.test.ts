import test from "node:test";
import assert from "node:assert/strict";
import { isAdEligiblePath } from "../lib/ad-eligibility";
import { getGuidesForLocale } from "../lib/guides";

const slugs = getGuidesForLocale("en").map((guide) => guide.slug);

test("only published English guide slugs are ad-eligible", () => {
  assert.equal(isAdEligiblePath("/en/guides/does-not-exist", slugs), false);
  assert.ok(slugs.length > 0, "English guide list must not be empty");
  const [firstSlug] = slugs;
  assert.equal(isAdEligiblePath(`/en/guides/${firstSlug}`, slugs), true);
  for (const slug of slugs) {
    assert.equal(isAdEligiblePath(`/en/guides/${slug}`, slugs), true);
    assert.equal(isAdEligiblePath(`/en/guides/${slug}/`, slugs), true);
    assert.equal(isAdEligiblePath(`/zh/guides/${slug}`, slugs), false);
    assert.equal(isAdEligiblePath(`/en/guides/${slug}/missing`, slugs), false);
  }
});

test("existing homepage, guide index, and editorial eligibility is preserved", () => {
  for (const path of ["/en", "/zh/", "/zh-cn", "/es", "/en/guides", "/en/guides/", "/zh/about", "/es/methodology/"]) {
    assert.equal(isAdEligiblePath(path, slugs), true, path);
  }
  for (const path of ["/en/missing", "/en/cards/not-a-real-card", "/foo.bar/x", "/en/my-cards", "/zh/guides"]) {
    assert.equal(isAdEligiblePath(path, slugs), false, path);
  }
});
