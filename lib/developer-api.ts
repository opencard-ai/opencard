/**
 * Read-only developer access to OpenCard's public card data (data/cards/*.json,
 * the same files the site renders). No DB, no env vars, no writes.
 * Shared by the public JSON endpoints and the MCP server.
 */
import { getAllCards, getCardById, isClosedToNewApplicants, type CreditCard } from "./cards";
import { formatWelcomeBonus, welcomeBonusKind } from "./welcome-offer";

export const SITE_URL = "https://opencardai.com";
export const API_VERSION = "2026-11-02";
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;
export const MAX_QUERY_LENGTH = 100;
/** Hard cap on serialized response size (bytes) for any single result. */
export const MAX_RESPONSE_BYTES = 200_000;

export const DISCLOSURE =
  "OpenCard may receive compensation from some card links; compensation does not determine ratings or order. " +
  "Offers change often: verify terms with the issuer before applying. Not financial advice.";
export const LICENSE = { name: "CC-BY-4.0", url: "https://creativecommons.org/licenses/by/4.0/" } as const;
export const ATTRIBUTION = `Data: OpenCard (${SITE_URL}), licensed CC BY 4.0 (${LICENSE.url}). Commercial use allowed; attribution and a link back to ${SITE_URL} are required.`;

export class InputError extends Error {}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const NETWORKS = ["visa", "mastercard", "amex", "discover"] as const;

export interface CardSummary {
  card_id: string;
  name: string;
  issuer: string;
  network: string;
  annual_fee: number;
  foreign_transaction_fee: number;
  credit_required: string;
  status: string;
  welcome_offer: string | null;
  top_earning_rates: { category: string; rate: number }[];
  tags: string[];
  last_updated: string;
  url: string;
}

export function cardUrl(id: string): string {
  return `${SITE_URL}/en/cards/${id}`;
}

function statusOf(card: CreditCard): string {
  if (isClosedToNewApplicants(card)) return "discontinued";
  return card.status || "active";
}

function offerText(card: CreditCard): string | null {
  const w = card.welcome_offer;
  if (!w) return null;
  const bonus = formatWelcomeBonus(w);
  if (!bonus) return w.description ? String(w.description).slice(0, 300) : null;
  const program = welcomeBonusKind(w) === "points" && w.point_program ? ` ${w.point_program}` : "";
  const spend = w.spending_requirement && w.spending_requirement > 0
    ? ` after $${w.spending_requirement.toLocaleString("en-US")} spend${w.time_period_months ? ` in ${w.time_period_months} months` : ""}`
    : "";
  return `${bonus}${program}${spend}`.slice(0, 300);
}

export function toSummary(card: CreditCard): CardSummary {
  return {
    card_id: card.card_id,
    name: card.name,
    issuer: card.issuer,
    network: card.network,
    annual_fee: card.annual_fee,
    foreign_transaction_fee: card.foreign_transaction_fee,
    credit_required: card.credit_required,
    status: statusOf(card),
    welcome_offer: offerText(card),
    top_earning_rates: [...(card.earning_rates || [])]
      .filter((r) => !r.limited_time)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map((r) => ({ category: r.category, rate: r.rate })),
    tags: card.tags || [],
    last_updated: card.last_updated,
    url: cardUrl(card.card_id),
  };
}

/** Full public record. Dormant/internal fields (affiliate_url) are dropped. */
export function toPublicCard(card: CreditCard) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { affiliate_url, featured, ...rest } = card;
  return { ...rest, status: statusOf(card), url: cardUrl(card.card_id) };
}

