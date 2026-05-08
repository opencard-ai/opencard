/**
 * Classifies the risk level of a card update diff.
 *
 * All changes still go through as PRs; risk is just a triage label so the
 * reviewer can fast-path LOW (description tweaks) and scrutinise HIGH
 * (large numerical swings that often turn out to be LLM hallucinations or
 * the model picking up a stale value off a comparison table).
 *
 * 2026-05-06 dry-run pass showed several MED-classified extractions that
 * were actually wrong: amex-gold annual fee 325 → 160, chase-sapphire-
 * reserve annual_fee 795 → 550 + bonus 125K → 60K, chase-ink-biz-cash
 * 75K → 750. Tighten the bands so any large delta lands in HIGH, and walk
 * every change in the diff (the previous version returned on the first
 * change so a low-risk description tweak masked a HIGH bonus_points swing
 * later in the same diff).
 */

import type { DiffResult } from "./diff";
import type { RiskLevel } from "./config";

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MED: 1, HIGH: 2 };

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function classifyChange(change: DiffResult["changes"][number]): RiskLevel {
  switch (change.field) {
    case "annual_fee": {
      const from = Number(change.from) || 0;
      const to = Number(change.to) || 0;
      if (from === 0 && to > 0) return "HIGH"; // free → paid is suspicious
      if (from > 0 && to === 0) return "HIGH"; // paid → free is suspicious
      if (from > 0 && to > 0) {
        const pctDelta = (Math.abs(to - from) / from) * 100;
        if (pctDelta > 30) return "HIGH"; // 30%+ swing either direction
      }
      return "MED";
    }

    case "welcome_offer.bonus_points": {
      const from = Number(change.from) || 0;
      const to = Number(change.to) || 0;
      if (from > 0 && to > 0) {
        const pctDelta = (Math.abs(to - from) / from) * 100;
        if (pctDelta > 50) return "HIGH"; // 50%+ swing → almost always wrong
        if (pctDelta > 25) return "MED";
        return "LOW";
      }
      // 0 → N or N → 0 is a large logical change by definition
      if (from > 0 || to > 0) return "HIGH";
      return "MED";
    }

    case "welcome_offer.spending_requirement": {
      const from = Number(change.from) || 0;
      const to = Number(change.to) || 0;
      if (from > 0 && to > 0) {
        const pctDelta = (Math.abs(to - from) / from) * 100;
        if (pctDelta > 100) return "HIGH"; // doubling+ is suspicious
        if (pctDelta > 25) return "MED";
        return "LOW";
      }
      return "MED";
    }

    case "welcome_offer.description":
      return "LOW";

    case "welcome_offer.is_elevated":
      // Adds / removes a UI badge but doesn't change any $ value. The
      // anti-hallucination guard in extract.ts already filters
      // baseless flips, so reviewer triage stays MED.
      return "MED";

    case "welcome_offer.normal_bonus_points":
    case "welcome_offer.elevated_until":
      // Pure context fields, no $ impact.
      return "LOW";

    case "welcome_offer.free_nights": {
      // FNAs have real $ value (hundreds per night). Free → paid or
      // paid → free is a swing on par with bonus_points 0↔N.
      const from = Number(change.from) || 0;
      const to = Number(change.to) || 0;
      if (from === 0 && to > 0) return "HIGH";
      if (from > 0 && to === 0) return "HIGH";
      if (from > 0 && to > 0 && Math.abs(to - from) >= 2) return "HIGH";
      return "MED";
    }

    case "welcome_offer.free_night_value_cap":
      // Per-FNA cap moves the value but not whether you got the FNA.
      return "LOW";

    case "point_program":
    case "welcome_offer.point_program":
      return "HIGH";

    case "earning_rates":
      return "MED";

    default:
      return "MED";
  }
}

export function classifyRisk(diff: DiffResult): RiskLevel {
  let risk: RiskLevel = "LOW";
  for (const change of diff.changes) {
    risk = maxRisk(risk, classifyChange(change));
  }
  return risk;
}
