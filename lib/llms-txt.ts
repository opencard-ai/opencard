import { ATTRIBUTION, DISCLOSURE, SITE_URL } from "./developer-api";

export const LLMS_TXT = `# OpenCard

> OpenCard (${SITE_URL}) compares US credit cards: annual fees, welcome offers, earning rates, credits and benefits, sourced from issuer pages. Content is available in English, Traditional Chinese, Simplified Chinese and Spanish.

${DISCLOSURE}

License: ${ATTRIBUTION}

## Developer access (read-only, no key)

- [Developer docs](${SITE_URL}/en/developers): API and MCP overview
- [OpenAPI 3.1 spec](${SITE_URL}/openapi.json)
- [MCP server](${SITE_URL}/api/mcp): Streamable HTTP, tools search_cards, get_card, current_welcome_offers
- [Search cards](${SITE_URL}/api/public/cards?q=travel&limit=10): JSON
- [Current welcome offers](${SITE_URL}/api/public/welcome-offers?limit=10): JSON

## Key pages

- [All cards](${SITE_URL}/en/cards)
- [Compare cards](${SITE_URL}/en/compare)
- [Elevated offers](${SITE_URL}/en/elevated-offers)
- [Guides](${SITE_URL}/en/guides)
- [Methodology](${SITE_URL}/en/methodology): sourcing, valuation and corrections
`;
