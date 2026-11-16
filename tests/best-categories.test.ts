import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BEST_CATEGORIES } from "../lib/best-categories";

test("category slugs are unique and verification dates use YYYY-MM-DD", () => {
  assert.equal(new Set(BEST_CATEGORIES.map(({ slug }) => slug)).size, BEST_CATEGORIES.length);
  for (const category of BEST_CATEGORIES) {
    assert.match(category.verified, /^\d{4}-\d{2}-\d{2}$/, category.slug);
  }
});

test("every category has English and Traditional Chinese content and at least two picks", () => {
  for (const category of BEST_CATEGORIES) {
    assert.ok(category.picks.length >= 2, category.slug);
    for (const lang of ["en", "zh"] as const) {
      assert.ok(category.title[lang].trim(), `${category.slug}: title ${lang}`);
      assert.ok(category.intro[lang].trim(), `${category.slug}: intro ${lang}`);
      assert.ok(category.criteria[lang].length > 0, `${category.slug}: criteria ${lang}`);
      assert.ok(category.criteria[lang].every((criterion) => criterion.trim()), `${category.slug}: criteria ${lang}`);
    }
  }
});

test("picks reference card records and HTTPS issuer sources, and summaries make no best claims", () => {
  const issuers = new Set(["creditcards.chase.com", "capitalone.com", "ulta.com", "cards.barclaycardus.com"]);
  for (const category of BEST_CATEGORIES) {
    for (const pick of category.picks) {
      assert.ok(existsSync(path.join(process.cwd(), "data/cards", `${pick.cardId}.json`)), pick.cardId);
      const source = new URL(pick.source);
      assert.equal(source.protocol, "https:", pick.source);
      assert.ok(issuers.has(source.hostname.replace(/^www\./, "")), pick.source);
      for (const lang of ["en", "zh"] as const) {
        assert.doesNotMatch(pick.summary[lang], /best|最好|最強/i, `${pick.cardId}: ${lang}`);
        assert.doesNotMatch(pick.pick[lang], /best|最好|最強/i, `${pick.cardId}: pick ${lang}`);
      }
    }
  }
});

test("titles avoid unqualified best claims; caveats and descriptions are present", () => {
  for (const category of BEST_CATEGORIES) {
    for (const lang of ["en", "zh"] as const) {
      assert.doesNotMatch(category.title[lang], /\bbest\b|最好|最強/i, `${category.slug}: title ${lang}`);
      assert.ok(category.metaDescription[lang].trim(), `${category.slug}: description ${lang}`);
      assert.ok(category.caveats[lang].length > 0, `${category.slug}: caveats ${lang}`);
    }
    assert.match(category.verified, /^\d{4}-\d{2}-\d{2}$/);
  }
});
