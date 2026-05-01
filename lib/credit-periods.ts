/**
 * Period key computation for recurring_credits check-off.
 *
 * Each user check-off entry is keyed by (card_id, credit_key, period_key).
 * The period_key is derived from the credit's frequency + the date the user
 * marks it used. Same logic must run server-side (API validation) and
 * client-side (UI labels), so it lives here.
 *
 * Period semantics:
 *   monthly         → "YYYY-MM"           (calendar month)
 *   quarterly       → "YYYY-Qn"           (calendar quarter, Q1=Jan-Mar)
 *   semi_annual     → "YYYY-Hn"           (calendar half, H1=Jan-Jun)
 *   annual          → "YYYY"              (calendar year)
 *   cardmember_year → "CMY-YYYY"          (anniversary year of card open;
 *                                          falls back to calendar year if
 *                                          cardOpenedAt is missing)
 *   every_4_years   → "YYYY"              (year-of-use, since the user only
 *                                          has 4 years to redeem; rolling
 *                                          renewal is per-redemption)
 *   per_stay        → null                (uncountable; UI should not offer
 *                                          a check-off button)
 */

export type Frequency =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "cardmember_year"
  | "every_4_years"
  | "per_stay";

export interface CardOpenDate {
  /** 0-indexed month (0 = Jan), to match the existing open_dates payload. */
  month: number;
  year: number;
}

/**
 * Compute the period_key for a given frequency at a given date.
 * Returns null if the frequency is not check-off-able (e.g. per_stay).
 */
export function computePeriodKey(
  frequency: string,
  date: Date = new Date(),
  cardOpenedAt?: CardOpenDate,
): string | null {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-11

  switch (frequency) {
    case "monthly":
      return `${y}-${String(m + 1).padStart(2, "0")}`;

    case "quarterly": {
      const q = Math.floor(m / 3) + 1; // Q1..Q4
      return `${y}-Q${q}`;
    }

    case "semi_annual": {
      const h = m < 6 ? 1 : 2;
      return `${y}-H${h}`;
    }

    case "annual":
      return String(y);

    case "cardmember_year": {
      if (!cardOpenedAt) return String(y); // fallback: calendar year
      // Anniversary year: starts at cardOpenedAt.month each year.
      const before = m < cardOpenedAt.month;
      const anniversaryYear = before ? y - 1 : y;
      return `CMY-${anniversaryYear}`;
    }

    case "every_4_years":
      // Just tag with the year of use; the next renewal is 4 years from
      // that redemption per user (TSA/GE policy), not a fixed cohort.
      return String(y);

    case "per_stay":
      return null;

    default:
      // Unknown frequency: degrade to calendar year so we don't crash.
      return String(y);
  }
}

/** Check whether a frequency is eligible for user check-off. */
export function isCheckoffable(frequency: string): boolean {
  return frequency !== "per_stay";
}

/**
 * Human-readable label for a period_key, e.g. for UI display.
 * Pure presentation — server stores the raw key.
 */
export function formatPeriodKey(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-");
    const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
      month: "short",
    });
    return `${monthName} ${y}`;
  }
  if (/^\d{4}-Q\d$/.test(key)) return key.replace("-", " "); // "2026 Q2"
  if (/^\d{4}-H\d$/.test(key)) return key.replace("-", " "); // "2026 H1"
  if (/^CMY-\d{4}$/.test(key)) return key.replace("CMY-", "Member yr ");
  if (/^\d{4}$/.test(key)) return key;
  return key;
}
