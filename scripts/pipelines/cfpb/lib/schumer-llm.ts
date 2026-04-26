/**
 * Schumer Box LLM extractor.
 *
 * Replaces the regex-based scripts/pipelines/cfpb/archive/schumer_extractor_v2.py
 * which matched "12 monthly billing cycles" boilerplate as annual_fee on
 * Amex agreements (causing the 2026-04-25 corruption).
 *
 * Input:  raw text extracted from a CFPB cardmember agreement PDF (first 1-2 pages)
 * Output: structured Schumer Box fields, validated and sanity-gated
 *
 * Architecture:
 *   - Prompt is explicit about distinguishing real fees from boilerplate
 *   - JSON-mode response (no markdown wrapping)
 *   - Per-field validation (numbers in plausible ranges)
 *   - checkSanity() from fact-store before returning
 *   - confidence is 0.95 if all fields pass; lower if any get rejected
 */

import { callMiniMaxJson, MiniMaxError } from "../../../../lib/llm-minimax";
import { checkSanity } from "../../../../lib/fact-store";

export interface SchumerBoxRaw {
  annual_fee: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  foreign_transaction_fee_pct: number | null;
  apr_purchases_min: number | null;
  apr_purchases_max: number | null;
  apr_cash_advances: number | null;
  penalty_apr: number | null;
  late_fee_max: number | null;
  cash_advance_fee_pct: number | null;
  cash_advance_fee_min: number | null;
  card_canonical_name: string | null;
  /** Free-text reason if model couldn't find a field. */
  notes: string | null;
}

