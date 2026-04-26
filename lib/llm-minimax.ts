/**
 * Generic MiniMax client for LLM tasks (Schumer Box, recurring credits,
 * welcome offers, etc.).
 *
 * Reads MINIMAX_API_KEY from process.env. Never accept the key as a function
 * argument — every caller goes through env so we can't accidentally log it.
 *
 * Usage:
 *   import { callMiniMax } from "@/lib/llm-minimax";
 *   const text = await callMiniMax({
 *     prompt: "...",
 *     model: "MiniMax-M2",
 *     responseFormat: "json",
 *   });
 *
 * Cost (as of 2026-04 flat-fee subscription): marginal $0 / call.
 * If the plan changes to metered, expect ~$0.005 / Schumer Box call (3k in + 500 out).
 */

const ENDPOINT = "https://api.minimax.io/v1/chat/completions";

export interface MiniMaxOptions {
  prompt: string;
  systemPrompt?: string;
  model?: "MiniMax-M2" | "MiniMax-M2.7" | string;
  maxTokens?: number;
  temperature?: number;
  /** "json" sets response_format to json_object — model returns valid JSON only. */
  responseFormat?: "text" | "json";
  /** Abort the request after this many milliseconds. Default 60s. */
  timeoutMs?: number;
}

export interface MiniMaxResponse {
  text: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  finish_reason?: string;
}

export class MiniMaxError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "MiniMaxError";
  }
}

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    throw new MiniMaxError(
      "MINIMAX_API_KEY env var not set. Put it in .env.local. " +
        "See docs/SECURITY_NOTICE.md.",
    );
  }
  return key;
}

/**
 * Make a single chat-completion call. Returns the assistant's text and usage.
 *
 * For JSON-mode prompts: pass `responseFormat: "json"` AND have the prompt
 * include the literal word "json" (MiniMax / OpenAI requirement). The function
 * will validate that the response parses as JSON before returning, throwing
 * MiniMaxError if it doesn't.
 */
export async function callMiniMax(opts: MiniMaxOptions): Promise<MiniMaxResponse> {
  const {
    prompt,
    systemPrompt,
    model = "MiniMax-M2",
    maxTokens = 2000,
    temperature = 0.1,
    responseFormat = "text",
    timeoutMs = 60_000,
  } = opts;

  if (responseFormat === "json" && !/json/i.test(prompt) && !/json/i.test(systemPrompt ?? "")) {
    throw new MiniMaxError(
      "responseFormat='json' requires the literal word 'json' in the prompt or systemPrompt.",
    );
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") {
      throw new MiniMaxError(`MiniMax request timed out after ${timeoutMs}ms`);
    }
    throw new MiniMaxError(`Network error: ${(e as Error).message}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MiniMaxError(
      `MiniMax HTTP ${res.status}: ${text.slice(0, 500)}`,
      res.status,
      text,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: MiniMaxResponse["usage"];
    model?: string;
    base_resp?: { status_code?: number; status_msg?: string };
  };

  // MiniMax sometimes returns errors in 200 with base_resp.status_code != 0
  if (data.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
    throw new MiniMaxError(
      `MiniMax error (in 200 body): ${data.base_resp.status_msg ?? "unknown"}`,
      undefined,
      data,
    );
  }

  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new MiniMaxError("MiniMax response missing choices[0].message.content", undefined, data);
  }

  if (responseFormat === "json") {
    // Strip common markdown wrapping that some models add despite json mode
    const cleaned = stripJsonFence(text);
    try {
      JSON.parse(cleaned);
    } catch (e) {
      throw new MiniMaxError(
        `MiniMax returned invalid JSON despite responseFormat=json: ${(e as Error).message}. Got: ${text.slice(0, 200)}`,
      );
    }
    return {
      text: cleaned,
      usage: data.usage,
      model: data.model,
      finish_reason: data.choices?.[0]?.finish_reason,
    };
  }

  return {
    text,
    usage: data.usage,
    model: data.model,
    finish_reason: data.choices?.[0]?.finish_reason,
  };
}

/** Strip ```json ... ``` markdown fence if model wrapped output. */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  // ```json ... ```  or  ``` ... ```
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = fence.exec(trimmed);
  if (m) return m[1].trim();
  return trimmed;
}

/**
 * Convenience: call MiniMax in JSON mode and parse the response into T.
 * Throws if the response isn't valid JSON or doesn't pass `validate`.
 */
export async function callMiniMaxJson<T>(
  opts: Omit<MiniMaxOptions, "responseFormat"> & {
    validate?: (parsed: unknown) => parsed is T;
  },
): Promise<{ value: T; raw: MiniMaxResponse }> {
  const raw = await callMiniMax({ ...opts, responseFormat: "json" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.text);
  } catch (e) {
    throw new MiniMaxError(`Failed to parse JSON: ${(e as Error).message}`);
  }
  if (opts.validate && !opts.validate(parsed)) {
    throw new MiniMaxError(`Response failed validation: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return { value: parsed as T, raw };
}
