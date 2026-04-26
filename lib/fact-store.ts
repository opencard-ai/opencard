/**
 * Fact store — append-only event log for card data.
 *
 * Why this exists:
 *   On 2026-04-25 the CFPB pipeline overwrote correct human-curated annual_fee
 *   values with regex misfires (e.g. amex-platinum 895 → 12). The root cause
 *   was that any script could write directly to data/cards/*.json. This module
 *   inverts that: pipelines emit FactEvent into Upstash, a reconciler promotes
 *   the highest-confidence fact per (card_id, field_path) to data/cards/.
 *
 * Storage (Upstash):
 *   card_facts:v1:{card_id}:{field_path}      list of FactEvent JSON  (LPUSH)
 *   card_facts_index:v1                       set of "{card_id}:{field_path}" keys
 *   card_facts_meta:v1:{card_id}              set of field_paths for this card
 *   review_queue:v1                           list of pending review items
 *   review_queue:v1:{review_id}               JSON of one review item
 *
 * field_path is coarse-grained: "annual_fee", "welcome_offer", "recurring_credits".
 * If a sub-field changes, the writer emits a whole-object fact for that top-level
 * field. Simpler than deep paths, matches how editors think about the data.
 *
 * See docs/FACT_STORE.md for the full data flow.
 */

import { Redis } from "@upstash/redis";

// ============================================================================
// Types
// ============================================================================

export type SourceType =
  | "cfpb_ccad"           // CFPB Credit Card Agreements DB filing (legal)
  | "issuer_pdf"          // Issuer Application & Solicitation Disclosure PDF
  | "issuer_page"         // Issuer marketing page (HTML scrape)
  | "admin_manual"        // Editor entered via admin UI
  | "user_correction"     // Submitted via "report incorrect data" form
  | "seed_migration";     // One-time migration from existing data/cards/*.json

export type ExtractionMethod =
  | "human"
  | "llm:claude-haiku"
  | "llm:claude-sonnet"
  | "llm:minimax"
  | "llm:gpt-4o-mini"
  | "regex"
  | "manual_admin"
  | "user_submitted";

export type FieldPath =
  | "annual_fee"
  | "foreign_transaction_fee"
  | "credit_required"
  | "welcome_offer"
  | "earning_rates"
  | "recurring_credits"
  | "travel_benefits"
  | "insurance"
  | "tags"
  | "name"
  | "issuer"
  | "network"
  | "status"
  // Schumer Box subset (CFPB CCAD will fill these).
  // Note: APR fields (apr_purchases_min/max, apr_cash_advances, penalty_apr)
  // were removed from the schema on 2026-04-27. They're irrelevant to
  // OpenCard's target user (rewards/credits maximizer who pays in full),
  // and accurate per-card APR data isn't available from CFPB family PDFs.
  // See scripts/migrate-remove-apr.ts for the migration.
  | "late_fee_max"
  | "cash_advance_fee_pct"
  | "cash_advance_fee_min";

export interface FactSource {
  type: SourceType;
  url?: string;
  quarter?: string;          // "Q3 2025"
  fetched_at: string;        // ISO
  content_hash?: string;     // sha256 of source bytes
}

export interface FactEvent {
  id: string;                          // ULID-like
  card_id: string;
  field_path: FieldPath | string;      // string for forward-compat
  value: unknown;                      // any JSON-serialisable value
  source: FactSource;
  confidence: number;                  // 0–1
  extracted_by: ExtractionMethod;
  ingested_at: string;                 // ISO
  // Set after the editor reviews this fact (only for source=cfpb_ccad disagreements
  // and any non-authoritative source). Auto-set for cfpb_ccad first-write.
  reviewed_at?: string;
  reviewed_by?: string;
  rejected?: boolean;                  // true means "do not promote"
  reject_reason?: string;
}

export interface ReviewItem {
  id: string;
  card_id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  proposed_fact: FactEvent;
  reason: ReviewReason;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_note?: string;
}

export type ReviewReason =
  | "value_changed"               // existing fact disagrees with new fact
  | "sanity_failed"                // sanity rule (e.g. premium card, low fee)
  | "non_authoritative_source"    // user_correction or low-confidence LLM
  | "manual_review_requested";

// ============================================================================
// Storage keys
// ============================================================================

const SCHEMA_VERSION = "v1";
const factsKey = (card_id: string, field_path: string) =>
  `card_facts:${SCHEMA_VERSION}:${card_id}:${field_path}`;
const factsIndexKey = `card_facts_index:${SCHEMA_VERSION}`;
const cardMetaKey = (card_id: string) =>
  `card_facts_meta:${SCHEMA_VERSION}:${card_id}`;
const reviewQueueKey = `review_queue:${SCHEMA_VERSION}`;
const reviewItemKey = (id: string) => `review_queue:${SCHEMA_VERSION}:${id}`;

// ============================================================================
// Source priority — higher number wins ties
// ============================================================================

