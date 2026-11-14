// Client-safe helpers for rendering a card's welcome bonus. No fs imports.
import type { WelcomeOffer } from "./cards";
import { t, type Locale } from "./i18n";

export type WelcomeBonusKind = "points" | "cash" | "percent_discount" | "none";

const CASH_PROGRAM_RE = /cash|statement credit|dollar|gift card/i;

/**
 * Classify a welcome offer. An explicit `bonus_type` wins; otherwise a
 * bonus under 1,000 or a cash-style point_program is treated as a dollar
 * amount (the catalog stores "$200 cash back" as bonus_points=200), matching
 * recomputeEstimatedValue() in lib/cpp-rates.ts.
 */
export function welcomeBonusKind(w?: WelcomeOffer | null): WelcomeBonusKind {
  if (!w) return "none";
  if (w.bonus_type === "percent_discount") {
    return Number(w.discount_percent) > 0 ? "percent_discount" : "none";
  }
  const b = Number(w.bonus_points) || 0;
  if (b <= 0) return "none";
  if (w.bonus_type === "cash") return "cash";
  if (w.bonus_type === "points") return "points";
  return b < 1000 || CASH_PROGRAM_RE.test(w.point_program || "") ? "cash" : "points";
}

const PERCENT_OFF: Record<string, string> = {
  en: "{pct}% off first purchase",
  zh: "首次消費 {pct}% 折扣",
  "zh-cn": "首次消费 {pct}% 折扣",
  es: "{pct}% de descuento en la primera compra",
};

/** "$200", "75,000 pts", "30% off first purchase", or null when there is no bonus. */
export function formatWelcomeBonus(
  w: WelcomeOffer | null | undefined,
  lang: string = "en",
  pointsLabel: string = "pts",
): string | null {
  const kind = welcomeBonusKind(w);
  if (!w || kind === "none") return null;
  if (kind === "percent_discount") {
    return (PERCENT_OFF[lang] || PERCENT_OFF.en).replace("{pct}", String(w.discount_percent));
  }
  const b = Number(w.bonus_points);
  if (kind === "cash") return `$${b.toLocaleString("en-US")}`;
  return `${b.toLocaleString("en-US")} ${pointsLabel}`;
}

/** Points count for "most points" sorting; cash/percent offers sort as 0. */
export function welcomeBonusPoints(w?: WelcomeOffer | null): number {
  return welcomeBonusKind(w) === "points" ? Number(w!.bonus_points) : 0;
}

/** Dollar value used for scoring when estimated_value is missing. */
export function welcomeBonusDollarFallback(w?: WelcomeOffer | null): number {
  const kind = welcomeBonusKind(w);
  if (kind === "cash") return Number(w!.bonus_points);
  if (kind === "points") return Number(w!.bonus_points) / 100;
  return 0;
}

/**
 * True for "as high as" / varies-by-applicant offers: the issuer shows the
 * exact amount only after applying. These are stored as bonus_points 0 with
 * bonus_value "Varies", so welcomeBonusKind() says "none" and sorting/scoring
 * treat them as 0, but they must never be rendered as "no welcome offer".
 */
export function isVariableOffer(w?: Pick<WelcomeOffer, "offer_status" | "bonus_value"> | null): boolean {
  if (!w) return false;
  if (w.offer_status === "as_high_as_ymmv") return true;
  return typeof w.bonus_value === "string" && w.bonus_value.trim().toLowerCase() === "varies";
}

/**
 * The advertised maximum of a variable offer, formatted with the same
 * points/cash rules as formatWelcomeBonus() ("85,000 pts", "$200"), or null
 * when bonus_points_max is missing or not positive.
 */
export function formatVariableOfferMax(
  w: WelcomeOffer | null | undefined,
  lang: string = "en",
  pointsLabel: string = "pts",
): string | null {
  const max = Number(w?.bonus_points_max) || 0;
  if (!w || max <= 0) return null;
  return formatWelcomeBonus({ ...w, bonus_points: max, bonus_type: w.bonus_type === "percent_discount" ? undefined : w.bonus_type }, lang, pointsLabel);
}

function toLocale(lang: string): Locale {
  return (["en", "zh", "zh-cn", "es"] as const).includes(lang as Locale) ? (lang as Locale) : "en";
}

/**
 * Localized label for a variable offer: "As high as 85,000 pts · varies by
 * applicant", or "Varies by applicant, see issuer offer" without a maximum.
 * Returns null when the offer is not variable.
 */
export function formatVariableOffer(
  w: WelcomeOffer | null | undefined,
  lang: string = "en",
  pointsLabel?: string,
): string | null {
  if (!w || !isVariableOffer(w)) return null;
  const locale = toLocale(lang);
  const amount = formatVariableOfferMax(w, locale, pointsLabel ?? t("detail.points", locale));
  return amount ? t("detail.offerAsHighAs", locale, { amount }) : t("detail.offerVaries", locale);
}
