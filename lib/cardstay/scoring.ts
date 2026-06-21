import type { ConfidenceLevel, EligibilityStatus, FitLabel } from "./types";

export function mergeConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

export function scoreEligibility(eligibleCount: number, maybeCount: number, confidence: ConfidenceLevel): FitLabel {
  if (eligibleCount >= 2 && confidence === "high") return "trophy_fit";
  if (eligibleCount >= 2) return "great_fit";
  if (eligibleCount === 1) return "credit_fit";
  if (maybeCount > 0) return "weak_fit";
  return "not_eligible";
}

export function overallStatus(eligibleCount: number, maybeCount: number): EligibilityStatus {
  if (eligibleCount > 0) return "eligible";
  if (maybeCount > 0) return "maybe";
  return "not_eligible";
}
