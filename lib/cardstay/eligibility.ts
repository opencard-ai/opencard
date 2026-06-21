import type { CreditCard } from "@/lib/cards";
import { cardMatchesProgram, getProgramDefinition } from "./programs";
import { mergeConfidence, overallStatus, scoreEligibility } from "./scoring";
import type { BenefitEligibility, BenefitVerdict, Place, ProgramCoverage, ProgramKey } from "./types";

function makeReasons(program: ProgramKey, matchedCardNames: string[]): string[] {
  const definition = getProgramDefinition(program);
  if (matchedCardNames.length === 0) {
    return [`No wallet card matched ${definition.label}`];
  }
  return matchedCardNames.map((name) => `${name} matches ${definition.label}`);
}

function makeWarnings(program: ProgramKey, matchedCardNames: string[]): string[] {
  if (matchedCardNames.length === 0) return [];

  switch (program) {
    case "amex_fhr":
    case "amex_thc":
      return ["Book through the qualifying Amex travel path."];
    case "chase_the_edit":
      return ["Booking rules and package inclusion can vary by property."];
    case "capital_one_premier_collection":
      return ["Access depends on the Capital One Travel booking flow."];
    case "hilton_resort_credit":
      return ["The credit is property-specific and may require prepayment or eligible folios."];
    case "hilton_free_night":
      return ["Free-night certificates usually have room-category and expiry constraints."];
  }
}

function sourceSnapshot(coverage: ProgramCoverage) {
  return {
    url: coverage.source_url,
    label: coverage.label,
    last_verified: coverage.last_verified,
    notes: coverage.notes,
  };
}

export function resolveProgramEligibility(cards: CreditCard[], coverage: ProgramCoverage): BenefitEligibility {
  const matchingCards = cards.filter((card) => cardMatchesProgram(card, coverage.program));
  const matchedCardIds = matchingCards.map((card) => card.card_id);
  const matchedCardNames = matchingCards.map((card) => card.name);
  const hasMaybeSignal = cards.some((card) => {
    const cardText = `${card.name} ${card.card_id} ${(card.recurring_credits || []).map((credit) => credit.name).join(" ")}`.toLowerCase();
    return coverage.supporting_credit_terms?.some((term) => cardText.includes(term.toLowerCase())) ?? false;
  });

  const status = matchingCards.length > 0 ? "eligible" : hasMaybeSignal ? "maybe" : "not_eligible";
  const confidence = matchingCards.length > 0 ? mergeConfidence([coverage.confidence]) : coverage.confidence;
  const eligible = matchingCards.length > 0;
  const fit_label = scoreEligibility(eligible ? 1 : 0, hasMaybeSignal ? 1 : 0, confidence);

  return {
    program: coverage.program,
    status,
    fit_label,
    confidence,
    matched_card_ids: matchedCardIds,
    reasons: makeReasons(coverage.program, matchedCardNames),
    warnings: makeWarnings(coverage.program, matchedCardNames),
    sources: [sourceSnapshot(coverage)],
  };
}

export function resolvePlaceVerdict(
  cards: CreditCard[],
  place: Place,
  coverageIndex: Record<ProgramKey, ProgramCoverage>,
): BenefitVerdict {
  const eligible_benefits = place.programs.map((program) => resolveProgramEligibility(cards, coverageIndex[program]));
  const eligibleBenefits = eligible_benefits.filter((benefit) => benefit.status === "eligible");
  const maybeBenefits = eligible_benefits.filter((benefit) => benefit.status === "maybe");
  const unavailable_benefits = eligible_benefits.filter((benefit) => benefit.status !== "eligible");

  const confidence = mergeConfidence([place.confidence, ...eligible_benefits.map((benefit) => benefit.confidence)]);
  const fit_label = scoreEligibility(eligibleBenefits.length, maybeBenefits.length, confidence);
  const status = overallStatus(eligibleBenefits.length, maybeBenefits.length);

  return {
    place_id: place.place_id,
    slug: place.slug,
    name: place.name,
    city: place.city,
    programs: place.programs,
    fit_label,
    confidence,
    status,
    eligible_benefits: eligibleBenefits,
    unavailable_benefits,
    summary: place.summary,
  };
}
