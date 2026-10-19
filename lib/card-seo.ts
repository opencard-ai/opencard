/**
 * Search-snippet title + meta description for card detail pages.
 *
 * Built from the same card record the page renders, so the snippet never
 * claims anything the page doesn't show. Welcome-offer amounts are left out on
 * purpose: they change often and a stale number in a search result is worse
 * than none. "No foreign transaction fee" is only claimed via
 * knownNoForeignFee() (a 0 in the record alone is not evidence).
 */
import type { CreditCard, EarningRate } from "@/lib/cards";
import { cardRateProfile, knownNoForeignFee, shortCardName } from "@/lib/card-analysis";

type Lang = "en" | "zh" | "zh-cn" | "es";

const COPY: Record<Lang, {
  noFee: string;
  introFee: (fee: number) => string;
  fee: (fee: number) => string;
  upTo: (rate: string) => string;
  benefits: string;
  earns: (top: string, cat: string, base: string) => string;
  flat: (base: string) => string;
  noFx: string;
  tail: string;
  closed: string;
}> = {
  en: {
    noFee: "No Annual Fee",
    introFee: (fee) => `$0 First-Year Fee, then $${fee}`,
    fee: (fee) => `$${fee} Annual Fee`,
    upTo: (rate) => `Up to ${rate} Rewards`,
    benefits: "Rewards & Benefits",
    earns: (top, cat, base) => `Earns ${top} on ${cat} and ${base} on other purchases.`,
    flat: (base) => `Earns ${base} on purchases.`,
    noFx: " No foreign transaction fee.",
    tail: " See benefits, credits, fine print and similar cards.",
    closed: "Closed to new applicants",
  },
  zh: {
    noFee: "免年費",
    introFee: (fee) => `首年免年費，之後 $${fee}`,
    fee: (fee) => `年費 $${fee}`,
    upTo: (rate) => `最高 ${rate} 回饋`,
    benefits: "回饋與福利",
    earns: (top, _cat, base) => `最高 ${top} 回饋，其他消費 ${base}。`,
    flat: (base) => `一般消費 ${base}。`,
    noFx: "免海外交易手續費。",
    tail: "福利、額度、細則和同類卡比較一次看。",
    closed: "已停止受理新申請",
  },
  "zh-cn": {
    noFee: "免年费",
    introFee: (fee) => `首年免年费，之后 $${fee}`,
    fee: (fee) => `年费 $${fee}`,
    upTo: (rate) => `最高 ${rate} 返现`,
    benefits: "返现与权益",
    earns: (top, _cat, base) => `最高 ${top} 返现，其他消费 ${base}。`,
    flat: (base) => `一般消费 ${base}。`,
    noFx: "免境外交易手续费。",
    tail: "权益、额度、细则和同类卡对比一次看。",
    closed: "已停止受理新申请",
  },
  es: {
    noFee: "Sin cuota anual",
    introFee: (fee) => `Cuota anual $0 el primer año, luego $${fee}`,
    fee: (fee) => `Cuota anual de $${fee}`,
    upTo: (rate) => `hasta ${rate} en recompensas`,
    benefits: "recompensas y beneficios",
    earns: (top, _cat, base) => `Gana hasta ${top} y ${base} en otras compras.`,
    flat: (base) => `Gana ${base} en compras.`,
    noFx: " Sin cargo por transacciones en el extranjero.",
    tail: " Compara beneficios, créditos y tarjetas similares.",
    closed: "Cerrada a nuevas solicitudes",
  },
};

/** Card name as people search it: no ®/™, no "Credit Card", issuer brand kept. */
export function searchCardName(card: Pick<CreditCard, "name" | "issuer">): string {
  let name = shortCardName(card.name).replace(/\s+Credit Card\b/gi, "").replace(/\s{2,}/g, " ").trim();
  // People search issuer-led names for these two ("american express business
  // platinum", "chase sapphire"); store and co-brand cards are searched by brand.
  const issuer = card.issuer.trim();
  if (issuer === "American Express" && !/american express|amex/i.test(name)) name = `American Express ${name}`;
  if (issuer === "Chase" && !/chase/i.test(name)) name = `Chase ${name}`;
  return name;
}

