/**
 * Computes field-level diff between the catalog card and scraped AI-extracted data.
 * Returns null if no meaningful changes.
 */

import type { Card } from "./cards-loader";
import type { ExtractedData } from "./extract";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DiffResult {
  card_id: string;
  changes: FieldChange[];
  confidence: number;
  source_url: string;
  scraped_at: string;
}

export function diffCard(card: Card, extracted: ExtractedData): DiffResult | null {
  const changes: FieldChange[] = [];

  // Annual fee
  if (extracted.annual_fee !== null && extracted.annual_fee !== undefined) {
    const currentFee = card.annual_fee;
    if (extracted.annual_fee !== currentFee) {
      changes.push({ field: "annual_fee", from: currentFee, to: extracted.annual_fee });
    }
  }

  // Welcome offer
  const wo = extracted.welcome_offer;
  const currentWo = card.welcome_offer;

  if (wo) {
    if (wo.bonus_points !== null && wo.bonus_points !== undefined) {
      const current = currentWo?.bonus_points;
      if (wo.bonus_points !== current) {
        changes.push({ field: "welcome_offer.bonus_points", from: current ?? null, to: wo.bonus_points });
      }
    }

    if (wo.spending_requirement !== null && wo.spending_requirement !== undefined) {
      const current = currentWo?.spending_requirement;
      if (wo.spending_requirement !== current) {
        changes.push({ field: "welcome_offer.spending_requirement", from: current ?? null, to: wo.spending_requirement });
      }
    }

    if (wo.time_period_months !== null && wo.time_period_months !== undefined) {
      const current = currentWo?.time_period_months;
      if (wo.time_period_months !== current) {
        changes.push({ field: "welcome_offer.time_period_months", from: current ?? null, to: wo.time_period_months });
      }
    }

    if (wo.description !== null && wo.description !== undefined) {
      const current = currentWo?.description;
      if (current !== undefined && wo.description !== current) {
        changes.push({ field: "welcome_offer.description", from: current, to: wo.description });
      }
    }

    if (wo.point_program !== null && wo.point_program !== undefined) {
      const current = currentWo?.point_program;
      if (current !== undefined && wo.point_program !== current) {
        changes.push({ field: "welcome_offer.point_program", from: current, to: wo.point_program });
      }
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    card_id: card.card_id,
    changes,
    confidence: extracted.confidence,
    source_url: "",
    scraped_at: new Date().toISOString(),
  };
}
