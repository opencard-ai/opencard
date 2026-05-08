/**
 * Uses MiniMax to extract structured card data from scraped HTML.
 * Includes hallucination defenses: source_quote validation + confidence scoring.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "path";
import type { Card } from "./cards-loader";
import { CONFIG } from "./config";

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";
const MINIMAX_MODEL = "MiniMax-M2.7";

export interface ExtractedData {
  welcome_offer: {
    bonus_points: number | null;
    spending_requirement: number | null;
    time_period_months: number | null;
    description: string | null;
    point_program: string | null;
    /** Set true when the page advertises this as a limited-time / increased
     * / all-time-high offer above the card's normal baseline. Backed by
     * detectElevatedSignals() to avoid LLM hallucination. */
    is_elevated?: boolean | null;
    /** The card's standard / non-promo bonus when the page mentions both
     * the regular and the elevated number (often via strike-through). */
    normal_bonus_points?: number | null;
    /** ISO date (YYYY-MM-DD) the elevated offer is expected to expire,
     * if the page states one. */
    elevated_until?: string | null;
    /** Hotel co-brand welcome-offer Free Night Awards (FNAs). Total count
     * across all spend tiers (e.g. "3 FNAs after $6K + 2 more after $9K"
     * → 5). Null on non-hotel cards or hotel cards whose welcome is points-
     * only. Anniversary / cardmember-year FNAs go in recurring_credits,
     * NOT here. */
    free_nights?: number | null;
    /** Per-FNA points cap (e.g. 50,000 for Marriott Bonvoy Biz, 40,000
     * for IHG Premier). Null when the FNA is uncapped / any-night
     * (e.g. Hilton Aspire). */
    free_night_value_cap?: number | null;
  } | null;
  annual_fee: number | null;
  earning_rates: { category: string; rate: number; notes: string | null }[] | null;
  confidence: number;
  source_quote: string;
  source_quote_in_html: boolean;
  raw_thinking?: string;
}

/** Phrases that strongly indicate the page is advertising an elevated /
 * limited-time welcome offer. Hand-tuned over DoC / TPG / USCCG language. */
