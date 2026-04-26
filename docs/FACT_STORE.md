# Fact Store + Review Queue

> Status: v1 (Week 1.C of takeover plan)
> Code: `lib/fact-store.ts` + `scripts/promote-facts.ts` + `scripts/seed-fact-store-from-cards.ts`

## Why this exists

On 2026-04-25 the CFPB pipeline overwrote correct human-curated `annual_fee`
values with regex misfires (e.g. amex-platinum 895 → 12). The root cause
wasn't the regex — it was that **any script could write directly to
`data/cards/*.json`**, bypassing review.

The fact store inverts that:

```
[ Pipeline ]                       [ Pipeline ]
     ↓ writes JSON file                  ↓ emits FactEvent
[ data/cards/*.json ]              [ Upstash list ]
     ↓ served by API                     ↓ reconciler picks winner
[ Live site ]                      [ data/cards/*.json ]
                                          ↓
                                    [ Live site ]

  BEFORE: pipeline owns the truth    AFTER: pipeline proposes; reconciler decides
```

Pipelines now propose facts. The reconciler decides which fact wins per
`(card_id, field_path)` based on source priority + sanity gates + recency.
`data/cards/*.json` becomes the **materialised view** of the fact store, not
the source of truth.

## Data flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Pipeline (CFPB / issuer page / admin / user)           │
│    calls ingestFact({card_id, field_path, value, source}) │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 2. Sanity gate                                             │
│    - annual_fee ∈ [0, 10000]                               │
│    - premium-named card with annual_fee < $50 → REJECT     │
│    - foreign_transaction_fee ∈ [0%, 5%]                    │
│    Failed sanity → review queue (NOT written)              │
└───────────────────────────────────────────────────────────┘
                          ↓ ok
┌───────────────────────────────────────────────────────────┐
│ 3. Disagreement check                                      │
│    - if non-authoritative source disagrees with current   │
│      published value → review queue                        │
│    - cfpb_ccad / admin_manual: write directly              │
└───────────────────────────────────────────────────────────┘
                          ↓ ok or authoritative
┌───────────────────────────────────────────────────────────┐
│ 4. Persist FactEvent to Upstash                            │
│    LPUSH card_facts:v1:{card_id}:{field_path} <json>       │
│    SADD card_facts_index:v1 "{card_id}:{field_path}"       │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 5. Promote (cron / manual)                                 │
│    npm run facts:promote                                   │
│    - For each card_id, read all facts, reconcile.          │
│    - Run sanity again at promote time (defense in depth).  │
│    - Write merged card → data/cards/{id}.json              │
│    - Add _fact_promote_history provenance.                 │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 6. git commit + push → Vercel rebuilds → live site         │
└───────────────────────────────────────────────────────────┘
```

## Source priority (reconciler tiebreak)

```
cfpb_ccad         100   ← legal filing, highest trust
admin_manual       90   ← human editor with full context
issuer_pdf         70   ← issuer's own A&S Disclosure PDF
issuer_page        50   ← issuer marketing page (subject to A/B tests)
user_correction    30   ← crowdsourced "report incorrect data"
seed_migration     10   ← baseline from pre-fact-store data/cards/
```

Within the same priority, newer ingestion wins.

## FactEvent schema

```ts
interface FactEvent {
  id: string;               // ULID-ish
  card_id: string;          // e.g. "amex-platinum"
  field_path: string;       // e.g. "annual_fee", "welcome_offer", "recurring_credits"
  value: unknown;           // the JSON-serializable field value
  source: {
    type: SourceType;
    url?: string;
    quarter?: string;       // "Q3 2025" for CCAD
    fetched_at: string;     // ISO datetime
    content_hash?: string;  // sha256 of source bytes (for dedup)
  };
  confidence: number;       // 0–1
  extracted_by: "human" | "llm:claude-haiku" | "llm:minimax" | "regex" | "manual_admin" | "user_submitted";
  ingested_at: string;      // ISO datetime
  reviewed_at?: string;
  reviewed_by?: string;
  rejected?: boolean;
  reject_reason?: string;
}
```

`field_path` is intentionally **coarse-grained** — one fact = one top-level
field. If part of `welcome_offer` changes, the writer emits a whole new
`welcome_offer` object as a fact. Simpler than deep paths, matches how
editors think about cards.

## Storage (Upstash Redis)

| Key | Type | Purpose |
|---|---|---|
| `card_facts:v1:{card_id}:{field_path}` | LIST | LPUSH FactEvent JSON, newest first |
| `card_facts_index:v1` | SET | All `{card_id}:{field_path}` keys (for enumeration) |
| `card_facts_meta:v1:{card_id}` | SET | All field_paths for one card |
| `review_queue:v1` | LIST | Pending review item IDs |
| `review_queue:v1:{review_id}` | STRING | One review item JSON |

Upstash REST API limits aren't a concern at our scale (~250 cards × ~13 fields × maybe 10 events/year average = 32k events/year, all small). Memory ~5 MB worst case.

## Sanity gates

Run at TWO points:
1. **Ingest time** (`lib/fact-store.ts:checkSanity`) — refuse to write
2. **Promote time** (`scripts/promote-facts.ts`) — refuse to write to data/cards/

Why both: if a future bug bypasses ingest gate (or someone seeds bad data
manually), the promote layer still catches it before it goes live.

Current rules:
- `annual_fee` ∈ [0, 10000]
- `annual_fee` < $50 + premium-named card → fail
- `foreign_transaction_fee` ∈ [0%, 5%]
- `penalty_apr` ∈ [0%, 50%]

To add rules, edit `checkSanity` in `lib/fact-store.ts` and the corresponding
section in `scripts/validate-all.ts` (CI).

## Review queue

When a fact fails sanity OR a non-authoritative source disagrees with the
current value, it goes to the review queue instead of being written. A
`ReviewItem` carries:

- `proposed_fact` (the FactEvent that triggered review)
- `old_value` (current published value)
- `new_value` (proposed value)
- `reason` (`sanity_failed` | `value_changed` | `non_authoritative_source`)

Resolving:

```ts
import { resolveReview } from "@/lib/fact-store";