const SOURCE_PRIORITY: Record<SourceType, number> = {
  cfpb_ccad: 100,           // legal filing, government-mandated
  admin_manual: 90,          // human editor with full context
  issuer_pdf: 70,            // issuer's own A&S Disclosure
  issuer_page: 50,           // issuer marketing page (subject to A/B tests)
  user_correction: 30,       // crowdsourced, needs verification
  seed_migration: 10,        // baseline from pre-fact-store data/cards/
};

// ============================================================================
// Sanity gates — refuse to write/promote facts that fail
// ============================================================================

const PREMIUM_NAME = /\b(platinum|reserve|aspire|brilliant|prestige|infinite|centurion|magnate|sapphire reserve|venture x)\b/i;

export interface SanityCheckResult {
  ok: boolean;
  reason?: string;
}

/** Run sanity gate against a (field_path, value) pair, optionally with card name context. */
export function checkSanity(
  field_path: string,
  value: unknown,
  context: { card_name?: string; card_id?: string } = {},
): SanityCheckResult {
  if (field_path === "annual_fee") {
    if (typeof value !== "number") {
      return { ok: false, reason: `annual_fee must be number, got ${typeof value}` };
    }
    if (value < 0 || value > 10000) {
      return { ok: false, reason: `annual_fee=${value} out of plausible range [0, 10000]` };
    }
    if (value > 0 && value < 50 && context.card_name && PREMIUM_NAME.test(context.card_name)) {
      return {
        ok: false,
        reason: `Premium-named card "${context.card_name}" cannot have annual_fee=$${value}. Likely regex/parsing bug.`,
      };
    }
  }

  if (field_path === "foreign_transaction_fee") {
    if (typeof value !== "number") {
      return { ok: false, reason: `foreign_transaction_fee must be number, got ${typeof value}` };
    }
    if (value < 0 || value > 5) {
      return { ok: false, reason: `foreign_transaction_fee=${value}% out of plausible range [0, 5]%` };
    }
  }

  // APR fields (penalty_apr, apr_purchases_*, apr_cash_advances) were
  // removed from the schema on 2026-04-27 — see migrate-remove-apr.ts.
  // If a stale pipeline ever ingests them again, refuse hard so they
  // don't reach data/cards/.
  if (
    field_path === "penalty_apr" ||
    field_path === "apr_purchases" ||
    field_path === "apr_purchases_min" ||
    field_path === "apr_purchases_max" ||
    field_path === "apr_cash_advances"
  ) {
    return {
      ok: false,
      reason: `${field_path} is no longer part of the OpenCard schema (removed 2026-04-27). The pipeline should not be emitting this field.`,
    };
  }

  return { ok: true };
}

// ============================================================================
// Redis client (lazy)
// ============================================================================

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Fact store requires UPSTASH_KV_REST_API_URL and UPSTASH_KV_REST_API_TOKEN env vars.",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ============================================================================
// Public API
// ============================================================================

function newFactId(): string {
  // ULID-ish: timestamp + 8 random hex chars
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 10);
  return `${ts}-${rand}`;
}

/** Append a fact to the store. Runs sanity check; failed sanity → review queue. */
export async function ingestFact(
  draft: Omit<FactEvent, "id" | "ingested_at">,
  context: { card_name?: string } = {},
): Promise<{ accepted: boolean; reviewQueued?: ReviewItem; fact?: FactEvent; reason?: string }> {
  const fact: FactEvent = {
    ...draft,
    id: newFactId(),
    ingested_at: new Date().toISOString(),
  };

  // Sanity gate
  const sanity = checkSanity(fact.field_path, fact.value, {
    card_name: context.card_name,
    card_id: fact.card_id,
  });
  if (!sanity.ok) {
    // Don't write the fact; queue for review instead
    const review = await queueReview({
      card_id: fact.card_id,
      field_path: fact.field_path,
      old_value: await getCurrentValue(fact.card_id, fact.field_path),
      new_value: fact.value,
      proposed_fact: fact,
      reason: "sanity_failed",
      detail: sanity.reason,
    });
    return { accepted: false, reviewQueued: review, reason: sanity.reason };
  }

  // Disagreement check: does the new fact disagree with the current published value?
  const current = await getCurrentValue(fact.card_id, fact.field_path);
  const disagrees = current !== undefined && !shallowEqual(current, fact.value);

  // Authoritative sources can write directly even if value changed
  const isAuthoritative = fact.source.type === "cfpb_ccad" || fact.source.type === "admin_manual";

  if (disagrees && !isAuthoritative) {
    const review = await queueReview({
      card_id: fact.card_id,
      field_path: fact.field_path,
      old_value: current,
      new_value: fact.value,
      proposed_fact: fact,
      reason: "non_authoritative_source",
      detail: `Source ${fact.source.type} disagrees with current value. Manual review required.`,
    });
    return { accepted: false, reviewQueued: review, reason: "non_authoritative_source disagreement" };
  }

  // Persist the fact
  await persistFact(fact);
  return { accepted: true, fact };
}

/** Append a fact directly without sanity/disagreement gates. Internal use only. */
async function persistFact(fact: FactEvent): Promise<void> {
  const r = redis();
  const factsK = factsKey(fact.card_id, fact.field_path);
  await r.lpush(factsK, JSON.stringify(fact));
  await r.sadd(factsIndexKey, `${fact.card_id}:${fact.field_path}`);
  await r.sadd(cardMetaKey(fact.card_id), fact.field_path);
}