function str(v: unknown, name: string, max = MAX_QUERY_LENGTH): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new InputError(`${name} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new InputError(`${name} must be at most ${max} characters`);
  return s || undefined;
}

function num(v: unknown, name: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new InputError(`${name} must be a number`);
  if (n < min || n > max) throw new InputError(`${name} must be between ${min} and ${max}`);
  return n;
}

function bool(v: unknown, name: string): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  throw new InputError(`${name} must be a boolean`);
}

function limitOf(v: unknown): number {
  const n = num(v, "limit", 1, MAX_LIMIT);
  return n === undefined ? DEFAULT_LIMIT : Math.floor(n);
}

export interface SearchParams {
  query?: unknown;
  issuer?: unknown;
  network?: unknown;
  max_annual_fee?: unknown;
  no_foreign_transaction_fee?: unknown;
  tag?: unknown;
  include_discontinued?: unknown;
  limit?: unknown;
}

export function searchCards(p: SearchParams) {
  const query = str(p.query, "query")?.toLowerCase();
  const issuer = str(p.issuer, "issuer")?.toLowerCase();
  const network = str(p.network, "network")?.toLowerCase();
  if (network && !(NETWORKS as readonly string[]).includes(network)) {
    throw new InputError(`network must be one of ${NETWORKS.join(", ")}`);
  }
  const maxFee = num(p.max_annual_fee, "max_annual_fee", 0, 10000);
  const noFtf = bool(p.no_foreign_transaction_fee, "no_foreign_transaction_fee");
  const tag = str(p.tag, "tag", 60)?.toLowerCase();
  const includeClosed = bool(p.include_discontinued, "include_discontinued") ?? false;
  const limit = limitOf(p.limit);
  const terms = query ? query.split(/\s+/).filter(Boolean).slice(0, 8) : [];

  const matches = getAllCards().filter((c) => {
    if (!includeClosed && isClosedToNewApplicants(c)) return false;
    if (issuer && !c.issuer.toLowerCase().includes(issuer)) return false;
    if (network && c.network?.toLowerCase() !== network) return false;
    if (maxFee !== undefined && c.annual_fee > maxFee) return false;
    if (noFtf && c.foreign_transaction_fee > 0) return false;
    if (tag && !(c.tags || []).some((t) => t.toLowerCase() === tag)) return false;
    if (terms.length) {
      const hay = [c.card_id, c.name, c.issuer, c.network, ...(c.tags || []), ...(c.earning_rates || []).map((r) => r.category)]
        .join(" ")
        .toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  if (terms.length) {
    // Relevance: name matches, then issuer matches, then other fields; alphabetical within each group.
    const rank = (c: CreditCard) => {
      const name = `${c.name} ${c.card_id}`.toLowerCase();
      if (terms.some((t) => name.includes(t))) return 0;
      if (terms.some((t) => c.issuer.toLowerCase().includes(t))) return 1;
      return 2;
    };
    matches.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  return { total: matches.length, count: Math.min(limit, matches.length), cards: matches.slice(0, limit).map(toSummary), disclosure: DISCLOSURE, attribution: ATTRIBUTION, license: LICENSE };
}

export function getCard(p: { card_id?: unknown }) {
  const id = str(p.card_id, "card_id", 81)?.toLowerCase();
  if (!id) throw new InputError("card_id is required");
  if (!ID_RE.test(id)) throw new InputError("card_id must be lowercase letters, digits and hyphens");
  const card = getCardById(id);
  if (!card) return null;
  return { card: toPublicCard(card), disclosure: DISCLOSURE, attribution: ATTRIBUTION, license: LICENSE };
}

export function currentWelcomeOffers(p: { issuer?: unknown; min_estimated_value?: unknown; elevated_only?: unknown; limit?: unknown }) {
  const issuer = str(p.issuer, "issuer")?.toLowerCase();
  const minValue = num(p.min_estimated_value, "min_estimated_value", 0, 100000);
  const elevatedOnly = bool(p.elevated_only, "elevated_only") ?? false;
  const limit = limitOf(p.limit);
  const today = new Date().toISOString().slice(0, 10);

  const offers = getAllCards()
    .filter((c) => !isClosedToNewApplicants(c) && c.welcome_offer && welcomeBonusKind(c.welcome_offer) !== "none")
    .filter((c) => !c.welcome_offer!.expires_at || c.welcome_offer!.expires_at >= today)
    .filter((c) => !issuer || c.issuer.toLowerCase().includes(issuer))
    .filter((c) => !elevatedOnly || c.welcome_offer!.is_elevated === true)
    .filter((c) => minValue === undefined || (c.welcome_offer!.estimated_value ?? 0) >= minValue)
    .sort((a, b) => (b.welcome_offer!.estimated_value ?? 0) - (a.welcome_offer!.estimated_value ?? 0) || a.name.localeCompare(b.name))
    .map((c) => {
      const w = c.welcome_offer!;
      return {
        card_id: c.card_id,
        name: c.name,
        issuer: c.issuer,
        annual_fee: c.annual_fee,
        offer: offerText(c),
        bonus_points: w.bonus_points ?? null,
        point_program: w.point_program ?? null,
        spending_requirement: w.spending_requirement ?? null,
        time_period_months: w.time_period_months ?? null,
        estimated_value_usd: w.estimated_value ?? null,
        is_elevated: w.is_elevated === true,
        expires_at: w.expires_at ?? w.elevated_until ?? null,
        last_verified: w.last_verified ?? c.last_updated ?? null,
        url: cardUrl(c.card_id),
      };
    });
  return { as_of: today, total: offers.length, count: Math.min(limit, offers.length), offers: offers.slice(0, limit), disclosure: DISCLOSURE, attribution: ATTRIBUTION, license: LICENSE };
}

/** Serialize with a hard size cap so no single response can balloon. */
export function boundedJson(value: unknown): string {
  const s = JSON.stringify(value);
  if (Buffer.byteLength(s) > MAX_RESPONSE_BYTES) {
    return JSON.stringify({ error: "Result too large; narrow the query or lower limit." });
  }
  return s;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function preflight(methods: string): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": methods, Allow: methods } });
}

export const PUBLIC_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "X-Content-Type-Options": "nosniff",
};
