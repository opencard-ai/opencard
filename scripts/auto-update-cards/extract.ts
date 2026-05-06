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
  } | null;
  annual_fee: number | null;
  earning_rates: { category: string; rate: number; notes: string | null }[] | null;
  confidence: number;
  source_quote: string;
  source_quote_in_html: boolean;
  raw_thinking?: string;
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
        // 12K, not 8K. Cards with longer custom prompts (data/ai-prompts/*)
        // plus full schema output were truncating mid-string at 8K — most
        // recently chase-sapphire-reserve and chase-sapphire-reserve-biz on
        // the 2026-05-06 dry-run. Headroom for M2.7 reasoning + JSON.
        max_tokens: 12288,
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

  return result;
}

function buildGenericSystemPrompt(card: Card): string {
  return `You are an expert credit card analyst. Extract structured data from the provided credit card terms page.
Extract ONLY factual information visible in the page. If you cannot find a field, set it to null.
Never invent or estimate values. If uncertain, set confidence below 0.7.

Output a JSON object with this exact schema:
{
  "welcome_offer": { "bonus_points": number|null, "spending_requirement": number|null, "time_period_months": number|null, "description": string|null, "point_program": string|null },
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

  return `Extract structured data for this credit card from the page below.

Card: ${card.name}
Issuer: ${card.issuer}

The scraped HTML is the canonical source — extract values from there, not
from any prior knowledge. If a value appears multiple times (e.g. an upgraded
offer alongside the older one in disclosures or comparison tables), prefer the
value that is presented as the live marketing offer near the top of the page
or in the primary "Earn …" call-to-action.

Scraped HTML (first 80KB):
---
${truncatedHtml}
---

Return a JSON object with the schema described in the system prompt. Focus on:
1. Current welcome offer (bonus points, spending requirement, time period)
2. Annual fee
3. Earning rates by category

IMPORTANT: Include a verbatim "source_quote" ≥ 30 characters from the HTML that confirms the key data.`;
}