// approve → proposed_fact gets persisted (skipping gates)
await resolveReview(reviewId, "approved", "kacey", "Verified against issuer page.");

// reject → proposed_fact gets persisted with rejected:true (so reconciler ignores it)
await resolveReview(reviewId, "rejected", "kacey", "Wrong value, see annual fee on amex.com.");
```

Listing pending reviews:

```ts
import { listPendingReviews } from "@/lib/fact-store";
const pending = await listPendingReviews(50);
```

(Admin UI for the review queue is Week 2 work — for now use the API directly.)

## Operations

### Migrate existing data into the fact store (one-time)

```bash
# Make sure UPSTASH_KV_REST_API_URL + UPSTASH_KV_REST_API_TOKEN are in .env.local
npm run facts:seed -- --dry-run   # see what would be written
npm run facts:seed                # actually write
```

Each card field becomes one `seed_migration` fact with confidence 0.5. Any
future authoritative fact (cfpb_ccad, admin_manual) outranks it.

### Promote facts to data/cards/ (cron-ish)

```bash
# All cards
npm run facts:promote:dry         # dry run
npm run facts:promote             # apply

# One card
npx tsx scripts/promote-facts.ts --card amex-platinum
```

Run after every batch of ingest, or daily as a cron. Outputs a per-field diff:

```
amex-platinum  (amex-platinum.json)
  [annual_fee]  895  →  895    ← cfpb_ccad@2025-08-01 (llm:claude-haiku)
  [foreign_transaction_fee]  0  →  0    ← cfpb_ccad@2025-08-01 (llm:claude-haiku)
```

If sanity fails at promote time (defense in depth), the field is skipped and
the script logs an error. Other fields still promote normally.

### Add a fact manually (admin)

```ts
import { ingestFact } from "@/lib/fact-store";

await ingestFact({
  card_id: "amex-platinum",
  field_path: "annual_fee",
  value: 895,
  source: {
    type: "admin_manual",
    fetched_at: new Date().toISOString(),
    url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
  },
  confidence: 1.0,
  extracted_by: "manual_admin",
}, { card_name: "The Platinum Card® from American Express" });
```

`admin_manual` source is authoritative — writes directly even if disagreeing
with current value.

## Testing

Run the full validate gate after any fact-store change:

```bash
npm run validate
```

For unit-testing fact-store logic without hitting real Upstash, mock the
`@upstash/redis` import. There's no Jest/Vitest setup yet — if you add tests
later, use the export `_resetForTests()` between runs.

## What's next (not in v1)

- [ ] Admin UI: web page that lists pending review items and approves/rejects
- [ ] API endpoints under `/api/internal/facts/*` for ingest from external pipelines
- [ ] Vercel cron job that runs `facts:promote` daily
- [ ] Public per-card "verified at" timestamp on card detail pages
- [ ] PR-time check that warns if `data/cards/*.json` was edited without a corresponding fact event (so editors stop editing JSON directly long-term)

## Why Upstash and not local file?

- Multiple agents / cron / Vercel functions all write to it → needs to be a shared db
- Already in our stack (`@upstash/redis` is already a dep)
- Free tier covers our 32k events/year easily

## Why coarse field_path and not deep path?

We tried deep paths first in design. Issue: `recurring_credits[3].amount`
breaks when array order changes. Coarse path = one fact replaces the whole
array; cleaner semantics, bigger writes (~few KB), fits within Upstash limits.
