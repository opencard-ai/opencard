/**
 * Minimal, stateless, read-only MCP server (JSON-RPC 2.0 over Streamable HTTP,
 * JSON responses only, no sessions, no SSE). Tools wrap lib/developer-api.ts.
 */
import { ATTRIBUTION, boundedJson, currentWelcomeOffers, getCard, InputError, searchCards, MAX_LIMIT, API_VERSION, DISCLOSURE } from "./developer-api";

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MAX_BODY_BYTES = 16_000;

const limitSchema = { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: 20, description: `Max results (1-${MAX_LIMIT}).` };

export const TOOLS = [
  {
    name: "search_cards",
    title: "Search US credit cards",
    description: "Search OpenCard's public US credit card catalog by keyword, issuer, network, annual fee, foreign transaction fee or tag. Returns summaries with a link to each card page. Closed cards are excluded unless include_discontinued is true. " + DISCLOSURE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 100, description: "Keywords matched against card name, issuer, tags and earning categories, e.g. 'sapphire' or 'dining travel'." },
        issuer: { type: "string", maxLength: 100, description: "Issuer name (substring), e.g. 'Chase', 'American Express'." },
        network: { type: "string", enum: ["visa", "mastercard", "amex", "discover"] },
        max_annual_fee: { type: "number", minimum: 0, maximum: 10000 },
        no_foreign_transaction_fee: { type: "boolean" },
        tag: { type: "string", maxLength: 60, description: "Exact tag, e.g. 'no-annual-fee'." },
        include_discontinued: { type: "boolean", default: false },
        limit: limitSchema,
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "get_card",
    title: "Get one credit card",
    description: "Full public record for one card by card_id (from search_cards): fees, welcome offer, earning rates, credits, benefits, insurance, sources and last_updated.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["card_id"],
      properties: { card_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,80}$", description: "e.g. 'chase-sapphire-preferred'." } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "current_welcome_offers",
    title: "Current welcome offers",
    description: "Current public welcome (sign-up) offers on cards open to new applicants, sorted by OpenCard's estimated value. Verify with the issuer before applying. " + DISCLOSURE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        issuer: { type: "string", maxLength: 100 },
        min_estimated_value: { type: "number", minimum: 0, maximum: 100000, description: "Minimum estimated value in USD." },
        elevated_only: { type: "boolean", description: "Only offers above the card's usual bonus." },
        limit: limitSchema,
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  },
] as const;

type Json = Record<string, unknown>;
type RpcId = string | number | null;

function ok(id: RpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function err(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function toolText(value: unknown, isError = false) {
  return { content: [{ type: "text", text: boundedJson(value) }], isError };
}

function callTool(name: string, args: Json) {
  const allowed = TOOLS.find((t) => t.name === name);
  if (!allowed) return null;
  const known = Object.keys(allowed.inputSchema.properties);
  const extra = Object.keys(args).filter((k) => !known.includes(k));
  if (extra.length) throw new InputError(`Unknown argument(s): ${extra.join(", ")}`);
  if (name === "search_cards") return toolText(searchCards(args));
  if (name === "current_welcome_offers") return toolText(currentWelcomeOffers(args));
  const card = getCard(args);
  return card ? toolText(card) : toolText({ error: `No card with card_id '${String(args.card_id)}'. Use search_cards to find ids.` }, true);
}

/** Handle one JSON-RPC message. Returns null for notifications (no response). */
export function handleRpc(msg: unknown): Json | null {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return err(null, -32600, "Invalid Request");
  const m = msg as Json;
  const id = (typeof m.id === "string" || typeof m.id === "number") ? m.id : null;
  const isNotification = !("id" in m);
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(id, -32600, "Invalid Request");
  if (isNotification) return null;
  const params = (m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}) as Json;

  switch (m.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "opencard", title: "OpenCard card data", version: API_VERSION },
        instructions: "Read-only US credit card data from opencardai.com. Link to the returned url when showing a card. Offers change; tell users to verify with the issuer. " + ATTRIBUTION + " " + DISCLOSURE,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = params.arguments ?? {};
      if (typeof args !== "object" || args === null || Array.isArray(args)) return err(id, -32602, "arguments must be an object");
      try {
        const result = callTool(name, args as Json);
        if (!result) return err(id, -32602, `Unknown tool: ${name}`);
        return ok(id, result);
      } catch (e) {
        if (e instanceof InputError) return ok(id, toolText({ error: e.message }, true));
        return err(id, -32603, "Internal error");
      }
    }
    default:
      return err(id, -32601, `Method not found: ${m.method}`);
  }
}