/**
 * Hand-written English snippets for high-impression pages whose searchers ask
 * something the template can't answer well. Every fact here is in the card
 * record AND on the issuer's page (checked 2026-10-19); re-check when the
 * card record changes.
 */
// catLabel lowercases simple labels ("Delta purchases" -> "delta purchases");
// restore brand names for search snippets.
const BRANDS = /\b(delta|united|southwest|alaska|jetblue|hawaiian|frontier|spirit|marriott|hilton|hyatt|ihg|wyndham|choice hotels|amazon|costco|walmart|target|lyft|uber|apple|disney|chase|citi|amex)\b/g;
function brandCase(s: string): string {
  return s.replace(BRANDS, (w) => (w === "ihg" ? "IHG" : w === "jetblue" ? "JetBlue" : w.replace(/\b\w/g, (c) => c.toUpperCase())));
}

// Card records have no promo flag; time-limited earn rates are marked in the
// category/notes text ("Through September 30, 2027", "3x through 2026-12-31,
// then 2x", "first year offer", "3% + 3% first-year bonus"). Snippets should
// quote the ongoing rate, so promo rates fall back to the post-promo rate
// stated in the text, or are dropped when none is stated.
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const PROMO_RE = new RegExp(
  `\\b(?:through|until|thru|ends?)\\s+(?:(?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})|limited[- ]time|promotional|first[- ]year (?:offer|bonus|boost)|for the first year`,
  "i",
);
function promoText(e: EarningRate): string {
  const d = (e as EarningRate & { description?: string }).description || "";
  return `${e.category} ${e.notes || ""} ${d}`;
}
export function isPromoRate(e: EarningRate): boolean {
  const t = promoText(e);
  // "1.5% cash back after the first-year offer" is the ongoing rate.
  return PROMO_RE.test(t) && !/\bafter the first[- ]year offer\b/i.test(t);
}
function ongoingRate(e: EarningRate): number | undefined {
  const t = promoText(e);
  // "6% = 3% base + 3% first-year bonus" / "(3% + 3% first-year bonus)"
  const split = t.match(/(\d+(?:\.\d+)?)%\s*(?:base\s*)?\+\s*\d+(?:\.\d+)?%\s*first[- ]year/i);
  if (split) return Number(split[1]);
  // "3x through 2026-12-31, then 2x" (not a spend-cap "then 1%")
  const then = t.match(/(?:through|until)\s+[^,.;]*?,?\s*then\s+(\d+(?:\.\d+)?)\s*(?:x|%)/i);
  if (then) return Number(then[1]);
  return undefined;
}
function withoutPromoRates(card: CreditCard): CreditCard {
  const rates = card.earning_rates || [];
  if (!rates.some(isPromoRate)) return card;
  const kept: EarningRate[] = [];
  for (const e of rates) {
    if (!isPromoRate(e)) {
      // "All purchases — standard base" is the base rate once a first-year
      // all-purchases offer is set aside.
      kept.push(/standard base|after the first[- ]year/i.test(promoText(e)) && /^all purchases/i.test(e.category) ? { ...e, category: "All purchases" } : e);
      continue;
    }
    const r = ongoingRate(e);
    if (r !== undefined && r > 0) kept.push({ ...e, rate: r, category: e.category.replace(/\s*\(\d+(?:\.\d+)?%\)\s*$/, "") });
  }
  return { ...card, earning_rates: kept };
}

