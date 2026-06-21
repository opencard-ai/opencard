export type ProgramKey =
  | "amex_fhr"
  | "amex_thc"
  | "chase_the_edit"
  | "capital_one_premier_collection"
  | "hilton_resort_credit"
  | "hilton_free_night";

export const PROGRAM_KEYS: ProgramKey[] = [
  "amex_fhr",
  "amex_thc",
  "chase_the_edit",
  "capital_one_premier_collection",
  "hilton_resort_credit",
  "hilton_free_night",
];

export type EligibilityStatus = "eligible" | "maybe" | "not_eligible";
export type ConfidenceLevel = "high" | "medium" | "low";
export type FitLabel = "trophy_fit" | "great_fit" | "credit_fit" | "weak_fit" | "not_eligible";

export interface SourceSnapshot {
  url: string;
  label?: string;
  last_verified: string;
  notes?: string;
}

export interface PlaceAlias {
  name: string;
  source_url?: string;
}

export interface BookingChannel {
  name: string;
  url: string;
  kind: "official" | "program" | "third_party";
  notes?: string;
}

export interface ProgramCoverage {
  program: ProgramKey;
  label: string;
  source_url: string;
  last_verified: string;
  confidence: ConfidenceLevel;
  eligible_card_ids: string[];
  supporting_credit_terms?: string[];
  booking_channels?: BookingChannel[];
  notes?: string;
}

export interface Place {
  place_id: string;
  slug: string;
  name: string;
  type: "hotel" | "resort" | "suite" | "other";
  city: string;
  region?: string;
  country: string;
  programs: ProgramKey[];
  source_url: string;
  last_verified: string;
  confidence: ConfidenceLevel;
  summary: string;
  aliases?: PlaceAlias[];
  lat?: number;
  lng?: number;
  tags?: string[];
}

export interface BenefitEligibility {
  program: ProgramKey;
  status: EligibilityStatus;
  fit_label: FitLabel;
  confidence: ConfidenceLevel;
  matched_card_ids: string[];
  reasons: string[];
  warnings: string[];
  sources: SourceSnapshot[];
}

export interface BenefitVerdict {
  place_id: string;
  slug: string;
  name: string;
  city: string;
  programs: ProgramKey[];
  fit_label: FitLabel;
  confidence: ConfidenceLevel;
  status: EligibilityStatus;
  eligible_benefits: BenefitEligibility[];
  unavailable_benefits: BenefitEligibility[];
  summary: string;
}

export interface SavedPlace {
  place_id: string;
  saved_at: string;
  note?: string;
}

export interface PlaceAlert {
  place_id: string;
  alert_type: "price_drop" | "benefit_change" | "availability";
  created_at: string;
  enabled: boolean;
}
