/**
 * Unit tests for the CardStay MVP scaffold.
 *
 * Run: npx tsx scripts/test-cardstay-eligibility.ts
 */
import cardsData from "../data/cardstay/program-coverage.seed.json";
import placesData from "../data/cardstay/places.seed.json";
import { getCardById } from "../lib/cards";
import { buildCoverageIndex } from "../lib/cardstay/programs";
import { resolvePlaceVerdict, resolveProgramEligibility } from "../lib/cardstay/eligibility";

const coverageIndex = buildCoverageIndex(cardsData as any);
const places = placesData as any[];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`✗ ${label}`);
  }
}

assert(places.length >= 5, "seed places include at least five hotels");
assert(Object.keys(coverageIndex).length === 6, "coverage seed includes six programs");

const platinum = getCardById("amex-platinum");
const csr = getCardById("chase-sapphire-reserve");
const venture = getCardById("capital-one-venture");
const aspire = getCardById("amex-hilton-honors-aspire");

if (!platinum || !csr || !venture || !aspire) {
  console.error("Missing expected cards in local catalog");
  process.exit(1);
}

const bellagio = places.find((place) => place.place_id === "place_bellagio_las_vegas");
const conrad = places.find((place) => place.place_id === "place_conrad_las_vegas");
const tokyo = places.find((place) => place.place_id === "place_park_hyatt_tokyo");
const hilton = places.find((place) => place.place_id === "place_hilton_hawaiian_village");

if (!bellagio || !conrad || !tokyo || !hilton) {
  console.error("Missing expected seed places");
  process.exit(1);
}

assert(
  resolveProgramEligibility([platinum], coverageIndex.amex_fhr).status === "eligible",
  "Amex Platinum is eligible for FHR",
);
assert(
  resolveProgramEligibility([csr], coverageIndex.chase_the_edit).status === "eligible",
  "Chase Sapphire Reserve is eligible for The Edit",
);
assert(
  resolveProgramEligibility([venture], coverageIndex.capital_one_premier_collection).status === "eligible",
  "Capital One Venture is eligible for Premier Collection",
);
assert(
  resolveProgramEligibility([aspire], coverageIndex.hilton_resort_credit).status === "eligible",
  "Hilton Aspire is eligible for Hilton Resort Credit",
);
assert(
  resolveProgramEligibility([aspire], coverageIndex.hilton_free_night).status === "eligible",
  "Hilton Aspire is eligible for Hilton Free Night",
);

const bellagioVerdict = resolvePlaceVerdict([platinum, venture], bellagio, coverageIndex);
assert(bellagioVerdict.eligible_benefits.length >= 2, "Bellagio seed returns multi-program eligibility");
assert(bellagioVerdict.fit_label === "trophy_fit" || bellagioVerdict.fit_label === "great_fit", "Bellagio gets a strong fit label");

const hiltonVerdict = resolvePlaceVerdict([aspire], hilton, coverageIndex);
assert(hiltonVerdict.status === "eligible", "Hilton Hawaiian Village is eligible with Aspire");
assert(hiltonVerdict.eligible_benefits.length === 2, "Hilton Hawaiian Village matches both Hilton benefits");

const tokyoVerdict = resolvePlaceVerdict([csr], tokyo, coverageIndex);
assert(tokyoVerdict.status === "eligible", "Park Hyatt Tokyo is eligible with CSR");

if (failed > 0) {
  console.log(`\n${passed}/${passed + failed} passed`);
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}

console.log(`\n${passed}/${passed + failed} passed`);
console.log("✅ CardStay scaffold tests passed");