const OVERRIDES: Record<string, { title: string; description: string }> = {
  // Spirit stopped flying in May 2026 and BofA's page is gone, but the record is
  // still active; don't advertise its old fee and earning rates.
  "spirit-airlines-mastercard": {
    title: "Spirit Airlines Mastercard: What Happens to the Card Now | OpenCard",
    description: "Spirit Airlines stopped flying in May 2026 and Bank of America no longer lists this card. What current cardholders should check, and why not to apply.",
  },
  "boa-student-customized-cash-rewards": {
    title: "BofA Customized Cash Rewards for Students: Benefits & Rates | OpenCard",
    description: "Bank of America's student cash back card: no annual fee, 6% in a category you choose in year one and 2% at grocery stores and wholesale clubs (on up to $2,500 a quarter combined), plus a $200 bonus after $1,000 in 90 days.",
  },
  "barclays-old-navy-navyist-rewards-mastercard": {
    title: "Old Navy Encore Mastercard: No Annual Fee & 30% Off First Purchase | OpenCard",
    description: "Barclays' Old Navy Encore Mastercard can be used anywhere Mastercard is accepted. No annual fee, points at Old Navy and other Gap Inc. brands, and 30% off your first Old Navy purchase. See what the points are really worth.",
  },
  "amex-biz-platinum": {
    title: "American Express Business Platinum Card: $895 Fee & Benefits | OpenCard",
    description: "The Business Platinum Card from American Express: $895 annual fee, 5x points on flights and prepaid hotels booked on AmexTravel.com, 2x on key business purchases, and no foreign transaction fees. See which credits are worth it.",
  },
};

export function cardSeoMeta(card: CreditCard, lang: string, closed: boolean): { title: string; description: string } {
  if (lang === "en" && !closed && OVERRIDES[card.card_id]) return OVERRIDES[card.card_id];

  const c = COPY[(lang in COPY ? lang : "en") as Lang];
  const name = searchCardName(card);
  const fee = card.annual_fee;
  const introFree = fee > 0 && /\$0/.test(card.annual_fee_description || "") && /intro|first year/i.test(card.annual_fee_description || "");
  const feeText = fee === 0 ? c.noFee : introFree ? c.introFee(fee) : c.fee(fee);
  const raw = cardRateProfile(withoutPromoRates(card));
  // A few airline/hotel co-brands are also tagged cash-back in the record, which
  // would print "3%" for points; co-brand rates are always per-dollar multiples.
  const coBrand = (card.tags || []).some((tag) => tag === "airline" || tag === "hotel");
  const p = coBrand && raw.isCash ? { ...raw, unit: (r: number) => `${r}x` } : raw;
  // Store-card records express points as a "%" cash-back rate, but the rewards
  // are store credit (Barclays' Gap Inc. cards: "5X" = 25 pts/$, 500 pts = $1,
  // redeemable only at Gap Inc. brands). Leave rates out of snippets.
  const storeCard = (card as CreditCard & { deprecated_bucket?: string }).deprecated_bucket === "B_store_card";
  const top = storeCard ? undefined : p.top;

  if (closed) {
    return {
      title: `${name}: ${c.closed} | OpenCard`,
      description: `${name} — ${c.closed}. ${feeText}.${c.tail}`,
    };
  }

  const titleTail = top ? c.upTo(p.unit(top.rate)) : c.benefits;
  const earning = storeCard
    ? ""
    : top && p.topLabel
      ? c.earns(p.unit(top.rate), brandCase(p.topLabel.replace(/^(Two|All|Choice|Bonus|Top|Your|Select|Eligible|Everyday)\b(?= [a-z])/, (w) => w.toLowerCase())), p.unit(p.baseRate))
      : c.flat(p.unit(p.baseRate));
  const sep = lang === "zh" || lang === "zh-cn" ? "：" : ": ";
  const end = lang === "zh" || lang === "zh-cn" ? "。" : ". ";
  return {
    title: `${name}${sep}${feeText}${lang === "zh" || lang === "zh-cn" ? "，" : ", "}${titleTail} | OpenCard`,
    description: `${name}${sep}${feeText}${end}${earning}${knownNoForeignFee(card) ? c.noFx : ""}${c.tail}`.replace(/\s{2,}/g, " ").trim(),
  };
}
