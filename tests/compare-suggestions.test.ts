import test from "node:test";
import assert from "node:assert/strict";
import { getAllCards, type CreditCard } from "../lib/cards";
import { getCardEditorial } from "../lib/card-editorial";
import { getCompareMetadata, getComparePath, getCompareSuggestions, getPopularComparisons, selectCompareCards } from "../lib/compare-suggestions";

const cards = getAllCards();
const preferred = cards.find((card) => card.card_id === "chase-sapphire-preferred")!;
const reserve = cards.find((card) => card.card_id === "chase-sapphire-reserve")!;

test("suggestions exist, exclude the selection, are deduped and deterministic for every card", () => {
  for (const selected of cards) {
    const alternatives = getCardEditorial(selected.card_id)?.alternatives.map((item) => item.cardId);
    const suggestions = getCompareSuggestions(selected, cards, alternatives);
    const ids = suggestions.map((card) => card.card_id);
    assert.ok(ids.length >= 2 && ids.length <= 4, selected.card_id);
    assert.ok(!ids.includes(selected.card_id));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(suggestions.every((card) => cards.includes(card) && !card.discontinued && (!card.status || card.status === "active")));
    assert.deepEqual(getCompareSuggestions(selected, [...cards].reverse(), alternatives), suggestions);
  }
});

test("editorial alternatives take priority and unavailable candidates are skipped", () => {
  const unavailable = ["discontinued", "transferred", "not_accepting_applications"].map((status, i) => ({ ...reserve, card_id: `closed-${i}`, status }));
  const legacy = { ...reserve, card_id: "legacy", discontinued: true };
  const pool = [...cards, ...unavailable, legacy];
  const suggestions = getCompareSuggestions(preferred, pool, [preferred.card_id, "missing", ...unavailable.map((card) => card.card_id), legacy.card_id, reserve.card_id, reserve.card_id]);
  assert.equal(suggestions[0], reserve);
  assert.ok(suggestions.every((card) => !card.card_id.startsWith("closed-") && card.card_id !== "legacy"));
});

test("popular pairs all exist and missing pairs are omitted", () => {
  const pairs = getPopularComparisons(cards);
  assert.equal(pairs.length, 3);
  for (const [a, b] of pairs) {
    assert.ok(cards.includes(a) && cards.includes(b));
    assert.notEqual(a.card_id, b.card_id);
  }
  assert.deepEqual(getPopularComparisons([]), []);
});

test("suggestion and popular-pair paths match canonical order without reordering inputs", () => {
  const pairs = [
    ...getPopularComparisons(cards),
    ...getCompareSuggestions(reserve, cards).map((other) => [reserve, other]),
  ];
  for (const pair of pairs) {
    const ids = pair.map((card) => card.card_id);
    const original = [...ids];
    const path = getComparePath(ids);
    assert.equal(path, `/compare?cards=${[...ids].sort().join(",")}`);
    assert.equal(getComparePath([...ids].reverse()), path);
    assert.equal(getCompareMetadata("en", ids.join(","), cards).alternates?.canonical, `/en${path}`);
    assert.deepEqual(ids, original);
  }
  assert.equal(getComparePath([]), "/compare");
});

test("empty and invalid-only selections use localized empty descriptions", () => {
  const descriptions = {
    en: "Choose two cards to compare annual fees, rewards, and benefits side by side.",
    zh: "選擇兩張卡片，比較年費、回饋與福利。",
    "zh-cn": "选择两张卡片，比较年费、回馈与福利。",
    es: "Elige dos tarjetas para comparar cuotas anuales, recompensas y beneficios.",
  };
  for (const [lang, description] of Object.entries(descriptions)) {
    for (const value of [undefined, "", "foo,bar", ["foo", "bar"]]) {
      assert.equal(getCompareMetadata(lang, value, cards).description, description);
    }
    assert.ok(getCompareMetadata(lang, preferred.card_id, cards).description?.includes(preferred.name.replace(/[®™℠]/g, "").trim()));
  }
  assert.equal(getCompareMetadata("unknown", undefined, cards).description, descriptions.en);
});

test("selection preserves order, resolves aliases, drops invalid and duplicate ids, handles repeated query keys", () => {
  assert.deepEqual(selectCompareCards([`${reserve.card_id},foo`, `${preferred.card_id},${reserve.card_id}`], cards), [reserve, preferred]);
  const canonical = cards.find((card) => card.card_id === "us-bank-biz-altitude-connect")!;
  assert.deepEqual(selectCompareCards("us-bank-altitude-connect-biz,us-bank-biz-altitude-connect", cards), [canonical]);
});

