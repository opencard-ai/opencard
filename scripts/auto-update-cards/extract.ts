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

  let raw: string;
  try {
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
        // 16K. Bumped from 8K → 12K → 16K across the 2026-05-06 dry-runs:
        // amex-platinum / amex-blue-biz-plus / chase-ink-biz-cash /
        // chase-ink-biz-unlimited / chase-sapphire-reserve-biz still truncated
        // mid-string at 12K. The combination of M2.7 reasoning + the 482-line
        // legacy `data/ai-prompts/*` system prompt + a full JSON schema
        // (welcome_offer + earning_rates + recurring_credits + insurance + ...)
        // routinely needs ~10-14K output tokens.
        max_tokens: 16384,
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
    raw = data.choices?.[0]?.message?.content || "{}";

    // MiniMax M2.7 is a reasoning model and may emit <think>...</think>
    // tokens before the JSON payload. Strip them before parsing.
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!raw.startsWith("{")) {
      const firstBrace = raw.indexOf("{");
      if (firstBrace > 0) raw = raw.slice(firstBrace);
    }
  } catch (err) {
    throw new Error(`MiniMax API call failed: ${(err as Error).message}`);
  }

  // Parse JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`MiniMax returned invalid JSON: ${raw.slice(0, 200)}`);
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

  // Validate bonus_points appears as a number in HTML (with possible K/M suffixes)
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
      result.confidence *= 0.7; // Penalty: bonus number not in HTML
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
    "elevated_until": string|null       // ISO date YYYY-MM-DD if the page states an expiry, else null
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

  return `Extract structured data for this credit card from the page below.

Card: ${card.name}
Issuer: ${card.issuer}
${elevatedHint}

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

IMPORTANT: Include a verbatim "source_quote" ≥ 30 characters from the HTML that confirms the key data. The source_quote may be in any language as long as it is verbatim from the page.`;
}
