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
  // CTR batch 3 (2026-11-02): GSC pages at position 8-30 with 0 clicks. DB + issuer facts only.
  "chase-ink-biz-unlimited": {
    title: "Chase Ink Business Unlimited: No Annual Fee, 1.5% Cash Back | OpenCard",
    description: "Chase Ink Business Unlimited has a $0 annual fee and pays unlimited 1.5% cash back on every business purchase, with no categories to track. Note the 3% foreign transaction fee.",
  },
  "capital-one-quicksilver": {
    title: "Capital One Quicksilver: 1.5% Cash Back, No Annual or Foreign Fees | OpenCard",
    description: "Capital One Quicksilver Cash Rewards: $0 annual fee, unlimited 1.5% cash back on every purchase and no foreign transaction fees. See how it stacks up against 2% flat-rate cards.",
  },
  "southwest-rapid-rewards-premier": {
    title: "Southwest Rapid Rewards Premier Card: $149 Fee, No Foreign Fees | OpenCard",
    description: "Chase's Southwest Rapid Rewards Premier card: $149 annual fee, no foreign transaction fees, 3x points on Southwest purchases, 2x at grocery stores and restaurants, 1x on everything else.",
  },
  "comenity-ulta-beauty-mastercard": {
    title: "Ulta Beauty Credit Mastercard: No Annual Fee, 4x at Ulta | OpenCard",
    description: "The Ulta Beauty Credit Mastercard from Comenity has no annual fee and earns 4x points per $1 at Ulta Beauty, 2x on gas and dining, and 1x on other purchases. Compare it with other store cards.",
  },
  "amex-blue-cash-everyday": {
    title: "Amex Blue Cash Everyday: No Annual Fee, 3% at U.S. Supermarkets | OpenCard",
    description: "American Express Blue Cash Everyday: $0 annual fee and 3% cash back at U.S. supermarkets on up to $6,000 a year (then 1%). 2.7% foreign transaction fee. Compare it with other no-fee grocery cards.",
  },
  "discover-it-student-cash-back": {
    title: "Discover it Student Cash Back: No Annual Fee, 5% Rotating Categories | OpenCard",
    description: "Discover it Student Cash Back: $0 annual fee, 5% on quarterly categories you activate (up to $1,500 a quarter, then 1%), 1% on everything else, and no foreign transaction fees.",
  },
  "chase-ink-biz-premier": {
    title: "Chase Ink Business Premier: $195 Fee, 2% Cash Back on Everything | OpenCard",
    description: "Chase Ink Business Premier: $195 annual fee, 2% cash back on business purchases, 2.5% on purchases of $5,000 or more, 5% on travel booked through Chase Travel, and no foreign transaction fees.",
  },
  "chase-southwest-performance-biz": {
    title: "Southwest Performance Business Card: $299 Fee, 3x on Southwest | OpenCard",
    description: "Chase's Southwest Rapid Rewards Performance Business card: $299 annual fee, 3x points on Southwest purchases, 2x at gas stations, 1x elsewhere, and no foreign transaction fees.",
  },
  "us-bank-biz-essentials": {
    title: "U.S. Bank Business Essentials: No Annual Fee, 2% Cash Back | OpenCard",
    description: "U.S. Bank Business Essentials Card: $0 annual fee, unlimited 2% cash back on eligible purchases and 6% on prepaid hotels and car rentals booked in the U.S. Bank Travel Center. 3% foreign transaction fee.",
  },
  "us-bank-prime-business": {
    title: "U.S. Bank Prime Business World Elite Mastercard: 5% at Amazon | OpenCard",
    description: "Prime Business World Elite Mastercard from U.S. Bank: $0 annual fee, 5% back at Amazon, Amazon Business, AWS and Whole Foods Market on the first $150,000 a year (then 1%), and no foreign transaction fees.",
  },
  // CTR batch 4 (2026-11-09): high-impression 0-click pages + lead query matches.
  // Avoid template "Up to Nx" when the top rate is portal-only, capped, or stacked.
  "chase-sapphire-reserve": {
    title: "Chase Sapphire Reserve: $795 Fee, $300 Travel Credit | OpenCard",
    description: "Chase Sapphire Reserve: $795 annual fee, $300 annual Chase Travel credit, Priority Pass Select, 8x on Chase Travel / The Edit, 4x on flights and hotels booked direct, and 3x on dining. No foreign transaction fees.",
  },
  "capital-one-savor": {
    title: "Capital One Savor: No Annual Fee, 3% Dining & Groceries | OpenCard",
    description: "Capital One Savor Cash Rewards: $0 annual fee, unlimited 3% cash back on dining, groceries, entertainment and select streaming, plus 8% on Capital One Entertainment and no foreign transaction fees.",
  },
  "marriott-bonvoy-bold": {
    title: "Marriott Bonvoy Bold: No Annual Fee & Silver Elite Status | OpenCard",
    description: "Chase Marriott Bonvoy Bold: $0 annual fee, automatic Silver Elite status, 3x Bonvoy points at Marriott hotels from the card (plus hotel base points), 2x on dining and gas, and no foreign transaction fees.",
  },
  "chase-british-airways-visa-signature": {
    title: "British Airways Visa Signature: $95 Fee & Travel Together Ticket | OpenCard",
    description: "Chase British Airways Visa Signature: $95 annual fee, Avios on everyday spend, 3x on British Airways / Aer Lingus / Iberia / LEVEL flights, and a Travel Together Ticket after $30,000 annual spend. No foreign transaction fees.",
  },
  "citi-aadvantage-executive": {
    title: "Citi AAdvantage Executive: $695 Fee & Admirals Club Access | OpenCard",
    description: "Citi / AAdvantage Executive World Legend Mastercard: $695 annual fee includes Admirals Club membership for you and up to two guests, plus AAdvantage miles earning and an annual companion certificate after qualifying spend.",
  },
  "chase-ink-biz-cash": {
    title: "Chase Ink Business Cash: No Annual Fee, 5% on Office & Internet | OpenCard",
    description: "Chase Ink Business Cash: $0 annual fee, 5% cash back on office supplies and internet/cable/phone (combined cap $25,000 per anniversary year), 2% on gas and restaurants (same combined cap), then 1%. 3% foreign transaction fee.",
  },
  "fidelity-rewards-visa-signature": {
    title: "Fidelity Rewards Visa Signature: 2% Cash Back, No Annual Fee | OpenCard",
    description: "Fidelity Rewards Visa Signature from Elan: $0 annual fee and unlimited 2% cash back when rewards go into an eligible Fidelity account (1.5% as statement credit). No foreign transaction fees.",
  },
  "discover-it-miles": {
    title: "Discover it Miles: 1.5 Miles Everywhere + First-Year Match | OpenCard",
    description: "Discover it Miles: $0 annual fee, unlimited 1.5 Miles per $1 on every purchase, Discover Match doubles the Miles you earn in the first year, and no foreign transaction fees.",
  },
  "amex-marriott-bevy": {
    title: "Marriott Bonvoy Bevy Amex: $250 Fee & Gold Elite Status | OpenCard",
    description: "Marriott Bonvoy Bevy American Express: $250 annual fee, complimentary Gold Elite status, 5x on flights booked direct and prepaid Marriott hotels booked with Amex, and no foreign transaction fees.",
  },
  // Spirit stopped flying in May 2026 and BofA's page is gone, but the record is
  // still active; don't advertise its old fee and earning rates.
  "spirit-airlines-mastercard": {
    title: "Spirit Airlines Mastercard: What Happens to the Card Now | OpenCard",
    description: "Spirit Airlines stopped flying in May 2026 and Bank of America no longer lists this card. What current cardholders should check, and why not to apply.",
  },
  "amex-blue-biz-plus": {
    title: "Amex Blue Business Plus: No Annual Fee, 2x Membership Rewards | OpenCard",
    description: "American Express Blue Business Plus: $0 annual fee and 2x Membership Rewards points on the first $50,000 of purchases each year (1x after). Transferable points for a business that wants rewards it can use, not just cash back.",
  },
  "boa-biz-advantage-travel": {
    title: "BofA Business Advantage Travel Rewards (WorldPoints): No Annual Fee | OpenCard",
    description: "Bank of America's Business Advantage Travel Rewards World Mastercard: $0 annual fee, 1.5 points per $1 everywhere and 3x through the BofA Travel Center. Also searched as WorldPoints Travel Rewards for Business.",
  },
  "chase-united-club-infinite": {
    title: "United Club Infinite Card: $695 Fee, Lounge Access & 11x Miles | OpenCard",
    description: "Chase United Club Visa Infinite: $695 annual fee buys United Club membership, two free checked bags, Premier Access, and up to 11x miles on United flights. See which credits offset the fee.",
  },
  "barclays-gap-good-rewards-mastercard": {
    title: "Gap Encore Mastercard: No Annual Fee & 20% Off First Purchase | OpenCard",
    description: "Barclays' Gap Encore Mastercard works anywhere Mastercard is accepted. No annual fee, points at Gap and other Gap Inc. brands, and 20% off your first Gap purchase. Same rewards family as Old Navy, Banana Republic and Athleta.",
  },
  "barclays-banana-republic-rewards-mastercard": {
    title: "Banana Republic Encore Mastercard: No Annual Fee & 20% Off First Purchase | OpenCard",
    description: "Barclays' Banana Republic Encore Mastercard: no annual fee, points across Gap Inc. brands, and 20% off your first Banana Republic purchase. Same rewards as the Old Navy, Gap and Athleta Encore cards.",
  },
  "boa-student-customized-cash-rewards": {
    title: "BofA Customized Cash Rewards for Students: Benefits & Rates | OpenCard",
    description: "Bank of America's student cash back card: no annual fee, 6% in a category you choose in year one and 2% at grocery stores and wholesale clubs (on up to $2,500 a quarter combined), plus a $200 bonus after $1,000 in 90 days.",
  },
  "barclays-old-navy-navyist-rewards-mastercard": {
    title: "Old Navy Encore Mastercard: No Annual Fee & 30% Off First Purchase | OpenCard",
    description: "Barclays' Old Navy Encore Mastercard can be used anywhere Mastercard is accepted. No annual fee, points at Old Navy and other Gap Inc. brands, and 30% off your first Old Navy purchase. See what the points are really worth.",
  },
  "barclays-athleta-rewards-mastercard": {
    title: "Athleta Encore Mastercard: No Annual Fee, Gap Inc. Rewards | OpenCard",
    description: "Barclays' Athleta Encore Mastercard: no annual fee and the same Gap Inc. family points as Old Navy, Gap and Banana Republic. Check Barclays' page for the current first-purchase discount before you apply.",
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
    // Discontinued cards must not advertise the old annual fee or earn rates.
    return {
      title: `${name}: ${c.closed} | OpenCard`,
      description: `${name} — ${c.closed}.${c.tail}`,
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
