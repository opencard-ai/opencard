/**
 * Cents-per-point (CPP) values for normalising welcome-offer estimated values.
 *
 * Source: TPG / Reddit r/churning consensus medians, mid-2025 valuations.
 * Each value is a "market baseline" — what a typical user (not a power-user
 * gaming first-class redemptions) can realistically extract as cash-equivalent
 * value per point.
 *
 * When in doubt, default to 1.0 cpp (cash-equivalent). Do NOT use aspirational
 * 3-5cpp valuations from sweet-spot redemption guides — those mislead users
 * about actual achievable value.
 */

const DEFAULT_CPP = 1.0;

interface ProgramRule {
  match: (p: string) => boolean;
  cpp: number;
  /** For `lib/cpp-rates.ts` debug / catalog audit. */
  label?: string;
}

const RULES: ProgramRule[] = [
  // ── Transferable points (high-value flexible currencies) ───────────────
  { match: (p) => p.includes("membership rewards"), cpp: 1.7, label: "Amex MR" },
  { match: (p) => p.includes("ultimate rewards"), cpp: 1.7, label: "Chase UR" },
  { match: (p) => p.includes("bilt"), cpp: 1.7, label: "Bilt" },
  { match: (p) => p.includes("thankyou"), cpp: 1.7, label: "Citi TY" },
  { match: (p) => p.includes("capital one") && p.includes("miles"), cpp: 1.5, label: "Cap One Miles" },
  { match: (p) => p.includes("aeroplan"), cpp: 1.5, label: "Aeroplan" },

  // ── Hotel programs ────────────────────────────────────────────────────
  { match: (p) => p.includes("hyatt"), cpp: 1.7, label: "Hyatt" },
  { match: (p) => p.includes("marriott") || p.includes("bonvoy"), cpp: 0.65, label: "Marriott" },
  { match: (p) => p.includes("hilton"), cpp: 0.5, label: "Hilton" },
  { match: (p) => p.includes("ihg"), cpp: 0.5, label: "IHG" },
  { match: (p) => p.includes("choice privileges"), cpp: 0.6, label: "Choice" },
  { match: (p) => p.includes("royal caribbean"), cpp: 0.5, label: "Royal Caribbean" },
  { match: (p) => p.includes("wyndham"), cpp: 1.0, label: "Wyndham" },

  // ── Airline mileage programs ──────────────────────────────────────────
  { match: (p) => p.includes("united") || p.includes("mileageplus"), cpp: 1.35, label: "United" },
  { match: (p) => p.includes("delta") || p.includes("skymiles"), cpp: 1.0, label: "Delta" },
  { match: (p) => p.includes("aadvantage") || p.includes("american airlines"), cpp: 1.65, label: "AAdvantage" },
  { match: (p) => p.includes("alaska") || p.includes("atmos"), cpp: 1.4, label: "Alaska" },
  { match: (p) => p.includes("rapid rewards") || p.includes("southwest"), cpp: 1.4, label: "Southwest" },
  { match: (p) => p.includes("trueblue") || p.includes("jetblue"), cpp: 1.3, label: "JetBlue" },
  { match: (p) => p.includes("avios"), cpp: 1.3, label: "Avios" },
  { match: (p) => p.includes("flying blue"), cpp: 1.2, label: "Flying Blue" },
  { match: (p) => p.includes("skywards"), cpp: 1.4, label: "Emirates Skywards" },
  { match: (p) => p.includes("frontier"), cpp: 1.0, label: "Frontier" },
  { match: (p) => p.includes("spirit") && p.includes("free spirit"), cpp: 1.0, label: "Spirit" },
  { match: (p) => p.includes("hawaiian"), cpp: 1.0, label: "Hawaiian" },

  // ── Cash-back style 1:1 programs ─────────────────────────────────────
  { match: (p) => p.includes("discover cashback") || p.includes("discover miles"), cpp: 1.0, label: "Discover" },
  // Generic catch-all for cash-style: $1 = 1 unit, return 1.0.
  // Listed here in priority order so transferable-MR doesn't fall through.
];

/**
 * Look up the cents-per-point for a welcome offer's point_program.
 * Returns 1.0 when the program is unknown (cash-equivalent baseline).
 */
export function getCpp(program: string | undefined | null): number {
  if (!program) return DEFAULT_CPP;
  const p = program.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.match(p)) return rule.cpp;
  }
  return DEFAULT_CPP;
}

/** True if the program name signals a cash-style bonus where the
 *  `bonus_points` field actually carries a dollar amount (e.g. "$250 cash
 *  back match" stored as bonus_points=250). */
function isCashProgram(program: string | null | undefined): boolean {
  if (!program) return false;
  const p = program.toLowerCase();
  return (
    p.includes("cash") ||
    p.includes("statement credit") ||
    p.includes("dollar") ||
    p === "verizon dollars"
  );
}

/**
 * Recompute estimated_value for a welcome offer using the canonical CPP table.
 * Handles two storage conventions in the catalog:
 *   1. Real point bonuses (50k+ MR / UR / etc.) → multiply by program CPP
 *   2. Cash-style bonuses where bonus_points carries a dollar count
 *      ("$250 sign-up bonus" stored as bonus_points=250). Detected by
 *      program name OR by magnitude heuristic (< 1000 is too small to be
 *      a real points promo).
 * Returns null when inputs are insufficient.
 */
export function recomputeEstimatedValue(
  bonusPoints: number | null | undefined,
  pointProgram: string | null | undefined,
): number | null {
  if (!Number.isFinite(Number(bonusPoints)) || Number(bonusPoints) <= 0) return null;
  const pts = Number(bonusPoints);
  if (isCashProgram(pointProgram)) return pts;
  // Real point welcome promos start at ~10k. Anything under 1000 is a
  // miscategorised dollar amount in the catalog.
  if (pts < 1000) return pts;
  const cpp = getCpp(pointProgram);
  return Math.round((pts * cpp) / 100);
}
