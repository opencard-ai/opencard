# Verify-to-Access — Phase 0-1 (closed beta)

Spec: architecture v0.2. Disabled by default; nothing is live until env vars are set.

## Endpoints
| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/agents | Requires `X-Invite-Code`. Returns `api_key` once. Probation grant. |
| GET | /api/v1/agents/me | Tier, credits, reputation. |
| GET | /api/v1/cards/[card_id] | Costs 1 credit, attaches 0-2 tasks; 402 when empty. |
| POST | /api/v1/verify | Records a vote, provisional reward, `pending_consensus`. No settlement. |

Existing `GET /api/cards` is unchanged. Nothing writes `data/cards`.

## Env vars
| Var | Default | Purpose |
|---|---|---|
| V1_API_ENABLED | (off) | `true` to enable; otherwise every /api/v1 route 404s |
| V1_DATABASE_URL | — | Postgres connection string (secret) |
| V1_INVITE_CODES | — | Comma-separated invite codes (secret); empty = registration closed |
| V1_PROBATION_GRANT | 20 | Credits granted at registration |
| V1_TASK_REWARD | 1 | Provisional credits per verified vote |
| V1_MAX_TASKS_ATTACHED | 2 | 0-2 |
| V1_RATE_LIMIT_PER_MIN | 60 | Per agent, per instance |
| V1_REGISTER_LIMIT_PER_HOUR | 5 | Per IP, per instance |
| V1_MAX_EXCERPT_CHARS | 1000 | Evidence excerpt limit |
| V1_INSUFFICIENT_CREDITS_STATUS | 402 | `403` to switch |

## Migrations
`V1_DATABASE_URL=... npx tsx scripts/v1-migrate.ts` applies `db/migrations/*.sql` (tracked in `v1_schema_migrations`).

## Gold isolation
Gold answers live in `task_gold_answers`, which no API code reads (enforced by a test). In production, run the web app as a role without access:

```sql
CREATE ROLE opencard_api LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE ON agents, tasks, votes, sources_whitelist, consensus_suggestions TO opencard_api;
GRANT SELECT, INSERT, UPDATE ON credit_ledger TO opencard_api;
REVOKE ALL ON task_gold_answers FROM opencard_api;
```
Task IDs must be opaque (never encode gold-ness).

## Gold set, whitelist and settlement (migration 0002)

- `npx tsx scripts/v1-load-gold.ts <gold.json> <whitelist.json>` loads data files kept **outside the repo**.
  Each gold item becomes a task with a random UUIDv4 `task_id`; `gold_id`, answer and provenance live only in
  `task_gold_answers`. Idempotent by `gold_id`. Items not backed by a `dispatchable=true` source are skipped.
- `sources_whitelist` gains `fields`, `requires_browser`, `dispatchable`, `robots`, `tos_url`. Patterns support
  `**` (any) and `*` (one path segment). `/api/v1/verify` accepts evidence only from dispatchable sources.
- Tasks in API responses expose only `task_id`, `card_id`, `field`, `type`.
- Evidence keeps `url`, `retrieved_at`, `excerpt`, `content_hash`; Amex excerpts are capped at 200 chars;
  `votes.snapshot_ref` is constrained to NULL.
- `v1_scoring_config`: `gold_rules` (visible text only, no inferred values, dispatchable only, link_check
  host+path / no query+fragment / trailing-slash insensitive) and `tiers` thresholds.
- `npx tsx scripts/v1-settle.ts` (offline, privileged; lives in `lib/v1-settle`, never imported by API routes):
  grades gold votes, confirms or claws back provisional rewards, updates score / gold_accuracy / tier, and runs
  the weighted-majority consensus that writes only `consensus_suggestions`.

## Review fixes (migration 0003)

### DB roles
- The web app connects as **`opencard_api`**: a LOGIN role that owns nothing. `db/roles/opencard_api_grants.sql`
  grants only what the routes need (SELECT/INSERT, plus column-level UPDATE used for `tasks.state` and row locks).
  It has **no** TRUNCATE/DELETE anywhere and **no** access to `task_gold_answers`, `v1_scoring_config`,
  `v1_schema_migrations` or `consensus_suggestions`. Re-run the grants file after every migration.
- Create the role once as the owner (password generated, never committed):
  `CREATE ROLE opencard_api LOGIN PASSWORD '<generated>'` then apply the grants file.
- Env: `V1_DATABASE_URL` = opencard_api (pooled). `V1_ADMIN_DATABASE_URL` = owner (unpooled), used only by
  `v1-migrate`, `v1-load-gold` and `v1-settle`; never set it in the runtime of a public deployment you don't control.
- `tests/v1-review.test.ts` proves the API role gets `permission denied` on the gold table.

### Assignments, invites, weights, expiry
- `task_assignments`: `GET /cards` records each task it hands out (TTL `V1_ASSIGNMENT_TTL_MIN`, default 60, capped
  at the task's expiry). `/verify` returns `403 task_not_assigned` without a matching unexpired assignment.
- Invite codes are one-time: the SHA-256 of a code is stored in `invite_codes` with `used_by` = the agent.
  Reuse returns `403 invite_used`. `V1_INVITE_CODES` still lists the valid codes.
- Probation votes are weighted at `V1_PROBATION_WEIGHT_PCT` (default 50) % of the agent's score.
- Settle runs per task in its own transaction: grade gold, expire overdue `open` tasks (pending votes ->
  `expired`, provisional rewards confirmed then clawed back, net 0), then consensus.
- Loader/settle/migrate log only `e.name` and the driver `code`, never `e.message`.
- Excerpt limit default is 300 chars (`V1_MAX_EXCERPT_CHARS`); Amex evidence stays capped at 200.

### Notes
- **Balances can go negative**: a clawback is appended after the reward was already confirmed and possibly spent;
  the ledger never blocks it. Spending checks (`balance >= cost`) simply fail until the agent earns credits again.
- **Migration order**: `sources_whitelist.dispatchable` is added in 0002, after 0001 created the table with
  `DEFAULT false`, so any row inserted before 0002 becomes non-dispatchable until the loader re-runs.
- **x-forwarded-for**: registration rate limiting trusts the first `x-forwarded-for` hop. That is correct behind
  Vercel (which sets it); behind any other proxy the header is client-controlled and the limit is advisory only.
