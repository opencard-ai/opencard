import places from "@/data/cardstay/places.seed.json";
import coverage from "@/data/cardstay/program-coverage.seed.json";
import { getAllCards, getCardById, type CreditCard } from "@/lib/cards";
import { buildCoverageIndex, PROGRAM_SEQUENCE } from "./programs";
import { resolvePlaceVerdict } from "./eligibility";
import type { BenefitVerdict, Place, ProgramCoverage, ProgramKey } from "./types";

export const CARDSTAY_PLACES = places as Place[];
export const CARDSTAY_PROGRAM_COVERAGE = coverage as ProgramCoverage[];
export const CARDSTAY_COVERAGE_INDEX = buildCoverageIndex(CARDSTAY_PROGRAM_COVERAGE);

export function getCardstayPlaces(): Place[] {
  return CARDSTAY_PLACES;
}

export function getCardstayPlace(placeIdOrSlug: string): Place | null {
  return CARDSTAY_PLACES.find((place) => place.place_id === placeIdOrSlug || place.slug === placeIdOrSlug) || null;
}

export function getWalletCardsByIds(cardIds: string[]): CreditCard[] {
  const ids = new Set(cardIds.filter(Boolean));
  return getAllCards().filter((card) => ids.has(card.card_id));
}

export function getWalletCardsFromEmail(email?: string | null): CreditCard[] {
  if (!email) return [];
  // Read-only scaffold: in MVP we don't resolve by email here. API handlers can
  // hydrate user card IDs from their own auth source or accept explicit card_ids.
  return [];
}

export function makePlaceVerdicts(cards: CreditCard[], query?: string, programs?: ProgramKey[]): BenefitVerdict[] {
  const q = query?.trim().toLowerCase() || "";
  const filterPrograms = programs?.length ? new Set(programs) : null;

  return CARDSTAY_PLACES
    .filter((place) => {
      if (filterPrograms && !place.programs.some((program) => filterPrograms.has(program))) return false;
      if (!q) return true;
      const haystack = [place.name, place.city, place.region, place.country, ...(place.tags || []), ...(place.aliases || []).map((alias) => alias.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .map((place) => resolvePlaceVerdict(cards, place, CARDSTAY_COVERAGE_INDEX))
    .sort((a, b) => {
      const score = (v: BenefitVerdict) => (v.fit_label === "trophy_fit" ? 0 : v.fit_label === "great_fit" ? 1 : v.fit_label === "credit_fit" ? 2 : v.fit_label === "weak_fit" ? 3 : 4);
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
}

export function listProgramCoverage(programs: ProgramKey[] = PROGRAM_SEQUENCE): ProgramCoverage[] {
  return programs.map((program) => CARDSTAY_COVERAGE_INDEX[program]).filter(Boolean);
}

export function getPlaceVerdict(placeIdOrSlug: string, cards: CreditCard[]): BenefitVerdict | null {
  const place = getCardstayPlace(placeIdOrSlug);
  if (!place) return null;
  return resolvePlaceVerdict(cards, place, CARDSTAY_COVERAGE_INDEX);
}
