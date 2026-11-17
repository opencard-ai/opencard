import type { Metadata } from "next";
import type { CreditCard } from "./cards";
import { resolveCardId } from "./card-aliases";
import { isIndexableCard } from "./indexable-cards";
import { localizedAlternates } from "./seo";

export type CardsParam = string | string[] | undefined;

export function getComparePath(ids: readonly string[]) {
  return `/compare${ids.length ? `?cards=${[...ids].sort().join(",")}` : ""}`;
}

function requestedCompareIds(value: CardsParam) {
  return [...new Set((Array.isArray(value) ? value : [value ?? ""])
    .flatMap((part) => part.split(",")).filter(Boolean).map(resolveCardId))];
}

export function hasInvalidCompareIds(value: CardsParam, selected: readonly CreditCard[]) {
  return requestedCompareIds(value).length > selected.length;
}

export function selectCompareCards(value: CardsParam, cards: readonly CreditCard[]) {
  const ids = requestedCompareIds(value);
  const byId = new Map(cards.map((card) => [card.card_id, card]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

const POPULAR_PAIRS = [
  ["chase-sapphire-preferred", "chase-sapphire-reserve"],
  ["chase-sapphire-preferred", "capital-one-venture"],
  ["capital-one-venture", "capital-one-venture-x"],
] as const;

export function getPopularComparisons(cards: readonly CreditCard[]): [CreditCard, CreditCard][] {
  const byId = new Map(cards.map((card) => [card.card_id, card]));
  return POPULAR_PAIRS.flatMap(([a, b]) => {
    const first = byId.get(a);
    const second = byId.get(b);
    return first && second ? [[first, second] as [CreditCard, CreditCard]] : [];
  });
}

export function getCompareSuggestions(
  selected: CreditCard,
  cards: readonly CreditCard[],
  alternativeIds: readonly string[] = [],
): CreditCard[] {
  const byId = new Map(cards.map((card) => [card.card_id, card]));
  const sameIssuer = cards.filter((card) => card.issuer === selected.issuer)
    .map((card) => card.card_id).sort();
  const candidates = [...alternativeIds, ...sameIssuer,
    ...getPopularComparisons(cards).flatMap((pair) => pair.map((card) => card.card_id))];
  return [...new Set(candidates)].flatMap((id) => {
    const card = byId.get(id);
    return card && id !== selected.card_id && !card.discontinued &&
      (!card.status || card.status === "active") ? [card] : [];
  }).slice(0, 4);
}

const SOCIAL_IMAGE = {
  url: "https://opencardai.com/og-image.png",
  width: 1200,
  height: 630,
  alt: "OpenCard.AI — AI-powered credit card selection",
};

const META_LABELS: Record<string, { title: string; prefix: string; locale: string; emptyDescription: string; description: (names: string) => string }> = {
  en: { title: "Compare Cards", prefix: "Compare", locale: "en_US", emptyDescription: "Choose two cards to compare annual fees, rewards, and benefits side by side.", description: (names) => `Compare ${names}: annual fees, rewards, and benefits side by side.` },
  zh: { title: "卡片比較", prefix: "比較", locale: "zh_TW", emptyDescription: "選擇兩張卡片，比較年費、回饋與福利。", description: (names) => `比較 ${names} 的年費、回饋與福利。` },
  "zh-cn": { title: "卡片比较", prefix: "比较", locale: "zh_CN", emptyDescription: "选择两张卡片，比较年费、回馈与福利。", description: (names) => `比较 ${names} 的年费、回馈与福利。` },
  es: { title: "Comparar Tarjetas", prefix: "Comparar", locale: "es_ES", emptyDescription: "Elige dos tarjetas para comparar cuotas anuales, recompensas y beneficios.", description: (names) => `Compara ${names}: cuotas anuales, recompensas y beneficios.` },
};

export function getCompareMetadata(lang: string, value: CardsParam, cards: readonly CreditCard[]): Metadata {
  const selected = selectCompareCards(value, cards);
  const l = META_LABELS[lang] ?? META_LABELS.en;
  const names = selected.map((card) => card.name.replace(/[®™℠]/g, "").trim()).join(" vs ");
  const title = `${selected.length < 2 ? l.title : `${l.prefix} ${names}`} | OpenCard`;
  const description = selected.length ? l.description(names) : l.emptyDescription;
  const eligiblePair = selected.length === 2 && selected.every(isIndexableCard);
  // Keep a self-canonical even for noindex pages, dropping invalid IDs and
  // sorting valid IDs. Empty/invalid-only selections canonicalize to /compare.
  const path = getComparePath(selected.map((card) => card.card_id));
  // Like card pages, advertise only the English version of eligible content.
  const alternates = localizedAlternates(lang, path, eligiblePair ? ["en"] : []);
  return {
    title: { absolute: title },
    description,
    robots: { index: lang === "en" && eligiblePair, follow: true },
    alternates,
    openGraph: { title, description, url: alternates.canonical, siteName: "OpenCard.AI", type: "website", locale: l.locale, images: [SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SOCIAL_IMAGE.url] },
  };
}
