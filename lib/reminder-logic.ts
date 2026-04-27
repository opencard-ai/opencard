/**
 * Reminder bucketing logic for the recurring_credits cron.
 *
 * Pure functions — no Redis / network. Testable in isolation.
 *
 * Bucketing rule:
 *   - "thisMonth"     → credit is in the FIRST 7 days of its current period (freshly available)
 *   - "expiringSoon"  → credit is in the LAST 14 days of its current period
 *   - null            → mid-period (no reminder this run)
 *
 * Window semantics matched to the cron schedule (1st & 20th of each month).
 * On day-1 firing: thisMonth captures fresh credits, expiringSoon captures
 * any non-monthly cycle ending in the next 2 weeks.
 * On day-20 firing: expiringSoon captures end-of-period credits, thisMonth
 * captures none (we already alerted on day-1).
 *
 * Frequencies handled:
 *   monthly        — every calendar month
 *   quarterly      — Q1 (Jan-Mar) / Q2 (Apr-Jun) / Q3 (Jul-Sep) / Q4 (Oct-Dec)
 *   semi_annual    — H1 (Jan-Jun) / H2 (Jul-Dec)
 *   annual         — calendar year OR anniversary (per reset_type)
 *   cardmember_year— anniversary year (always anniversary-based)
 *   every_4_years  — anniversary-based, requires cardOpenDate
 *   per_stay       — no scheduled reminder (returns null)
 */

export type Frequency =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "cardmember_year"
  | "every_4_years"
  | "per_stay";

export type ResetType = "calendar_year" | "anniversary" | "quarterly" | "monthly";

export type Bucket = "thisMonth" | "expiringSoon";

export interface CreditPeriod {
  start: Date;
  end: Date;
}

export interface BucketingInput {
  frequency: Frequency | string;
  reset_type?: ResetType | string;
  /** ISO date string of the user's card open date — required for anniversary-based credits. */
  cardOpenDate?: string;
}

const MS_PER_DAY = 86_400_000;
const FRESH_WINDOW_DAYS = 7;
const EXPIRING_WINDOW_DAYS = 14;

/** Convenience: parse `cardOpenDate` (ISO or YYYY-MM-DD or {month, year}). */
export function parseOpenDate(input: unknown): Date | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof input === "object" && input !== null) {
    const o = input as { month?: number; year?: number; day?: number };
    if (typeof o.month === "number" && typeof o.year === "number") {
      // month is 1-indexed in user storage, JS Date wants 0-indexed
      return new Date(o.year, o.month - 1, o.day ?? 1);
    }
  }
  return undefined;
}

/**
 * Compute the current period's [start, end] inclusive.
 * Returns null when the credit type doesn't have a scheduled period
 * (e.g. per_stay) or when required data is missing (e.g. anniversary
 * without cardOpenDate).
 */
export function periodBoundaries(
  input: BucketingInput,
  now: Date,
): CreditPeriod | null {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const cardOpenDate = parseOpenDate(input.cardOpenDate);

  switch (input.frequency) {
    case "monthly": {
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0, 23, 59, 59), // last day of month
      };
    }

    case "quarterly": {
      const qStartMonth = Math.floor(month / 3) * 3; // 0, 3, 6, 9
      return {
        start: new Date(year, qStartMonth, 1),
        end: new Date(year, qStartMonth + 3, 0, 23, 59, 59),
      };
    }

    case "semi_annual": {
      const hStartMonth = month < 6 ? 0 : 6;
      return {
        start: new Date(year, hStartMonth, 1),
        end: new Date(year, hStartMonth + 6, 0, 23, 59, 59),
      };
    }

    case "annual": {
      // Calendar year by default; anniversary if reset_type asks for it
      if (input.reset_type === "anniversary" && cardOpenDate) {
        return anniversaryPeriod(cardOpenDate, now, 1);
      }
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31, 23, 59, 59),
      };
    }

    case "cardmember_year": {
      // Always anniversary-based — requires cardOpenDate
      if (!cardOpenDate) return null;
      return anniversaryPeriod(cardOpenDate, now, 1);
    }

    case "every_4_years": {
      if (!cardOpenDate) return null;
      return anniversaryPeriod(cardOpenDate, now, 4);
    }

    case "per_stay":
      return null;

    default:
      return null;
  }
}

/** Compute the current N-year period that contains `now`, anchored on cardOpenDate. */
function anniversaryPeriod(open: Date, now: Date, years: number): CreditPeriod {
  // Find the latest anniversary that is <= now
  let start = new Date(now.getFullYear(), open.getMonth(), open.getDate());
  if (start > now) {
    start = new Date(now.getFullYear() - 1, open.getMonth(), open.getDate());
  }
  // If years=4, walk back to align with the open year's cycle
  if (years > 1) {
    const yearsSinceOpen = start.getFullYear() - open.getFullYear();
    const cycle = Math.floor(yearsSinceOpen / years);
    start = new Date(open.getFullYear() + cycle * years, open.getMonth(), open.getDate());
  }
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + years);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Returns "thisMonth" / "expiringSoon" / null for a single credit at a given moment. */
export function bucketCredit(input: BucketingInput, now: Date): Bucket | null {
  const period = periodBoundaries(input, now);
  if (!period) return null;
  if (now < period.start || now > period.end) return null; // outside any period (shouldn't happen)

  const daysSinceStart = Math.floor((now.getTime() - period.start.getTime()) / MS_PER_DAY);
  const daysUntilEnd = Math.floor((period.end.getTime() - now.getTime()) / MS_PER_DAY);

  if (daysSinceStart <= FRESH_WINDOW_DAYS) return "thisMonth";
  if (daysUntilEnd <= EXPIRING_WINDOW_DAYS) return "expiringSoon";
  return null;
}
