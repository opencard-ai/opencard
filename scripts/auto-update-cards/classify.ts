/**
 * Classifies the risk level of a card update diff.
 * All changes go through PR regardless of risk level.
 */

import type { DiffResult } from "./diff";
import type { RiskLevel } from "./config";

export function classifyRisk(diff: DiffResult): RiskLevel {
  const { changes } = diff;

  for (const change of changes) {
    switch (change.field) {
      case "annual_fee": {
        const from = Number(change.from) || 0;
        const to = Number(change.to) || 0;
        if (to > from && from > 0) {
          const pctIncrease = ((to - from) / from) * 100;
          if (pctIncrease > 50) return "HIGH";
        }
        return "MED"; // Any annual fee change
      }

      case "welcome_offer.bonus_points": {
        const from = Number(change.from) || 0;
        const to = Number(change.to) || 0;
        if (to < from && from > 0) {
          const pctDrop = ((from - to) / from) * 100;
          if (pctDrop > 25) return "HIGH";
        }
        if (to > from && from > 0) {
          const pctIncrease = ((to - from) / from) * 100;
          if (pctIncrease <= 25) return "LOW";
        }
        return "MED";
      }

      case "welcome_offer.spending_requirement": {
        const from = Number(change.from) || 0;
        const to = Number(change.to) || 0;
        if (from > 0 && to > from) {
          const pctIncrease = ((to - from) / from) * 100;
          if (pctIncrease <= 10) return "LOW";
          return "MED";
        }
        return "MED";
      }

      case "welcome_offer.description": {
        return "LOW";
      }

      case "point_program":
      case "welcome_offer.point_program": {
        return "HIGH";
      }

      case "earning_rates": {
        return "MED";
      }

      default: {
        // Unknown field — conservative MED
        return "MED";
      }
    }
  }

  return "LOW"; // Default fallback
}
