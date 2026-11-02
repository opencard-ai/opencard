import { API_VERSION, ATTRIBUTION, DISCLOSURE, LICENSE, MAX_LIMIT, SITE_URL } from "./developer-api";

const limit = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: 20 } };
const str = (name: string, description: string, maxLength = 100) => ({ name, in: "query", description, schema: { type: "string", maxLength } });
const err = { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OpenCard Card Data API",
    version: API_VERSION,
    summary: "Read-only US credit card data from opencardai.com.",
    description: `Public, read-only access to the card data shown on ${SITE_URL}. No key required. ${ATTRIBUTION} ${DISCLOSURE}`,
    license: { name: LICENSE.name, url: LICENSE.url },
    contact: { name: "OpenCard", email: "data@opencardai.com", url: `${SITE_URL}/en/developers` },
  },
  servers: [{ url: SITE_URL }],
  paths: {
    "/api/public/cards": {
      get: {
        operationId: "searchCards",
        summary: "Search cards",
        parameters: [
          str("q", "Keywords (name, issuer, tags, earning categories)."),
          str("issuer", "Issuer substring, e.g. Chase."),
          { name: "network", in: "query", schema: { type: "string", enum: ["visa", "mastercard", "amex", "discover"] } },
          { name: "max_annual_fee", in: "query", schema: { type: "number", minimum: 0, maximum: 10000 } },
          { name: "no_foreign_transaction_fee", in: "query", schema: { type: "boolean" } },
          str("tag", "Exact tag, e.g. no-annual-fee.", 60),
          { name: "include_discontinued", in: "query", schema: { type: "boolean", default: false } },
          limit,
        ],
        responses: {
          "200": { description: "Matching cards", content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResult" } } } },
          "400": err,
        },
      },
    },
    "/api/public/cards/{card_id}": {
      get: {
        operationId: "getCard",
        summary: "Get one card",
        parameters: [{ name: "card_id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,80}$" } }],
        responses: {
          "200": { description: "Full public card record", content: { "application/json": { schema: { type: "object", properties: { card: { type: "object", additionalProperties: true }, disclosure: { type: "string" }, attribution: { type: "string" } } } } } },
          "400": err,
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/public/welcome-offers": {
      get: {
        operationId: "currentWelcomeOffers",
        summary: "Current welcome offers",
        parameters: [
          str("issuer", "Issuer substring."),
          { name: "min_estimated_value", in: "query", schema: { type: "number", minimum: 0, maximum: 100000 } },
          { name: "elevated_only", in: "query", schema: { type: "boolean" } },
          limit,
        ],
        responses: {
          "200": { description: "Offers sorted by estimated value", content: { "application/json": { schema: { $ref: "#/components/schemas/OffersResult" } } } },
          "400": err,
        },
      },
    },
    "/api/mcp": {
      post: {
        operationId: "mcp",
        summary: "MCP server (Streamable HTTP, JSON-RPC 2.0)",
        description: "Model Context Protocol endpoint. Tools: search_cards, get_card, current_welcome_offers. Stateless; JSON responses only.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method"], properties: { jsonrpc: { const: "2.0" }, id: { type: ["string", "integer"] }, method: { type: "string" }, params: { type: "object" } } } } } },
        responses: { "200": { description: "JSON-RPC response" }, "202": { description: "Notification accepted" }, "400": { description: "Parse error" } },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
      CardSummary: {
        type: "object",
        properties: {
          card_id: { type: "string" }, name: { type: "string" }, issuer: { type: "string" }, network: { type: "string" },
          annual_fee: { type: "number" }, foreign_transaction_fee: { type: "number" }, credit_required: { type: "string" },
          status: { type: "string" }, welcome_offer: { type: ["string", "null"] },
          top_earning_rates: { type: "array", items: { type: "object", properties: { category: { type: "string" }, rate: { type: "number" } } } },
          tags: { type: "array", items: { type: "string" } }, last_updated: { type: "string" }, url: { type: "string", format: "uri" },
        },
      },
      SearchResult: {
        type: "object",
        properties: { total: { type: "integer" }, count: { type: "integer" }, cards: { type: "array", items: { $ref: "#/components/schemas/CardSummary" } }, disclosure: { type: "string" }, attribution: { type: "string" } },
      },
      Offer: {
        type: "object",
        properties: {
          card_id: { type: "string" }, name: { type: "string" }, issuer: { type: "string" }, annual_fee: { type: "number" },
          offer: { type: ["string", "null"] }, bonus_points: { type: ["number", "null"] }, point_program: { type: ["string", "null"] },
          spending_requirement: { type: ["number", "null"] }, time_period_months: { type: ["number", "null"] },
          estimated_value_usd: { type: ["number", "null"] }, is_elevated: { type: "boolean" },
          expires_at: { type: ["string", "null"] }, last_verified: { type: ["string", "null"] }, url: { type: "string", format: "uri" },
        },
      },
      OffersResult: {
        type: "object",
        properties: { as_of: { type: "string", format: "date" }, total: { type: "integer" }, count: { type: "integer" }, offers: { type: "array", items: { $ref: "#/components/schemas/Offer" } }, disclosure: { type: "string" }, attribution: { type: "string" } },
      },
    },
  },
} as const;
