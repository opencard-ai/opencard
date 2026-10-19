/**
 * Data-driven card analysis for English card pages.
 *
 * Everything here is derived from the card record (data/cards/*.json) and the
 * OpenCard point valuations in lib/cpp-rates.ts. Nothing is invented: when a
 * field is missing, the corresponding sentence is omitted rather than guessed.
 * Illustrative estimates always state their spending and valuation assumptions.
 */
import type { CreditCard, EarningRate, RecurringCredit } from "@/lib/cards";
import { getCpp } from "@/lib/cpp-rates";
import { welcomeBonusKind } from "@/lib/welcome-offer";
import { isIndexableCard } from "@/lib/indexable-cards";
import { knownNoForeignFee } from "@/lib/foreign-fee";

export type FaqItem = { question: string; answer: string };
export type Comparison = { cardId: string; name: string; reason: string };
export type CreditLine = { name: string; annualValue: number; note: string };

export type CardAnalysis = {
  summary: string;
  whoFor: string[];
  skipIf: string[];
  estimate: {
    assumptions: string[];
    welcomeValue: number;
    welcomeNote: string;
    earningValue: number;
    firstYearFee: number;
    ongoingFee: number;
    firstYearBeforeCredits: number;
    ongoingBeforeCredits: number;
  };
  credits: {
    lines: CreditLine[];
    faceValueAnnual: number;
    enrollmentRequired: number;
    monthlyCount: number;
    verdict: string;
  } | null;
  comparisons: Comparison[];
  gotchas: string[];
  faq: FaqItem[];
};