const ELEVATED_PHRASES = [
  // "increased (the) (welcome) offer", "raised the welcome bonus", etc.
  /\b(?:increased|raised|boosted|elevated)\s+(?:the\s+|its\s+|their\s+)?(?:welcome\s+|public\s+|targeted\s+|new[-\s]cardmember\s+)?(?:offer|bonus)\b/i,
  /\b(?:welcome\s+)?(?:offer|bonus)\s+(?:has\s+)?(?:been\s+)?(?:increased|raised|boosted|elevated)\b/i,
  /\blimited[-\s]time\b/i,
  /\b(?:all[-\s]time|highest[-\s]ever|best[-\s]ever)\s+(?:offer|bonus|high)?\b/i,
  /\bhighest\s+(?:we'?ve\s+)?(?:ever\s+)?seen\b/i,
];

const EXPIRY_PATTERNS = [
  // "offer ends 5/31/2026" / "ending 6/30/2026" / "valid through May 31, 2026"
  // / "expires 5-31-26" / "through DATE" / "until DATE"
  /\b(?:offer\s+ends|ending|valid\s+(?:through|until)|expires?|through|until)\s+(?:on\s+)?(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
];

export interface ElevatedSignals {
  matched: boolean;
  phrases: string[];
  expiry_hint: string | null;
}

export function detectElevatedSignals(html: string): ElevatedSignals {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const phrases: string[] = [];
  for (const re of ELEVATED_PHRASES) {
    const m = stripped.match(re);
    if (m) phrases.push(m[0]);
  }
  let expiry_hint: string | null = null;
  for (const re of EXPIRY_PATTERNS) {
    const m = stripped.match(re);
    if (m) { expiry_hint = m[1]; break; }
  }
  return { matched: phrases.length > 0, phrases, expiry_hint };
}

/** Free-Night-Award patterns: hotel co-brand cards include FNAs in their
 * welcome offer (e.g. "Earn 5 Free Night Awards after $X spend"). We
 * separately detect anniversary / cardmember-year FNAs that belong in
 * recurring_credits, not the welcome offer, so the LLM can scope
 * correctly. */
const FNA_COUNT_PATTERNS = [
  /\b(\d+)\s+free[\s-]night\s+(?:award|certificate|stay)s?\b/i,
  /\b(\d+)\s+free\s+night(?:s)?\b/i,
];
const FNA_CAP_PATTERNS = [
  // "up to 50,000 points (each|per night)" — direct cap statement
  /\bup\s+to\s+([\d,]+)\s*[Kk]?\s+(?:points?|pts?)\s+(?:each|per\s+night|nightly|value)\b/i,
  // "redeemable up to 50K points each" / "good for properties costing up to 40,000 points" /
  // "valid at properties up to 40K"
  /\b(?:redeemable|valid|good)\s+(?:at|for|in)?\s*(?:properties\s+)?(?:up\s+to\s+|costing\s+up\s+to\s+)([\d,]+)\s*[Kk]?\s+points?\b/i,
];
// Match anniversary keyword adjacent (within 80 chars, either direction) to a
// "free night" mention. Anniversary FNAs belong in recurring_credits, not the
// welcome offer; we surface the flag so the LLM (and the prompt's anti-
// hallucination guidance) knows to keep it out of free_nights.
const ANNIVERSARY_FNA_PATTERNS = [
  /\b(?:anniversary|cardmember[-\s]year|each\s+year|every\s+year|annual(?:ly)?)\b[^.]{0,80}\bfree[-\s]night/i,
  /\bfree[-\s]night[^.]{0,80}\b(?:anniversary|cardmember[-\s]year|each\s+year|every\s+year|annual(?:ly)?)\b/i,
];

export interface FnaSignals {
  matched: boolean;
  count_hint: number | null;
  cap_hint: number | null;
  has_anniversary_fna: boolean;
}

export function detectFreeNightSignals(html: string): FnaSignals {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  let count_hint: number | null = null;
  for (const re of FNA_COUNT_PATTERNS) {
    const m = stripped.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n < 50) { // sanity: no card gives 50+ FNAs
        count_hint = n;
        break;
      }
    }
  }
  let cap_hint: number | null = null;
  for (const re of FNA_CAP_PATTERNS) {
    const m = stripped.match(re);
    if (m) {
      const raw = m[1].replace(/,/g, "");
      let n = parseInt(raw, 10);
      // If the matched span contains a literal K/k right after the number,
      // treat as thousands.
      if (/[\d,]+\s*[Kk]\s+(?:points?|pts?)/.test(m[0])) n *= 1000;
      if (n >= 1000 && n <= 200000) { // FNA caps range roughly 25K–100K
        cap_hint = n;
        break;
      }
    }
  }
  const has_anniversary_fna = ANNIVERSARY_FNA_PATTERNS.some((re) => re.test(stripped));
  return {
    matched: count_hint !== null,
    count_hint,
    cap_hint,
    has_anniversary_fna,
  };
}

/**
 * One MiniMax round-trip + JSON parse. Returned `truncated=true` means the
 * model ran out of output tokens — the caller can retry with a larger
 * budget. Other errors throw.
 */