/** Read all facts for one (card_id, field_path), newest first. */
export async function getFacts(card_id: string, field_path: string): Promise<FactEvent[]> {
  const r = redis();
  // @upstash/redis auto-parses JSON values, so list items may come back as objects.
  // Tolerate both raw strings and parsed objects (matches the pattern in
  // listPendingReviews / getReviewItem below).
  const items = await r.lrange<FactEvent | string>(factsKey(card_id, field_path), 0, -1);
  return items
    .map((s) => {
      if (s && typeof s === "object") return s as FactEvent;
      try {
        return JSON.parse(s as string) as FactEvent;
      } catch {
        return null;
      }
    })
    .filter((f): f is FactEvent => f !== null);
}

/** Reconcile: among non-rejected facts, pick the winner by source priority then recency. */
export function reconcileFacts(facts: FactEvent[]): FactEvent | undefined {
  const live = facts.filter((f) => !f.rejected);
  if (live.length === 0) return undefined;

  return live.reduce<FactEvent | undefined>((best, f) => {
    if (!best) return f;
    const fp = SOURCE_PRIORITY[f.source.type] ?? 0;
    const bp = SOURCE_PRIORITY[best.source.type] ?? 0;
    if (fp > bp) return f;
    if (fp < bp) return best;
    // tie on priority — prefer newer ingestion
    return f.ingested_at > best.ingested_at ? f : best;
  }, undefined);
}

/** Get the current published value for (card_id, field_path), or undefined if no facts. */
export async function getCurrentValue(card_id: string, field_path: string): Promise<unknown> {
  const facts = await getFacts(card_id, field_path);
  const winner = reconcileFacts(facts);
  return winner?.value;
}

/** List all field_paths that have ≥1 fact for this card_id. */
export async function getCardFieldPaths(card_id: string): Promise<string[]> {
  const r = redis();
  const items = await r.smembers(cardMetaKey(card_id));
  return items as string[];
}

// ============================================================================
// Review queue
// ============================================================================

async function queueReview(input: {
  card_id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  proposed_fact: FactEvent;
  reason: ReviewReason;
  detail?: string;
}): Promise<ReviewItem> {
  const r = redis();
  const item: ReviewItem = {
    id: newFactId(),
    card_id: input.card_id,
    field_path: input.field_path,
    old_value: input.old_value,
    new_value: input.new_value,
    proposed_fact: input.proposed_fact,
    reason: input.reason,
    status: "pending",
    created_at: new Date().toISOString(),
    resolution_note: input.detail,
  };
  await r.set(reviewItemKey(item.id), JSON.stringify(item));
  await r.lpush(reviewQueueKey, item.id);
  return item;
}

export async function listPendingReviews(limit = 50): Promise<ReviewItem[]> {
  const r = redis();
  const ids = await r.lrange<string>(reviewQueueKey, 0, limit - 1);
  const items = await Promise.all(ids.map((id) => r.get<string>(reviewItemKey(id))));
  return items
    .map((s) => {
      if (!s) return null;
      try {
        return typeof s === "string" ? (JSON.parse(s) as ReviewItem) : (s as ReviewItem);
      } catch {
        return null;
      }
    })
    .filter((i): i is ReviewItem => i !== null && i.status === "pending");
}

export async function resolveReview(
  review_id: string,
  decision: "approved" | "rejected",
  resolved_by: string,
  note?: string,
): Promise<ReviewItem | null> {
  const r = redis();
  const raw = await r.get<string>(reviewItemKey(review_id));
  if (!raw) return null;
  const item: ReviewItem = typeof raw === "string" ? JSON.parse(raw) : (raw as ReviewItem);
  if (item.status !== "pending") return item;
  item.status = decision;
  item.resolved_at = new Date().toISOString();
  item.resolved_by = resolved_by;
  if (note) item.resolution_note = note;
  await r.set(reviewItemKey(review_id), JSON.stringify(item));

  if (decision === "approved") {
    // Promote: persist the proposed fact (skips ingest gates because human approved)
    await persistFact(item.proposed_fact);
  } else {
    // Mark the proposed fact rejected so it never wins reconcile
    const rejectedFact: FactEvent = {
      ...item.proposed_fact,
      rejected: true,
      reject_reason: note ?? "rejected via review queue",
      reviewed_at: item.resolved_at,
      reviewed_by: resolved_by,
    };
    await persistFact(rejectedFact);
  }
  return item;
}

// ============================================================================
// Helpers
// ============================================================================

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// ============================================================================
// Test-only helper: clear all fact store data. Don't call in production.
// ============================================================================

export async function _resetForTests(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("_resetForTests must not run in production");
  }
  const r = redis();
  const keys = await r.smembers(factsIndexKey);
  for (const k of keys as string[]) {
    const [card_id, field_path] = k.split(":");
    await r.del(factsKey(card_id, field_path));
  }
  await r.del(factsIndexKey);
  // Note: doesn't clean cardMetaKey or review queue. Only for unit tests.
}