const ILLUSTRATIVE_TOP_SPEND = 3000;
const ILLUSTRATIVE_OTHER_SPEND = 9000;

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export function shortCardName(name: string): string {
  return name
    .replace(/[®™℠]/g, "")
    .replace(/^The\s+/i, "")
    .replace(/\s+from American Express$/i, "")
    .replace(/\s+(Credit Card|Card)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const BASE_RE = /^(all|other|default|everything|base|all (eligible )?purchases|(all )?other( eligible)? purchases|all other|other spend(ing)?)$/i;
const PORTAL_RE = /chase travel|capital one travel|capital_one|amextravel|amex travel|travel center|portal|the edit|booked through|booked via|chase_travel/i;
const PORTAL_NAME_RE = /Chase Travel|Capital One Travel|AmexTravel\.com|Amex Travel|U\.S\. Bank Travel Center|The Edit/i;

function isBase(e: EarningRate) {
  return BASE_RE.test(e.category.trim());
}
function isPortal(e: EarningRate) {
  return PORTAL_RE.test(`${e.category} ${e.notes || ""}`);
}

const GROUPS: Array<[string, RegExp]> = [
  ["dining", /dining|restaurant/i],
  ["groceries", /grocer|supermarket|wholesale/i],
  ["gas", /\bgas\b|ev charg|fuel/i],
  ["streaming", /streaming/i],
  ["transit", /transit|rideshare|commut/i],
  ["flights", /flight|air travel|airline|airfare/i],
  ["hotels", /hotel/i],
  ["travel", /travel|vacation|cruise|car rental/i],
  ["online", /online shopping|online/i],
  ["drugstores", /drug ?store|pharmac/i],
  ["choice", /choice|chosen|choose|select/i],
  ["rotating", /rotating|quarterly/i],
];
function groupOf(e?: EarningRate): string {
  if (!e) return "flat";
  const text = `${e.category}`;
  for (const [g, re] of GROUPS) if (re.test(text)) return g;
  return "brand";
}

type Profile = {
  card: CreditCard;
  short: string;
  isCash: boolean;
  cpp: number;
  unit: (rate: number) => string;
  top?: EarningRate;
  topGroup: string;
  baseRate: number;
  segment: "business" | "student" | "secured" | "personal";
  feeBand: number;
  rewardKind: string;
  program?: string;
};

const CASH_RE = /cash|statement credit|dollar|gift card/i;

function profile(card: CreditCard): Profile {
  const kind = welcomeBonusKind(card.welcome_offer);
  const program = card.welcome_offer?.point_program || undefined;
  const isCash =
    (card.tags || []).includes("cash-back") ||
    (kind !== "points" && CASH_RE.test(program || "")) ||
    (!program && (card.tags || []).includes("cash-back"));
  const cpp = isCash || kind !== "points" ? 1 : getCpp(program);
  const rates = card.earning_rates || [];
  const base = rates.find(isBase);
  const baseRate = base ? base.rate : rates.length ? Math.min(...rates.map((r) => r.rate)) : 1;
  const bonus = rates.filter((r) => !isBase(r) && !isPortal(r) && !r.limited_time && r.rate > baseRate);
  const top = [...bonus].sort((a, b) => b.rate - a.rate || a.category.localeCompare(b.category))[0];
  const tags = card.tags || [];
  const name = card.name.toLowerCase();
  const segment = tags.includes("business") || /business|\bink\b|spark/.test(name)
    ? "business"
    : tags.includes("student") || /student/.test(name)
      ? "student"
      : tags.includes("secured") || /secured/.test(name)
        ? "secured"
        : "personal";
  const fee = card.annual_fee;
  const feeBand = fee === 0 ? 0 : fee <= 150 ? 1 : fee <= 450 ? 2 : 3;
  const rewardKind = isCash
    ? "cash"
    : tags.includes("transferable")
      ? "transferable"
      : tags.includes("airline")
        ? "airline"
        : tags.includes("hotel")
          ? "hotel"
          : "points";
  return {
    card,
    short: shortCardName(card.name),
    isCash,
    cpp,
    unit: (r) => (isCash ? `${r}%` : `${r}x`),
    top,
    topGroup: groupOf(top),
    baseRate,
    segment,
    feeBand,
    rewardKind,
    program,
  };
}

/** Minimal earning profile for search snippets (lib/card-seo.ts). */
export function cardRateProfile(card: CreditCard) {
  const p = profile(card);
  return { isCash: p.isCash, top: p.top, topLabel: p.top ? catLabel(p.top) : undefined, baseRate: p.baseRate, unit: p.unit };
}

function annualizeCredit(c: RecurringCredit, firstYear: boolean): number | null {
  const a = Number(c.amount) || 0;
  if (a <= 0) return null;
  switch (c.frequency) {
    case "monthly": return a * 12;
    case "quarterly": return a * 4;
    case "semi_annual": return a * 2;
    case "annual":
    case "cardmember_year": return a;
    case "every_4_years": return firstYear ? a : a / 4;
    default: return null; // per_stay and unknown frequencies are not annualized
  }
}

const FREQ_LABEL: Record<string, string> = {
  monthly: "per month",
  quarterly: "per quarter",
  semi_annual: "twice a year",
  annual: "per year",
  cardmember_year: "per cardmember year",
  every_4_years: "once every four years",
};

/** Application rules from the record, filtered for issuer consistency. */
export function applicableRules(card: CreditCard) {
  const issuer = card.issuer.toLowerCase();
  return (card.application_rules?.rules || []).filter((r) => {
    const rule = r.rule.toLowerCase();
    // 5/24 is Chase's own policy; records that attach it to other issuers are data errors.
    if (rule.includes("5/24")) return issuer.includes("chase");
    if (rule.includes("8/65")) return issuer.includes("citi");
    return true;
  });
}

/** Human label for a category; generic words are lowercased, brand names keep their case. */
function catLabel(e: EarningRate): string {
  const raw = e.category.replace(/_/g, " ").replace(/\s*\([^)]*%\)\s*$/, "").trim();
  const label = /^[A-Z]?[a-z]+( [a-z&+-]+)*$/.test(raw) ? raw.toLowerCase() : raw;
  if (isPortal(e) && !PORTAL_NAME_RE.test(label)) {
    const portal = `${e.category} ${e.notes || ""}`.match(PORTAL_NAME_RE)?.[0];
    if (portal) return `${label} booked through ${portal}`;
  }
  return label;
}

function welcomeLine(card: CreditCard, p: Profile): { value: number; note: string } {
  const w = card.welcome_offer;
  const kind = welcomeBonusKind(w);
  if (!w || kind === "none") return { value: 0, note: "No welcome bonus is listed in our record, so none is counted." };
  if (kind === "percent_discount") {
    return { value: 0, note: `The welcome offer is ${w.discount_percent}% off a first purchase; it is not given a dollar value here because it depends on what you buy.` };
  }
  const value = Number(w.estimated_value) || (kind === "cash" ? Number(w.bonus_points) : Math.round((Number(w.bonus_points) * p.cpp) / 100));
  const asHigh = /as[- ]high[- ]as/i.test(`${w.offer_status || ""} ${w.description || ""}`);
  const basis = kind === "cash"
    ? `the ${usd(Number(w.bonus_points))} bonus at face value`
    : `${Number(w.bonus_points).toLocaleString("en-US")} ${w.point_program || "points"} at ${getCpp(w.point_program)}¢ each (OpenCard valuation)`;
  return {
    value,
    note: `Welcome bonus: ${basis} ≈ ${usd(value)}${asHigh ? " — this is an as-high-as offer, so your offer may be lower" : ""}.`,
  };
}

function pick<T>(xs: Array<T | false | null | undefined>, n: number): T[] {
  return xs.filter(Boolean).slice(0, n) as T[];
}

function similarity(a: Profile, b: Profile): number {
  let s = 0;
  if (a.segment === b.segment) s += 3;
  if (a.feeBand === b.feeBand) s += 2;
  if (Math.abs(a.feeBand - b.feeBand) === 1) s += 0.5;
  if (a.rewardKind === b.rewardKind) s += 2;
  if (a.topGroup === b.topGroup && a.topGroup !== "brand") s += 2;
  const shared = (a.card.tags || []).filter((t) => (b.card.tags || []).includes(t)).length;
  s += Math.min(shared, 2);
  if (a.card.issuer !== b.card.issuer) s += 0.5;
  return s;
}

function comparisonReason(a: Profile, b: Profile): string {
  const fa = a.card.annual_fee;
  const fb = b.card.annual_fee;
  const fee = fb === fa ? `same ${usd(fb)} annual fee` : fb < fa ? `lower fee (${usd(fb)} vs ${usd(fa)})` : `higher fee (${usd(fb)} vs ${usd(fa)})`;
  const earn = b.top
    ? `${b.unit(b.top.rate)} on ${catLabel(b.top)}`
    : `${b.unit(b.baseRate)} on everything`;
  const extra =
    knownNoForeignFee(b.card) && a.card.foreign_transaction_fee > 0
      ? "; no foreign transaction fee"
      : (b.card.travel_benefits?.lounge_access?.length || 0) > 0 && !(a.card.travel_benefits?.lounge_access?.length)
        ? "; includes lounge access"
        : "";
  return `${b.card.issuer}, ${fee}; earns ${earn}${extra}.`;
}

/** Re-exported so existing imports keep working; logic lives in lib/foreign-fee. */
export { knownNoForeignFee };

export function buildCardAnalysis(card: CreditCard, allCards: CreditCard[], preferredAlternatives: string[] = []): CardAnalysis {
  const p = profile(card);
  const noFx = knownNoForeignFee(card);
  const fee = card.annual_fee;
  const introFree = /\$0 intro|introductory annual fee|first year/i.test(card.annual_fee_description || "") && /\$0/.test(card.annual_fee_description || "");
  const firstYearFee = introFree ? 0 : fee;

  // ── Estimate ──────────────────────────────────────────────────────────
  const welcome = welcomeLine(card, p);
  const topRate = p.top ? p.top.rate : p.baseRate;
  const earningValue = Math.round(
    ((ILLUSTRATIVE_TOP_SPEND * topRate + ILLUSTRATIVE_OTHER_SPEND * p.baseRate) * p.cpp) / 100,
  );
  const assumptions = [
    p.top
      ? `${usd(ILLUSTRATIVE_TOP_SPEND)} a year in ${catLabel(p.top)} (${p.unit(p.top.rate)}) and ${usd(ILLUSTRATIVE_OTHER_SPEND)} on everything else (${p.unit(p.baseRate)}) — ${usd(ILLUSTRATIVE_TOP_SPEND + ILLUSTRATIVE_OTHER_SPEND)} total, about $1,000 a month.`
      : `${usd(ILLUSTRATIVE_TOP_SPEND + ILLUSTRATIVE_OTHER_SPEND)} a year of purchases at ${p.unit(p.baseRate)}, about $1,000 a month.`,
    p.isCash || p.cpp === 1
      ? "Rewards valued at 1¢ per point or 1% cash back (cash-equivalent)."
      : `Rewards valued at ${p.cpp}¢ per ${p.program || "point"} (OpenCard valuation; cash-out value can be lower).`,
    welcome.note,
    introFree
      ? `First-year fee: $0 per the issuer's intro terms (${card.annual_fee_description}); ${usd(fee)} from year two.`
      : fee === 0
        ? "No annual fee in any year."
        : `Annual fee of ${usd(fee)} in year one and every year after.`,
  ];
  if ((card.recurring_credits || []).some((c) => Number(c.amount) > 0)) {
    assumptions.push("Recurring credits are listed separately below and are not counted here.");
  }
  const firstYearBeforeCredits = welcome.value + earningValue - firstYearFee;
  const ongoingBeforeCredits = earningValue - fee;

  // ── Credits ───────────────────────────────────────────────────────────
  const recurring = (card.recurring_credits || []).filter((c) => !c.is_free_night);
  const lines: CreditLine[] = [];
  for (const c of recurring) {
    const v = annualizeCredit(c, false);
    if (v === null) continue;
    lines.push({
      name: c.name,
      annualValue: Math.round(v),
      note: `${usd(Number(c.amount))} ${FREQ_LABEL[c.frequency] || c.frequency}${/enrol/i.test(c.description || "") ? ", enrollment required" : ""}`,
    });
  }
  lines.sort((a, b) => b.annualValue - a.annualValue);
  const faceValueAnnual = lines.reduce((s, l) => s + l.annualValue, 0);
  const enrollmentRequired = recurring.filter((c) => /enrol/i.test(c.description || "")).length;
  const monthlyCount = recurring.filter((c) => c.frequency === "monthly").length;
  const freeNights = (card.recurring_credits || []).filter((c) => c.is_free_night).length;
  let credits: CardAnalysis["credits"] = null;
  if (lines.length || freeNights) {
    const coverage = fee > 0 ? faceValueAnnual / fee : 0;
    const verdict = fee === 0
      ? `With no annual fee, any credit you use is pure upside.`
      : coverage >= 1
        ? `At face value the listed credits (${usd(faceValueAnnual)} a year) exceed the ${usd(fee)} fee, but only spending you would have made anyway counts. ${monthlyCount ? `${monthlyCount} of them reset monthly, so unused months are lost. ` : ""}A realistic test is to add up only the credits you used last year.`
        : `Even at face value the listed credits (${usd(faceValueAnnual)} a year) cover ${Math.round(coverage * 100)}% of the ${usd(fee)} fee, so rewards and benefits have to make up the rest.`;
    credits = {
      lines,
      faceValueAnnual,
      enrollmentRequired,
      monthlyCount,
      verdict: freeNights ? `${verdict} The card also lists ${freeNights === 1 ? "a free night award" : `${freeNights} free night awards`}, valued at $0 here because their worth depends on the hotel you book.` : verdict,
    };
  }

  // ── Who it's for ─────────────────────────────────────────────────────
  const lounges = (card.travel_benefits?.lounge_access || []).map((l) => l.name).filter(Boolean);
  const topCredits = lines.slice(0, 2).map((l) => l.name.replace(/\s*credit$/i, ""));
  const portalRate = (card.earning_rates || []).filter(isPortal).sort((a, b) => b.rate - a.rate)[0];
  const portalName = portalRate && portalRate.rate > (p.top?.rate || 0)
    ? (`${portalRate.category} ${portalRate.notes || ""}`.match(PORTAL_NAME_RE)?.[0] || "the issuer's travel portal")
    : null;
  const isCobrand = p.rewardKind === "airline" || p.rewardKind === "hotel";
  const selectable = !!card.selectable_rewards || !!card.rotating_categories || /choice|choose|chosen|rotating/i.test(p.top?.category || "");
  const creditTier = (card.credit_required || "").toLowerCase();

  const whoFor = pick<string>([
    p.segment === "business" && "Business owners who want business spending on its own card",
    p.segment === "student" && "Students starting a credit history",
    p.segment === "secured" && "People building or rebuilding credit with a refundable deposit",
    p.top && `People who spend steadily on ${catLabel(p.top)}, where it earns ${p.unit(p.top.rate)}`,
    isCobrand && p.program && `Regular ${p.program.replace(/\s*(points|miles)$/i, "")} customers who will redeem with that program`,
    lounges.length > 0 && `Frequent flyers who will actually use ${lounges.slice(0, 2).join(" and ")}`,
    topCredits.length > 0 && fee >= 150 && `People who would use the ${topCredits.join(" and ")} credit${topCredits.length > 1 ? "s" : ""} without adding new spending`,
    fee === 0 && (p.top ? `Anyone who wants ${catLabel(p.top)} rewards without paying an annual fee` : "Anyone who wants flat-rate rewards without paying an annual fee"),
    !p.top && `People who want one rate (${p.unit(p.baseRate)}) everywhere without tracking categories`,
    noFx && "Travelers who use the card abroad — it's tagged as having no foreign transaction fee",
    selectable && "People willing to pick or activate bonus categories on schedule",
  ], 3);

  const skipIf = pick<string>([
    card.foreign_transaction_fee > 0 && `Anyone spending abroad — it charges a ${card.foreign_transaction_fee}% foreign transaction fee`,
    fee >= 300 && `People who won't use enough benefits to cover the ${usd(fee)} annual fee`,
    monthlyCount >= 2 && "People who don't want to track monthly credits",
    portalName && `Travelers who prefer booking directly rather than through ${portalName}`,
    selectable && "People who want a set-and-forget card",
    isCobrand && p.program && `People with no loyalty to ${p.program.replace(/\s*(points|miles)$/i, "")}`,
    p.segment === "business" && "Applicants without a business or business income",
    /excellent/.test(creditTier) && !/fair|good/.test(creditTier) && "Applicants with fair or limited credit — the issuer targets excellent credit",
    p.baseRate <= 1 && p.top && `Heavy spenders outside ${catLabel(p.top)} — everything else earns ${p.unit(p.baseRate)}`,
    fee > 0 && fee < 300 && `Anyone who won't earn at least ${usd(fee)} a year more than a no-fee card`,
  ], 3);

  // ── Summary ──────────────────────────────────────────────────────────
  const feePhrase = fee === 0 ? "no-annual-fee" : fee <= 150 ? `${usd(fee)}-a-year` : `premium ${usd(fee)}-a-year`;
  const kindPhrase = p.isCash ? "cash-back" : p.rewardKind === "transferable" ? "transferable-points" : isCobrand ? `${p.program || "co-branded"}` : "rewards";
  const segPhrase = p.segment === "business" ? "business " : p.segment === "student" ? "student " : p.segment === "secured" ? "secured " : "";
  const earnSentence = p.top
    ? `Its strongest everyday earning is ${p.unit(p.top.rate)} on ${catLabel(p.top)}, with ${p.unit(p.baseRate)} on most other purchases.`
    : `It earns a flat ${p.unit(p.baseRate)} on purchases.`;
  const question = fee === 0
    ? (p.top
        ? `With no fee, the question is simply whether ${p.unit(p.top.rate)} on ${catLabel(p.top)} beats what your current card earns there.`
        : `With no fee, it only needs to beat the flat rate your current card already pays.`)
    : credits && credits.faceValueAnnual >= fee
      ? "Whether it pays off depends mostly on how many of its credits replace spending you already do."
      : lounges.length
        ? "Whether it pays off depends on how often you'd use its travel benefits, not on the headline earning rates."
        : `It needs to earn at least ${usd(fee)} more a year than a no-fee alternative to justify the fee.`;
  const summary = `The ${p.short} is a ${feePhrase} ${segPhrase}${kindPhrase} card from ${card.issuer}. ${earnSentence} ${question}`;

  // ── Comparisons ──────────────────────────────────────────────────────
  const pool = allCards.filter((c) => c.card_id !== card.card_id && isIndexableCard(c));
  const byId = new Map(pool.map((c) => [c.card_id, c]));
  const chosen: CreditCard[] = [];
  for (const id of preferredAlternatives) {
    const c = byId.get(id);
    if (c && !chosen.includes(c)) chosen.push(c);
  }
  const ranked = pool
    .map((c) => ({ c, s: similarity(p, profile(c)) }))
    .sort((a, b) => b.s - a.s || a.c.card_id.localeCompare(b.c.card_id));
  for (const { c } of ranked) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const comparisons = chosen.slice(0, 3).map((c) => ({
    cardId: c.card_id,
    name: shortCardName(c.name),
    reason: comparisonReason(p, profile(c)),
  }));

  // ── Rules and gotchas ────────────────────────────────────────────────
  const rules = applicableRules(card);
  const w = card.welcome_offer;
  const caps = (card.earning_rates || []).filter((e) => /up to \$[\d,]+|first \$[\d,]+|then 1/i.test(e.notes || "")).slice(0, 2);
  const firstYearOnly = (card.earning_rates || []).find((e) => /first[- ]year/i.test(e.notes || ""));
  const gotchas = pick<string>([
    ...rules.map((r) => `${r.rule}: ${r.description.replace(/\.?\s*$/, ".")}`),
    w && Number(w.spending_requirement) > 0 && Number(w.time_period_months) > 0 &&
      (() => {
        const pace = Number(w.spending_requirement) / Number(w.time_period_months);
        const fit = pace > 1000
          ? `That's more than the $1,000 a month in our illustration, so the bonus assumes about ${usd(pace - 1000)} a month of extra spending.`
          : `That fits inside the $1,000 a month in our illustration.`;
        return `The welcome bonus requires ${usd(Number(w.spending_requirement))} in ${w.time_period_months} months — roughly ${usd(pace)} a month. ${fit}`;
      })(),
    ...caps.map((e) => `Bonus cap on ${catLabel(e)}: ${e.notes}`),
    firstYearOnly && `The ${p.unit(firstYearOnly.rate)} rate on ${catLabel(firstYearOnly)} includes a first-year boost; the estimate above uses it, so year two earns less.`,
    card.selectable_rewards?.activation_required && `Bonus categories must be selected and activated (${card.selectable_rewards.selection_frequency || "on schedule"}); unactivated spending earns the base rate.`,
    enrollmentRequired > 0 && (enrollmentRequired === 1 ? "One of the listed credits requires enrollment before it works." : `${enrollmentRequired} of the listed credits require enrollment before they work.`),
    recurring.some((c) => c.frequency === "every_4_years") && "The Global Entry / TSA PreCheck-style credit renews only once every four years, so it adds little to the yearly math.",
    card.foreign_transaction_fee > 0 && `A ${card.foreign_transaction_fee}% foreign transaction fee applies to purchases processed outside the US.`,
    introFree && `The annual fee is waived only for the first year (${card.annual_fee_description}).`,
  ], 7);

  // ── FAQ ──────────────────────────────────────────────────────────────
  const faq: FaqItem[] = [];
  faq.push({
    question: `Does the ${p.short} have an annual fee?`,
    answer: fee === 0
      ? `No. Our record lists a $0 annual fee for the ${p.short}.`
      : introFree
        ? `It's $0 the first year, then ${usd(fee)} (${card.annual_fee_description}).`
        : `Yes — ${usd(fee)} a year, according to the issuer information in our record.`,
  });
  faq.push({
    question: `What does the ${p.short} earn?`,
    answer: p.top
      ? `${(card.earning_rates || []).filter((e) => !isBase(e)).slice(0, 4).map((e) => `${p.unit(e.rate)} on ${catLabel(e)}`).join(", ")}, and ${p.unit(p.baseRate)} on other purchases.${caps.length ? " Some bonus rates are capped; see the rules and gotchas above." : ""}`
      : `A flat ${p.unit(p.baseRate)} on purchases.`,
  });
  faq.push({
    question: `Is the ${p.short} worth it in the first year?`,
    answer: `Using our illustration (${usd(ILLUSTRATIVE_TOP_SPEND + ILLUSTRATIVE_OTHER_SPEND)} of yearly spending${p.top ? `, ${usd(ILLUSTRATIVE_TOP_SPEND)} of it in ${catLabel(p.top)}` : ""}), the first year comes out around ${usd(firstYearBeforeCredits)} before credits, including a welcome bonus valued at ${usd(welcome.value)}. ${ongoingBeforeCredits < 0 ? `In year two, rewards alone fall about ${usd(-ongoingBeforeCredits)} short of the fee, so credits and benefits have to close the gap.` : `Year two drops to about ${usd(ongoingBeforeCredits)} before credits.`}`,
  });
  if (card.foreign_transaction_fee > 0 || noFx) {
    faq.push({
      question: `Does the ${p.short} charge foreign transaction fees?`,
      answer: card.foreign_transaction_fee > 0
        ? `Yes, ${card.foreign_transaction_fee}% on purchases processed outside the US, so keep another card for travel abroad.`
        : `No. The ${p.short} is listed without a foreign transaction fee, which makes it usable abroad.`,
    });
  }
  if (credits && credits.faceValueAnnual > 0 && fee > 0) {
    faq.push({
      question: `Do the ${p.short}'s credits cover the annual fee?`,
      answer: `The listed credits add up to ${usd(credits.faceValueAnnual)} a year at face value against a ${usd(fee)} fee. Count only the credits you'd use without changing your spending${credits.enrollmentRequired ? `, and remember ${credits.enrollmentRequired === 1 ? "one needs" : `${credits.enrollmentRequired} need`} enrollment` : ""}.`,
    });
  }
  if (rules.length) {
    faq.push({
      question: `Are there application rules for the ${p.short}?`,
      answer: `${rules.map((r) => `${r.rule}: ${r.description.replace(/\.?\s*$/, ".")}`).join(" ")} Confirm the current terms with ${card.issuer} before applying.`,
    });
  }
  if (card.credit_required) {
    faq.push({
      question: `What credit do I need for the ${p.short}?`,
      answer: `Our record lists "${card.credit_required}" credit as the typical target for the ${p.short}.${p.segment === "business" ? " As a business card, the application also asks about the business." : p.segment === "secured" ? " It's a secured card, so a refundable deposit is part of the application." : p.segment === "student" ? " It's built for students, so a limited credit history is expected." : ""} ${card.issuer} makes the final decision based on its own criteria.`,
    });
  }

  return {
    summary,
    whoFor,
    skipIf,
    estimate: {
      assumptions,
      welcomeValue: welcome.value,
      welcomeNote: welcome.note,
      earningValue,
      firstYearFee,
      ongoingFee: fee,
      firstYearBeforeCredits,
      ongoingBeforeCredits,
    },
    credits,
    comparisons,
    gotchas,
    faq,
  };
}

export function faqJsonLd(faq: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
