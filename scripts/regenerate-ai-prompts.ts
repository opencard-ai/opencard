/**
 * Regenerate per-card system prompts under data/ai-prompts/ from the
 * canonical card JSON in data/cards/.
 *
 * Why: the historical 73 prompt files were copy-pasted Amex-Platinum
 * boilerplate (annual_fee 895, 175K MR welcome, etc.) and only the
 * card name + cached HTML at the bottom were correct per card.
 * Deleting them outright dropped LLM extraction success 21/25 → 9/25
 * (handoff 2026-05-05 §335) because the cached HTML and source-quote
 * hints helped grounding. So we keep the cached HTML, drop the
 * boilerplate JSON, and replace it with a real example built from
 * data/cards/<id>.json.
 *
 *   npx tsx scripts/regenerate-ai-prompts.ts --dry    # preview
 *   npx tsx scripts/regenerate-ai-prompts.ts --apply  # write + delete orphans
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.join(process.cwd(), "data", "ai-prompts");
const CARDS_DIR = path.join(process.cwd(), "data", "cards");
const CONTENT_MARKER = "Content (first 12000 chars):";
const TRAILER = "Respond with JSON only. Do NOT include fields that are null or not found in the content.";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");

if (!DRY && !APPLY) {
  console.error("Pass --dry (preview) or --apply (write).");
  process.exit(1);
}

type AnyObj = Record<string, unknown>;
interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  network?: string;
  annual_fee?: number;
  foreign_transaction_fee?: number;
  credit_required?: string;
  welcome_offer?: AnyObj | null;
  earning_rates?: AnyObj[] | null;
  recurring_credits?: AnyObj[] | null;
  travel_benefits?: AnyObj | null;
  hotel_program?: AnyObj | null;
  insurance?: AnyObj | null;
  application_rules?: AnyObj | null;
  tags?: string[] | null;
  sources?: AnyObj[] | null;
}

const RULES_BLOCK = `Rules:
- issuer: American Express, Chase, Capital One, Citi, Discover, Wells Fargo, Barclays, Bank of America, US Bank, HSBC, etc.
- network: amex, visa, mastercard, discover
- annual_fee: number (0 if no annual fee)
- foreign_transaction_fee: number (0 if no fee)
- credit_required: Excellent, Good, Fair, Poor
- welcome_offer.bonus_points: number (0 if none)
- welcome_offer.point_program: MR, UR, TYP, Honors, Marriott, None, etc.
- earning_rates: array of {category, rate, notes}
  - category: Flights, Hotels, Dining, Groceries, Gas, Other, etc.
- recurring_credits: array of {name, amount, frequency, category, description, reset_type}
  - frequency: monthly|quarterly|semi_annual|annual|per_stay|cardmember_year
  - category: airline|hotel|travel|dining|groceries|gas|streaming|fitness|shopping|ride|digital|entertainment|credit_monitoring|other
  - reset_type: calendar_year (Jan-Dec) or cardmember_year (based on card anniversary)
  - NOTE: Free night awards go HERE (in recurring_credits), not in hotel_program
- travel_benefits.lounge_access: array of {name, type}
  - type: centurion, priority_pass, delta_skyclub, escape_lounge, plaza_premium, airspace, other
- travel_benefits.hotel_status: array of {program, tier, complimentary}
  - program: Marriott Bonvoy, Hilton Honors, IHG Rewards, World of Hyatt, etc.
- hotel_program: {program, tier, elite_night_credits, fhr_eligible, thc_eligible}
  - fhr_eligible/thc_eligible: only for Amex cards with FHR/THC benefits
  - NOTE: free_night_award does NOT go here, it goes in recurring_credits
- application_rules: {rules: [{rule, description}]}
  - rule examples: 5/24 rule, first approval, lifetime bonus rule, etc.
- tags: lounge-access, premium, transferable, no-af, cash-back, travel, hotel, airline, etc.
- sources: [{url}] - the URL this data was extracted from`;

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function buildExampleJson(card: Card): string {
  const example: AnyObj = {
    issuer: card.issuer ?? "",
    network: card.network ?? "",
    annual_fee: card.annual_fee ?? 0,
    foreign_transaction_fee: card.foreign_transaction_fee ?? 0,
    credit_required: card.credit_required ?? "Good",
  };
  if (isMeaningful(card.welcome_offer)) example.welcome_offer = card.welcome_offer;
  if (isMeaningful(card.earning_rates)) example.earning_rates = card.earning_rates;
  if (isMeaningful(card.recurring_credits)) example.recurring_credits = card.recurring_credits;
  if (isMeaningful(card.travel_benefits)) example.travel_benefits = card.travel_benefits;
  if (isMeaningful(card.hotel_program)) example.hotel_program = card.hotel_program;
  if (isMeaningful(card.insurance)) example.insurance = card.insurance;
  if (isMeaningful(card.application_rules)) example.application_rules = card.application_rules;
  if (isMeaningful(card.tags)) example.tags = card.tags;
  if (isMeaningful(card.sources)) {
    // Keep just url field — the example shouldn't drag in long notes blocks.
    example.sources = (card.sources as AnyObj[]).map((s) => ({ url: s.url }));
  }
  return JSON.stringify(example, null, 2);
}

function extractCachedContent(existingPrompt: string): string | null {
  const idx = existingPrompt.indexOf(CONTENT_MARKER);
  if (idx === -1) return null;
  // Everything from "Content (first 12000 chars):" through the trailer line.
  // We re-emit our own trailer to canonicalise, so cut before it if present.
  let tail = existingPrompt.slice(idx);
  const trailerIdx = tail.indexOf(TRAILER);
  if (trailerIdx !== -1) tail = tail.slice(0, trailerIdx).trimEnd();
  return tail;
}

function buildPrompt(card: Card, cachedContentBlock: string): string {
  const example = buildExampleJson(card);
  return [
    `You are extracting structured credit card data for "${card.name}" (${card.card_id}).`,
    "",
    "Extract ALL fields from the content below. Return ONLY valid JSON (no markdown, no explanation).",
    "",
    example,
    "",
    RULES_BLOCK,
    "",
    cachedContentBlock,
    "",
    TRAILER,
    "",
  ].join("\n");
}

const promptFiles = readdirSync(PROMPTS_DIR)
  .filter((f) => f.endsWith("-prompt.txt"))
  .sort();

let rewritten = 0;
let orphansDeleted = 0;
const orphans: string[] = [];
const noContentBlock: string[] = [];

for (const file of promptFiles) {
  const cardId = file.replace(/-prompt\.txt$/, "");
  const cardJsonPath = path.join(CARDS_DIR, `${cardId}.json`);
  const promptPath = path.join(PROMPTS_DIR, file);

  if (!existsSync(cardJsonPath)) {
    orphans.push(cardId);
    if (APPLY) {
      unlinkSync(promptPath);
      orphansDeleted++;
    }
    continue;
  }

  const card = JSON.parse(readFileSync(cardJsonPath, "utf8")) as Card;
  const existing = readFileSync(promptPath, "utf8");
  const cachedContent = extractCachedContent(existing);
  if (!cachedContent) {
    noContentBlock.push(cardId);
    continue;
  }

  const newPrompt = buildPrompt(card, cachedContent);
  if (APPLY) {
    writeFileSync(promptPath, newPrompt, "utf8");
  }
  rewritten++;
}

console.log(`\n${DRY ? "[DRY]" : "[APPLY]"} Summary:`);
console.log(`  rewritten:        ${rewritten}`);
console.log(`  orphans:          ${orphans.length}${APPLY ? ` (deleted: ${orphansDeleted})` : ""}`);
if (orphans.length) console.log(`    → ${orphans.join(", ")}`);
if (noContentBlock.length) {
  console.log(`  missing content:  ${noContentBlock.length}`);
  console.log(`    → ${noContentBlock.join(", ")}`);
}
