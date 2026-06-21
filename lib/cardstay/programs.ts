import type { CreditCard } from "@/lib/cards";
import type { ProgramCoverage, ProgramKey } from "./types";

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const PROGRAM_DEFINITIONS: Record<
  ProgramKey,
  {
    label: string;
    description: string;
    eligibleCardIds: string[];
    creditMatchers: string[];
  }
> = {
  amex_fhr: {
    label: "Amex Fine Hotels + Resorts",
    description: "Luxury hotel program available to eligible Amex premium cards.",
    eligibleCardIds: ["amex-platinum", "amex-biz-platinum", "amex-marriott-brilliant", "amex-morgan-stanley-platinum"],
    creditMatchers: ["hotel credit", "fhr", "fine hotels"],
  },
  amex_thc: {
    label: "Amex The Hotel Collection",
    description: "Two-night+ Amex travel hotel collection benefit for eligible premium cards.",
    eligibleCardIds: ["amex-platinum", "amex-biz-platinum", "amex-marriott-brilliant", "amex-morgan-stanley-platinum"],
    creditMatchers: ["hotel collection"],
  },
  chase_the_edit: {
    label: "Chase The Edit",
    description: "Chase luxury hotel program tied to Sapphire Reserve / JPMorgan Reserve family.",
    eligibleCardIds: ["chase-sapphire-reserve", "chase-sapphire-reserve-biz", "jpmorgan-reserve"],
    creditMatchers: ["the edit"],
  },
  capital_one_premier_collection: {
    label: "Capital One Premier Collection",
    description: "Capital One Travel hotel experience / premier collection benefits.",
    eligibleCardIds: ["capital-one-venture"],
    creditMatchers: ["capital one travel hotel experience credit", "premier collection"],
  },
  hilton_resort_credit: {
    label: "Hilton Resort Credit",
    description: "Hilton resort statement credit available on the Hilton Aspire family.",
    eligibleCardIds: ["amex-hilton-honors-aspire"],
    creditMatchers: ["hilton resort credit"],
  },
  hilton_free_night: {
    label: "Hilton Free Night / Weekend Night",
    description: "Annual Hilton free-night style benefits.",
    eligibleCardIds: ["amex-hilton-honors-aspire"],
    creditMatchers: ["free night reward", "weekend night", "free night"],
  },
};

export const PROGRAM_SEQUENCE: ProgramKey[] = [
  "amex_fhr",
  "amex_thc",
  "chase_the_edit",
  "capital_one_premier_collection",
  "hilton_resort_credit",
  "hilton_free_night",
];

export function isProgramKey(value: string): value is ProgramKey {
  return value in PROGRAM_DEFINITIONS;
}

export function getProgramDefinition(program: ProgramKey) {
  return PROGRAM_DEFINITIONS[program];
}

function getRecurringCreditNames(card: CreditCard): string[] {
  return (card.recurring_credits || []).map((credit) => credit.name || "");
}

function getHotelProgramSignals(card: CreditCard): string[] {
  const hotelProgram = card.hotel_program && typeof card.hotel_program === "object" ? card.hotel_program : null;
  if (!hotelProgram) return [];

  const signals: string[] = [];
  if (hotelProgram.fhr_eligible) signals.push("fhr");
  if (hotelProgram.thc_eligible) signals.push("hotel collection");
  if (hotelProgram.program) signals.push(hotelProgram.program);
  return signals;
}

export function cardMatchesProgram(card: CreditCard, program: ProgramKey): boolean {
  const definition = PROGRAM_DEFINITIONS[program];
  const recurringCredits = getRecurringCreditNames(card).map(normalize);
  const signals = [normalize(card.name), normalize(card.card_id), ...getHotelProgramSignals(card).map(normalize), ...recurringCredits];

  if (definition.eligibleCardIds.includes(card.card_id)) return true;

  return definition.creditMatchers.some((needle) => signals.some((signal) => signal.includes(normalize(needle))));
}

export function cardMatchesProgramBySignal(card: CreditCard, program: ProgramKey): boolean {
  const definition = PROGRAM_DEFINITIONS[program];
  return definition.eligibleCardIds.includes(card.card_id) || cardMatchesProgram(card, program);
}

export function buildCoverageIndex(records: ProgramCoverage[]): Record<ProgramKey, ProgramCoverage> {
  return records.reduce<Record<ProgramKey, ProgramCoverage>>((acc, record) => {
    acc[record.program] = record;
    return acc;
  }, {} as Record<ProgramKey, ProgramCoverage>);
}
