# offer-watch

Read-only review tooling for welcome-offer changes. Nothing here sends messages or edits `data/cards`.

| Command | What it does |
|---|---|
| `npm run offer-watch:expiry` | Deterministic expiry check on committed card data. Normalizes `welcome_offer.expires / expires_at / elevated_until / expiry_date` into one date (earliest wins, conflicts listed), and reports `expired`, `expiring_soon` (≤14 days), and `focus` (15–30 days). `priority: high` = still `is_elevated` or limited-time; `low` = already marked expired and non-elevated. Options: `--today YYYY-MM-DD`, `--warn-days`, `--focus-days`, `--worktree`, `--out <file>`. |
| `npm run offer-watch:review -- <candidates.json> [--ledger] [--write] [--out <file>]` | Gates `Candidate[]` against HEAD card data. Tracked fields: `annual_fee`, `annual_fee_description`, `welcome_offer.{bonus_points, bonus_value, cash_bonus, statement_credit, travel_credit, spending_requirement, time_period_months, free_nights, free_night_value_cap, is_elevated, normal_bonus_points, offer_status, expiry}`. Numeric strings (`"$1,000"`, `"100k"`) equal numbers; cosmetic fields (`last_verified`, `last_updated`, `notes`, `confidence`, `next_review`, `source_conflicts`) are ignored. `official: true` only counts when the URL host is on `official-domains.json`; otherwise the result is `needs_verification`. |
| `npm run offer-watch:test` | Unit tests for the gate, dedup ledger, expiry and domain allowlist. |
| `npm run offer-watch:archive-pending [-- --write]` | Moves pending card-update artifacts with no changes, cosmetic-only changes, or duplicate substantive deltas (newest kept) into `artifacts/card-updates/archived/` (logged in `ARCHIVE_LOG.jsonl`). Dry run without `--write`. Then run `npm run artifact:index`. |
| `npm run adaptor:prune-runs [-- --days 14] [-- --delete]` | Retention for `data/adaptor/runs`. Dry run lists run dirs older than N days; `--delete` removes them. |

## Dedup ledger

`--ledger [path]` (default `artifacts/offer-watch/ledger.json`, gitignored) keys each change by
`sha256(card_id + field + normalized new value + audience)`; the evidence URL and check time are excluded, so the
same change seen on a different page is not re-notified. Entries keep `first_seen`, `last_seen`, `last_notified`,
`status`. A result notifies when it is actionable and any key is new, never notified, or its status changed.
The ledger is only written with `--write`; default mode is read-only.