test("thin metadata is noindex,follow in all supported languages", () => {
  const titles = { en: "Compare Cards", zh: "卡片比較", "zh-cn": "卡片比较", es: "Comparar Tarjetas" };
  for (const [lang, title] of Object.entries(titles)) {
    for (const value of [undefined, "foo,bar", preferred.card_id, `${preferred.card_id},${preferred.card_id}`]) {
      const meta = getCompareMetadata(lang, value, cards);
      assert.deepEqual(meta.robots, { index: false, follow: true });
      assert.deepEqual(meta.title, { absolute: `${title} | OpenCard` });
      assert.deepEqual(meta.alternates, {
        canonical: `/${lang}/compare${value?.includes(preferred.card_id) ? `?cards=${preferred.card_id}` : ""}`,
        languages: {},
      });
    }
  }
});

test("three-card metadata uses clean names, sorted valid canonical ids, and noindex", () => {
  const named = [{ ...preferred, name: "Card A®™℠" }, { ...reserve, name: "Card B™" }, { ...cards.find((card) => card.card_id === "capital-one-venture")!, name: "Card C®" }] as CreditCard[];
  const query = `${reserve.card_id},foo,${preferred.card_id},${reserve.card_id},capital-one-venture`;
  const meta = getCompareMetadata("en", query, named);
  assert.deepEqual(meta.title, { absolute: "Compare Card B vs Card A vs Card C | OpenCard" });
  assert.deepEqual(meta.robots, { index: false, follow: true });
  assert.deepEqual(meta.alternates, { canonical: `/en/compare?cards=capital-one-venture,${preferred.card_id},${reserve.card_id}`, languages: {} });
  assert.match(meta.description!, /Card B vs Card A vs Card C/);
  for (const [lang, prefix] of [["zh", "比較"], ["zh-cn", "比较"], ["es", "Comparar"]]) {
    assert.deepEqual(getCompareMetadata(lang, query, named).title, { absolute: `${prefix} Card B vs Card A vs Card C | OpenCard` });
  }
});


test("only English pairs of indexable cards are indexed and canonical order is stable", () => {
  const value = `${preferred.card_id},${reserve.card_id}`;
  const path = `/compare?cards=${value}`;
  for (const lang of ["en", "zh", "zh-cn", "es"]) {
    const meta = getCompareMetadata(lang, value, cards);
    assert.deepEqual(meta.robots, { index: lang === "en", follow: true });
    assert.deepEqual(meta.alternates, {
      canonical: `/${lang}${path}`,
      languages: { en: `/en${path}`, "x-default": `/en${path}` },
    });
    assert.equal(getCompareMetadata(lang, `${reserve.card_id},${preferred.card_id}`, cards).alternates?.canonical, meta.alternates?.canonical);
  }
});

test("closed, transferred, and invitation-only cards prevent indexing", () => {
  const unavailable = [
    { ...reserve, discontinued: true },
    ...["discontinued", "transferred", "invitation_only", "not_accepting_applications"].map(status => ({ ...reserve, status })),
  ];
  for (const card of unavailable) {
    const meta = getCompareMetadata("en", `${reserve.card_id},${preferred.card_id}`, [preferred, card]);
    assert.deepEqual(meta.robots, { index: false, follow: true });
    assert.deepEqual(meta.alternates, {
      canonical: `/en/compare?cards=${preferred.card_id},${reserve.card_id}`,
      languages: {},
    });
  }
});

test("all compare states provide complete social metadata with localized locale", () => {
  for (const [lang, locale] of Object.entries({ en: "en_US", zh: "zh_TW", "zh-cn": "zh_CN", es: "es_ES", unknown: "en_US" })) {
    for (const value of [undefined, "typo", preferred.card_id, `${preferred.card_id},${reserve.card_id}`, `${preferred.card_id},${reserve.card_id},capital-one-venture`]) {
      const meta = getCompareMetadata(lang, value, cards);
      const title = (meta.title as { absolute: string }).absolute;
      assert.ok(meta.description);
      assert.deepEqual(meta.openGraph, {
        title, description: meta.description, url: meta.alternates?.canonical,
        siteName: "OpenCard.AI", type: "website", locale,
        images: [{ url: "https://opencardai.com/og-image.png", width: 1200, height: 630, alt: "OpenCard.AI — AI-powered credit card selection" }],
      });
      assert.deepEqual(meta.twitter, { card: "summary_large_image", title, description: meta.description, images: ["https://opencardai.com/og-image.png"] });
    }
  }
});