async function callMiniMax(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ parsed: Record<string, unknown> } | { truncated: true; raw: string }> {
  const response = await fetch(MINIMAX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    }),
    // 120s, not 60s. Round 1 added 60s to fix indefinite hangs, but Amex
    // cards (and any card with a long custom prompt under data/ai-prompts/)
    // routinely take 60-90s for the full reasoning + 8K-token JSON output.
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MiniMax API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  let raw = data.choices?.[0]?.message?.content || "{}";

  // MiniMax M2.7 is a reasoning model and may emit <think>...</think>
  // tokens before the JSON payload. Strip them before parsing.
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!raw.startsWith("{")) {
    const firstBrace = raw.indexOf("{");
    if (firstBrace > 0) raw = raw.slice(firstBrace);
  }

  try {
    return { parsed: JSON.parse(raw) };
  } catch {
    // Cheap heuristic: a JSON object that doesn't end in `}` (after trim)
    // almost certainly got cut mid-string by the max_tokens budget. The
    // 2026-05-07 jitter measurement saw 20-40% of runs land here.
    const trimmed = raw.trimEnd();
    const looksTruncated = trimmed.length > 0 && !trimmed.endsWith("}");
    if (looksTruncated) return { truncated: true, raw };
    throw new Error(`MiniMax returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

export async function extractCardData(
  card: Card,
  html: string,
  sourceUrl: string
): Promise<ExtractedData> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY env var not set");
  }

  // Try to load a pre-built prompt for this card
  const promptPath = path.join(process.cwd(), "data/ai-prompts", `${card.card_id}-prompt.txt`);
  const systemPrompt = existsSync(promptPath)
    ? readFileSync(promptPath, "utf8")
    : buildGenericSystemPrompt(card);

  const userPrompt = buildExtractPrompt(card, html);

  // 16K is the standard budget. Bumped 8K → 12K → 16K across the 2026-05-06
  // dry-runs as truncation kept biting Amex / Chase Ink Biz cards. The
  // 2026-05-07 jitter measurement still saw 20-40% truncation rate at 16K
  // (chase-sapphire-preferred 2/5, amex-gold 1/5), so on truncation we
  // retry once at 24K rather than fail the card silently.
  let parsed: Record<string, unknown>;
  try {
    const first = await callMiniMax(apiKey, systemPrompt, userPrompt, 16384);
    if ("parsed" in first) {
      parsed = first.parsed;
    } else {
      // Truncated at 16K. Retry once at 24K. If that ALSO truncates, bubble
      // the original raw fragment up so the runner records it as an error
      // (existing index.ts logic) instead of silently writing partial data.
      console.warn(`   ⚠️  Truncated JSON at 16K tokens for ${card.card_id}; retrying at 24K`);
      const retry = await callMiniMax(apiKey, systemPrompt, userPrompt, 24576);
      if ("parsed" in retry) {
        parsed = retry.parsed;
      } else {
        throw new Error(`MiniMax returned invalid JSON (truncated at both 16K and 24K): ${retry.raw.slice(0, 200)}`);
      }
    }
  } catch (err) {
    throw new Error(`MiniMax API call failed: ${(err as Error).message}`);
  }

  const result = parsed as unknown as ExtractedData;

  // ── Hallucination defenses ───────────────────────────────────────────────

  // Validate source_quote is actually in the raw HTML
  const strippedHtml = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const quoteNormalized = (result.source_quote || "").toLowerCase().trim();
  result.source_quote_in_html =
    quoteNormalized.length >= CONFIG.MIN_QUOTE_LENGTH &&
    strippedHtml.includes(quoteNormalized.slice(0, 50));

  if (!result.source_quote_in_html) {
    result.confidence *= 0.5; // Penalty: quote not found in HTML
  }

  // Validate bonus_points appears as a number in HTML (with possible K/M
  // suffixes). Previously this just shaved confidence by 0.7, but the
  // 2026-05-07 jitter run on chase-sapphire-preferred showed the LLM
  // returning 60K and 100K on the same Chase page when neither number
  // appears verbatim in the HTML (true offer is 75K). A confidence
  // shave doesn't keep wrong values out of the diff — only a hard
  // reject does. So: if the LLM bonus number can't be located in the
  // page, null out the field AND penalise confidence. Downstream diff
  // skips fields that are null/undefined.
  const bonusPoints = result.welcome_offer?.bonus_points;
  if (bonusPoints && bonusPoints > 0) {
    const htmlNumbers = strippedHtml.match(/\d[\d,]+/g) || [];
    const bonusStr = bonusPoints >= 1000
      ? `${(bonusPoints / 1000).toFixed(0)}K`
      : String(bonusPoints);
    const bonusFound = htmlNumbers.some((n: string) =>
      n.replace(",", "").includes(bonusStr) || bonusStr.includes(n.replace(",", ""))
    );
    if (!bonusFound) {
      result.confidence *= 0.5;
      if (result.welcome_offer) {
        result.welcome_offer.bonus_points = null;
      }
    }
  }

  // Anti-hallucination guard for is_elevated. The LLM tends to over-call
  // "is_elevated: true" any time the welcome offer looks generous. Force
  // it back to false unless we have concrete evidence on the page —
  // either a tagged elevated phrase or an explicit normal_bonus_points
  // baseline that the current bonus exceeds.
  if (result.welcome_offer?.is_elevated) {
    const signals = detectElevatedSignals(html);
    const wo = result.welcome_offer;
    const hasBaselineDelta =
      typeof wo.normal_bonus_points === "number" &&
      typeof wo.bonus_points === "number" &&
      wo.normal_bonus_points > 0 &&
      wo.bonus_points > wo.normal_bonus_points * 1.1; // ≥ 10% above baseline
    if (!signals.matched && !hasBaselineDelta) {
      result.welcome_offer.is_elevated = false;
      result.welcome_offer.elevated_until = null;
    }
  }

  // Anti-hallucination guard for free_nights. The LLM mistakes anniversary /
  // cardmember-year free-night certificates (which are recurring credits)
  // for welcome FNAs. Require the regex pre-scan to have actually matched
  // an "N Free Night Awards" pattern in the page; otherwise force back to
  // null. Cap mismatch is non-fatal — the LLM may correctly extract a cap
  // the regex couldn't parse.
  if (typeof result.welcome_offer?.free_nights === "number" &&
      result.welcome_offer.free_nights > 0) {
    const fna = detectFreeNightSignals(html);
    if (!fna.matched) {
      // No "N Free Night(s)" pattern on the page → likely an anniversary
      // FNA the LLM mis-routed.
      result.welcome_offer.free_nights = null;
      result.welcome_offer.free_night_value_cap = null;
    } else if (fna.count_hint !== null &&
               Math.abs(fna.count_hint - result.welcome_offer.free_nights) >= 3) {
      // Pre-scan and LLM disagree by 3+ — penalise confidence but trust
      // LLM since the regex sees only the FIRST match.
      result.confidence *= 0.85;
    }
  }

  return result;
}

function buildGenericSystemPrompt(card: Card): string {
  return `You are an expert credit card analyst. Extract structured data from the provided credit card terms page.
Extract ONLY factual information visible in the page. If you cannot find a field, set it to null.
Never invent or estimate values. If uncertain, set confidence below 0.7.

Output a JSON object with this exact schema:
{
  "welcome_offer": {
    "bonus_points": number|null,
    "spending_requirement": number|null,
    "time_period_months": number|null,
    "description": string|null,
    "point_program": string|null,
    "is_elevated": boolean|null,        // true ONLY if the page calls this an increased / limited-time / all-time-high / best-ever offer
    "normal_bonus_points": number|null, // the standard non-promo bonus, when both are shown (e.g. struck-through old number)
    "elevated_until": string|null,      // ISO date YYYY-MM-DD if the page states an expiry, else null
    "free_nights": number|null,         // welcome-offer Free Night Awards (sum across spend tiers); null on non-hotel cards
    "free_night_value_cap": number|null // per-FNA points cap (e.g. 50000), null when uncapped/any-night
  },
  "annual_fee": number|null,
  "earning_rates": [{ "category": string, "rate": number, "notes": string|null }]|null,
  "confidence": number (0-1, higher = more confident),
  "source_quote": "A verbatim quote from the page ≥ 30 chars that supports the key data",
  "source_quote_in_html": boolean (always false, you cannot verify)
}`;
}

/**
 * Strip strike-through markup so the LLM sees only the current/new values
 * when an issuer page advertises an upgrade as
 *   `Earn <strike>125,000</strike> 150,000 points`.
 * 2026-05-06 dry-run had Chase Sapphire Reserve extracting the struck-through
 * old offer (125K) instead of the live one (150K). Removing the entire
 * struck-through element (including its text content) avoids that ambiguity.
 */
function stripStrikethrough(html: string): string {
  // <span class="strikeThrough">…</span> and similar (Chase pattern)
  html = html.replace(
    /<(\w+)\b[^>]*class="[^"]*strike[Tt]hrough[^"]*"[^>]*>[\s\S]*?<\/\1>/g,
    ""
  );
  // <del>…</del>, <s>…</s>
  html = html.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, "");
  html = html.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, "");
  // Inline style: text-decoration: line-through
  html = html.replace(
    /<(\w+)\b[^>]*style="[^"]*line-through[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  return html;
}

function buildExtractPrompt(card: Card, html: string): string {
  const cleanedHtml = stripStrikethrough(html);
  // Truncate HTML to first 80KB to avoid token limits
  const truncatedHtml = cleanedHtml.length > 80000 ? cleanedHtml.slice(0, 80000) + "\n[TRUNCATED]" : cleanedHtml;

  // Run the regex pre-detector against the ORIGINAL html (before strike-
  // through stripping) so we can pass the LLM a pre-computed hint about
  // whether this page is advertising the offer as elevated. The post-
  // process guard above is the authoritative check; this hint just
  // primes the LLM so it doesn't have to scan for the phrase itself.
  const signals = detectElevatedSignals(html);
  const elevatedHint = signals.matched
    ? `\nPre-scan detected elevated-offer phrasing on the page: ${signals.phrases.map((p) => `"${p}"`).join(", ")}.${signals.expiry_hint ? ` Possible expiry: ${signals.expiry_hint}.` : ""} Treat this as a strong prior for is_elevated=true and capture elevated_until / normal_bonus_points if visible.`
    : `\nPre-scan found no elevated-offer phrasing. Default is_elevated=false unless the page itself clearly says otherwise.`;

  const fna = detectFreeNightSignals(html);
  const fnaHint = fna.matched
    ? `\nPre-scan detected ${fna.count_hint} Free Night Award(s) in the welcome offer${fna.cap_hint ? ` (per-FNA cap ~${fna.cap_hint.toLocaleString()} pts)` : ""}. Sum across spend tiers if the page lists multiple thresholds. ${fna.has_anniversary_fna ? "The page also mentions an anniversary/cardmember-year free night — that one is a recurring credit, NOT a welcome FNA, so do NOT add it to free_nights." : ""}`.trim()
    : `\nPre-scan found no welcome-offer Free Night Awards. Default free_nights=null unless the page clearly advertises FNAs as part of the welcome bonus (separately from any anniversary night, which is a recurring credit).`;

  return `Extract structured data for this credit card from the page below.

Card: ${card.name}
Issuer: ${card.issuer}
${elevatedHint}
${fnaHint}

The scraped HTML is the canonical source — extract values from there, not
from any prior knowledge. If a value appears multiple times (e.g. an upgraded
offer alongside the older one in disclosures or comparison tables), prefer the
value that is presented as the live marketing offer near the top of the page
or in the primary "Earn …" call-to-action.

Output language: ALL string fields ("description", "notes", "source_quote",
"point_program", "category" labels, etc.) must be in English. Even if the
source page is in Chinese (uscreditcardguide.com pages are bilingual), write
the description in English. Translate / summarise; do not echo Chinese text.

Scraped HTML (first 80KB):
---
${truncatedHtml}
---

Return a JSON object with the schema described in the system prompt. Focus on:
1. Current welcome offer (bonus points, spending requirement, time period)
2. Annual fee
3. Earning rates by category
4. welcome_offer.is_elevated — true ONLY if the page itself uses language like
   "increased offer", "limited time", "all-time high", "best ever", or shows a
   strike-through previous bonus next to a higher new one. Do NOT mark elevated
   just because the bonus seems generous.
5. welcome_offer.normal_bonus_points — populate when both the standard and
   promo numbers are shown (e.g. struck-through 60K beside live 100K).
6. welcome_offer.elevated_until — ISO date YYYY-MM-DD if the page states an
   expiry; null otherwise.
7. welcome_offer.free_nights — for hotel co-brand cards, the TOTAL number of
   Free Night Awards (FNAs) in the welcome offer, summed across all spend
   tiers (e.g. "3 FNAs after $6K + 2 more after $9K" → 5). Null on non-hotel
   cards or hotel cards whose welcome is points-only. Do NOT include
   anniversary / cardmember-year free nights here — those are recurring
   credits.
8. welcome_offer.free_night_value_cap — per-FNA points cap if stated
   (e.g. 50000 for "redeemable up to 50,000 points each"); null when the
   FNA is uncapped / any-night (e.g. Hilton Aspire's any-night cert).

IMPORTANT: Include a verbatim "source_quote" ≥ 30 characters from the HTML that confirms the key data. The source_quote may be in any language as long as it is verbatim from the page.`;
}