export interface SchumerBoxExtraction {
  fields: SchumerBoxRaw;
  /** Per-field validation results. */
  validation: Record<keyof SchumerBoxRaw, { ok: boolean; reason?: string }>;
  /** Average confidence: 0.95 if all valid, 0.5 if any fail sanity, 0 if no fields. */
  confidence: number;
  /** Token usage (for cost tracking). */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const SYSTEM_PROMPT = `You are extracting Schumer Box data from US credit card cardmember agreements (filed with the CFPB Credit Card Agreement Database). The Schumer Box is the legally-mandated table of fees and APRs at the start of every agreement.

Output format: ONLY a JSON object matching the requested schema. No markdown fences, no commentary.

Critical rules to avoid common parsing errors:
1. annual_fee is the ANNUAL membership fee charged for holding the card. It is NOT:
   - "12" from "12 monthly billing cycles" or "12 months"
   - The number of statement periods
   - APR percentage shown nearby
   - Pay Over Time interest rate
   If the agreement says "$0 to $550 depending on credit limit" without a single value, set annual_fee=null and annual_fee_min/max accordingly.

2. foreign_transaction_fee_pct is the PERCENTAGE (e.g. 2.7 for "2.7%"). If "None" or "0%", use 0. Cap at 5 — anything higher is a parsing error.

3. APRs are FIXED ANNUAL PERCENTAGE RATES.
   - "29.99%" → 29.99 (not 0.2999)
   - If the agreement expresses the APR as a formula like "Prime Rate + 12.74%", "Prime + 21.74%", or any other variable-rate formula tied to Prime Rate / SOFR / LIBOR, set the APR field to null and put the formula in the notes field.
   - NEVER return the margin (the X in "Prime + X%") as the APR — that is a parsing error. The margin is not the APR.
   - Only return a numeric APR if the agreement gives a single fixed annual percentage that does not vary with an external index.

4. If you can't find a field with high confidence, return null for that field and explain in the notes field.

5. card_canonical_name is the OFFICIAL product name from the agreement title or first line. E.g. "The Platinum Card from American Express" or "Wells Fargo Active Cash Visa Card". Strip "Cardmember Agreement", trademark symbols, and trailing periods.`;

const USER_PROMPT_TEMPLATE = (text: string) => `Extract the Schumer Box from this US credit card cardmember agreement. Return ONLY a JSON object with this schema:

{
  "annual_fee": number | null,
  "annual_fee_min": number | null,
  "annual_fee_max": number | null,
  "foreign_transaction_fee_pct": number | null,
  "apr_purchases_min": number | null,
  "apr_purchases_max": number | null,
  "apr_cash_advances": number | null,
  "penalty_apr": number | null,
  "late_fee_max": number | null,
  "cash_advance_fee_pct": number | null,
  "cash_advance_fee_min": number | null,
  "card_canonical_name": string | null,
  "notes": string | null
}

If a field is a single value, populate annual_fee. If it's a range (e.g. "$0 to $550"), populate annual_fee_min and annual_fee_max and set annual_fee=null.

Agreement text:
\`\`\`
${text.slice(0, 8000)}
\`\`\``;

function isSchumerBoxRaw(x: unknown): x is SchumerBoxRaw {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  // Just check keys exist (any may be null)
  return (
    "annual_fee" in o &&
    "foreign_transaction_fee_pct" in o &&
    "card_canonical_name" in o
  );
}

/**
 * Extract Schumer Box from agreement PDF text.
 * Throws MiniMaxError on LLM/network failure. Returns extraction with
 * per-field validation.
 */
export async function extractSchumerBox(pdfText: string): Promise<SchumerBoxExtraction> {
  if (pdfText.length < 200) {
    throw new MiniMaxError(`PDF text too short (${pdfText.length} chars) — likely a parse failure or empty PDF`);
  }

  const { value, raw } = await callMiniMaxJson<SchumerBoxRaw>({
    prompt: USER_PROMPT_TEMPLATE(pdfText),
    systemPrompt: SYSTEM_PROMPT,
    model: "MiniMax-M2",
    // M2 is a reasoning model — chain-of-thought eats completion tokens before
    // the JSON output. 4000 leaves headroom for ~3000 reasoning + ~500 JSON.
    maxTokens: 4000,
    temperature: 0,
    validate: isSchumerBoxRaw,
  });

  // Validate each field
  const validation = validateSchumerBox(value);
  const passCount = Object.values(validation).filter((v) => v.ok).length;
  const failCount = Object.keys(validation).length - passCount;
  // Confidence: 0.95 if everything passes, drop 0.05 per failure, floor at 0.3
  const confidence = Math.max(0.3, 0.95 - 0.05 * failCount);

  return { fields: value, validation, confidence, usage: raw.usage };
}

/** Validate each field against type + range expectations. */
function validateSchumerBox(s: SchumerBoxRaw): SchumerBoxExtraction["validation"] {
  const v: SchumerBoxExtraction["validation"] = {} as never;

  // annual_fee uses fact-store sanity
  v.annual_fee =
    s.annual_fee === null
      ? { ok: true }
      : checkSanity("annual_fee", s.annual_fee);
  v.annual_fee_min = numberInRange("annual_fee_min", s.annual_fee_min, 0, 10000);
  v.annual_fee_max = numberInRange("annual_fee_max", s.annual_fee_max, 0, 10000);

  v.foreign_transaction_fee_pct =
    s.foreign_transaction_fee_pct === null
      ? { ok: true }
      : checkSanity("foreign_transaction_fee", s.foreign_transaction_fee_pct);

  v.apr_purchases_min = numberInRange("apr_purchases_min", s.apr_purchases_min, 0, 50);
  v.apr_purchases_max = numberInRange("apr_purchases_max", s.apr_purchases_max, 0, 50);
  v.apr_cash_advances = numberInRange("apr_cash_advances", s.apr_cash_advances, 0, 50);

  v.penalty_apr =
    s.penalty_apr === null
      ? { ok: true }
      : checkSanity("penalty_apr", s.penalty_apr);

  v.late_fee_max = numberInRange("late_fee_max", s.late_fee_max, 0, 100);
  v.cash_advance_fee_pct = numberInRange("cash_advance_fee_pct", s.cash_advance_fee_pct, 0, 10);
  v.cash_advance_fee_min = numberInRange("cash_advance_fee_min", s.cash_advance_fee_min, 0, 50);

  v.card_canonical_name =
    s.card_canonical_name === null || (typeof s.card_canonical_name === "string" && s.card_canonical_name.length >= 3)
      ? { ok: true }
      : { ok: false, reason: `card_canonical_name too short or missing` };

  v.notes = { ok: true };

  return v;
}

function numberInRange(field: string, value: unknown, min: number, max: number) {
  if (value === null) return { ok: true };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: `${field}: not a finite number (got ${typeof value})` };
  }
  if (value < min || value > max) {
    return { ok: false, reason: `${field}=${value} outside [${min}, ${max}]` };
  }
  return { ok: true };
}

/**
 * Map SchumerBoxRaw fields to FactEvent field_paths. Used by extract.ts
 * to emit one FactEvent per non-null field.
 */
export function fieldPathsFromExtraction(s: SchumerBoxRaw): Array<{ field_path: string; value: unknown }> {
  const out: Array<{ field_path: string; value: unknown }> = [];
  if (s.annual_fee !== null) out.push({ field_path: "annual_fee", value: s.annual_fee });
  if (s.foreign_transaction_fee_pct !== null) out.push({ field_path: "foreign_transaction_fee", value: s.foreign_transaction_fee_pct });
  if (s.apr_purchases_min !== null) out.push({ field_path: "apr_purchases_min", value: s.apr_purchases_min });
  if (s.apr_purchases_max !== null) out.push({ field_path: "apr_purchases_max", value: s.apr_purchases_max });
  if (s.apr_cash_advances !== null) out.push({ field_path: "apr_cash_advances", value: s.apr_cash_advances });
  if (s.penalty_apr !== null) out.push({ field_path: "penalty_apr", value: s.penalty_apr });
  if (s.late_fee_max !== null) out.push({ field_path: "late_fee_max", value: s.late_fee_max });
  if (s.cash_advance_fee_pct !== null) out.push({ field_path: "cash_advance_fee_pct", value: s.cash_advance_fee_pct });
  if (s.cash_advance_fee_min !== null) out.push({ field_path: "cash_advance_fee_min", value: s.cash_advance_fee_min });
  return out;
}
