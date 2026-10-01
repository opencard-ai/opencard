# offer-watch

Welcome-offer monitoring for `data/cards`. `review` and `expiry` are read-only. `apply` edits card files only when every guard
passes, and `publish` commits, pushes, deploys and live-checks them, reverting automatically on failure. Nothing here sends messages.

| Command | What it does |
|---|---|
| `npm run offer-watch:expiry` | Deterministic expiry check on committed card data. Normalizes `welcome_offer.expires / expires_at / elevated_until / expiry_date` into one date (earliest wins, conflicts listed), and reports `expired`, `expiring_soon` (≤14 days), and `focus` (15–30 days). `priority: high` = still `is_elevated` or limited-time; `low` = already marked expired and non-elevated. Options: `--today YYYY-MM-DD`, `--warn-days`, `--focus-days`, `--worktree`, `--out <file>`. |
| `npm run offer-watch:review -- <candidates.json> [--ledger] [--write] [--out <file>]` | Gates `Candidate[]` against HEAD card data. Tracked fields: `annual_fee`, `annual_fee_description`, `welcome_offer.{bonus_points, bonus_value, cash_bonus, statement_credit, travel_credit, spending_requirement, time_period_months, free_nights, free_night_value_cap, is_elevated, normal_bonus_points, offer_status, expiry}`. Numeric strings (`"$1,000"`, `"100k"`) equal numbers; cosmetic fields (`last_verified`, `last_updated`, `notes`, `confidence`, `next_review`, `source_conflicts`) are ignored. `official: true` only counts when the URL host is on `official-domains.json`; otherwise the result is `needs_verification`. |
| `npm run offer-watch:collect [-- --card <id>] [-- --out <file>]` | Fetches every source in `watchlist.json` **twice** (plain HTTP, or system Chrome for `render: true` pages), extracts values with the listed regexes and writes `Candidate[]` including every fetch as a `confirmation`. Default output `artifacts/offer-watch/candidates-<date>.json`. |
| `npm run offer-watch:apply -- --report <review.json> [--apply] [--out <file>]` | Turns a review report into a card-edit plan (dry run without `--apply`). Guards are listed below. With `--apply` it writes the card JSON, runs `validate-all` (restoring the files if it fails), writes the plan (default `artifacts/offer-watch/apply-<ts>.json`) and records `applied`/`held` in the ledger and `history.jsonl`. |
| `npm run offer-watch:publish -- --plan <apply.json> [--dry-run]` | Must be on `main`. Runs `npm run validate`, the offer-watch tests, the repo unit tests and `npm run build`; if any fail, it restores the card files and makes no commit. Otherwise it makes **one commit per card** (the message lists old→new values and the official URLs), pushes (on rejection it runs `pull --rebase --autostash` and retries; it never force-pushes), waits for the Vercel production deployment of that SHA to reach Ready (20 min timeout), then fetches `https://opencardai.com/en/cards/<id>` until it shows the new bonus, spend, months and fee strings (10 min). If the deploy errors, times out or the live check fails, it runs `git revert` on its commits and pushes the revert. |
| `npm run offer-watch:digest [-- --today YYYY-MM-DD]` | Weekly Traditional Chinese summary (under 1800 characters) of the last 7 days: auto-applied changes, items held awaiting official confirmation, and failures/rollbacks. Saved to `artifacts/offer-watch/digest-<date>.md` and printed; it is not sent anywhere. |
| `npm run -s offer-watch:daily [-- --dry-run] [-- --digest]` | The whole daily loop in one command. See "Daily loop" below. |
| `npm run offer-watch:test` | Unit tests: gate/ledger/expiry/allowlist (`gate.test.ts`) and collect/apply guards/expiry revert/publish rollback with mocked git+Vercel/digest (`pipeline.test.ts`). |
| `npm run offer-watch:archive-pending [-- --write]` | Moves pending card-update artifacts with no changes, cosmetic-only changes, or duplicate substantive deltas (newest kept) into `artifacts/card-updates/archived/` (logged in `ARCHIVE_LOG.jsonl`). Dry run without `--write`. Then run `npm run artifact:index`. |
| `npm run adaptor:prune-runs [-- --days 14] [-- --delete]` | Retention for `data/adaptor/runs`. Dry run lists run dirs older than N days; `--delete` removes them. |

## Dedup ledger

`--ledger [path]` (default `artifacts/offer-watch/ledger.json`, gitignored) keys each change by
`sha256(card_id + field + normalized new value + audience)`; the evidence URL and check time are excluded, so the
same change seen on a different page is not re-notified. Entries keep `first_seen`, `last_seen`, `last_notified`,
`status`. A result notifies when it is actionable and any key is new, never notified, or its status changed.
The ledger is only written with `--write`; default mode is read-only.

## Auto-apply guards (`apply-core.ts`)

A change is applied only if **all** of these hold. Otherwise it is held as `needs_verification` in the ledger and appears in the digest.

- The review decision is `review_delta`, so `needs_verification`, conflicts, new products, non-public audiences and unknown fields are always held.
- At least **2 independent successful fetches** (distinct `fetch_id`s) from hosts on `official-domains.json`, checked within 24 h, show the same value. No official fetch may show a different value, and none may be ambiguous (several different matches on one page).
- Sanity checks:
  - bonus change under 3x in either direction;
  - annual fee between $0 and $1,500 and under a 2x change;
  - spend between $1 and $100,000;
  - months between 1 and 24;
  - a new expiry must be a valid future date;
  - an expiry is cleared only by the expiry path.
  
  A candidate's `explicit_confirmations: ["<field>"]` overrides only the jump checks.
- The card file has no uncommitted local edits.
- The patched card must pass the schema check and `validate-all`.

Expired elevated offers:
- If the official pages were fetched successfully and no longer show the old bonus, `is_elevated` is set to false.
- If a new offer is confirmed as above, the expiry is also cleared and `offer_status` is set to `public`.
- Otherwise `offer_status` is set to `expired_review_required` and the card is listed for review.
- If the fetch failed, the old offer is still shown, or the card isn't in `watchlist.json`, nothing is changed and the card is listed for review.

## Watchlist (`watchlist.json`)

19 focus cards:
- CSR
- Citi AAdvantage Executive
- the four Hilton cards
- Marriott Brilliant and Bevy
- Spark Cash and Spark Cash Plus
- Morgan Stanley Platinum
- the six Delta Amex cards
- Bilt Palladium
- U.S. Bank Altitude Reserve (hold-only)

Each card lists official issuer or co-brand pages (hilton.com, marriott.com and delta.com are used next to americanexpress.com, since Amex pages are sometimes throttled), each with card-specific regexes.
- `render: true` pages load in system Chrome and poll until all of that source's regexes match (25 s cap).
- A fetch fails if it returns an issuer error or bot page, or redirects to a different page.
- Requests to the same host are spaced 3 s apart.
- `hold_only: true` entries are fetched as evidence but never applied.
- Optional add-ons (statement credit, free night, "Offer ends") are optional regex groups, so the same pattern matches both "X points plus a $Y statement credit" and points-only wording.
  - `absent: { "welcome_offer.statement_credit": null }` records "no credit" when the pattern matched without the credit group. It's not a failed match.
  - An officially confirmed `null` for `statement_credit`, `travel_credit`, `free_nights` or `free_night_value_cap` passes the sanity check, and applying it deletes the key from the card.
  - An optional expiry that isn't shown is simply not extracted. Expiry changes still go through the expiry path.
  - Free-night wording on Hilton is accepted but not extracted, because the cards keep it only in `description`.
- Tracking query strings are stripped from redirect errors, so a hold whose redirect URL only differs by `?sid=…` isn't reported as new.

Cards that `review.ts --expiry` flags as expired or expiring within 30 days, and that aren't on the watchlist, are added automatically by `collect.ts` as hold-only entries using the official URLs in their own `sources`. They need a real extractor before anything can be applied.

When an elevated offer expires, the card is reverted only if an official page's extractor actually reads a different offer. A page that loads but can't be parsed goes to review. An offer is expired only once its date has passed (`days_left < 0`), so an offer that ends today is left alone today.

## Daily loop

For cron, one command:

```bash
cd ~/.openclaw/workspace/opencard && npm run -s offer-watch:daily
# or: ~/.openclaw/workspace/opencard/scripts/offer-watch/daily.sh
```

It runs `git pull --ff-only` → `collect` → `review --ledger --write` → `apply --apply` → `publish` (only if something was applied) → `digest` (Mondays PT) using the PT date. Details:
- **Lock:** `artifacts/offer-watch/daily.lock`. A second run while one is active prints `NO_REPLY` and exits 0. A lock left by a dead process is reclaimed.
- **Log:** all step output goes to `artifacts/offer-watch/daily-<date>.log`.
- **Output:** stdout is only a Traditional Chinese summary (under 1800 characters) of **new** items: changes published, holds that are new or whose reasons changed (compared with the ledger), failures and rollbacks, and cards whose official fetches all failed for the first time. On Mondays the weekly digest is added. If nothing is new, it prints `NO_REPLY`.
- **Exit code:** 1 if any step failed; the summary is still printed.
- `--dry-run` fetches and plans without writing the ledger or cards and without publishing.
- Typical run: about 5–8 min with nothing to publish, plus about 5–10 min when it publishes (build + Vercel + live check).

The same steps by hand:

```bash
cd ~/.openclaw/workspace/opencard
git pull --ff-only
D=$(TZ=America/Los_Angeles date +%F)
npx tsx scripts/offer-watch/collect.ts --out artifacts/offer-watch/candidates-$D.json
npx tsx scripts/offer-watch/review.ts artifacts/offer-watch/candidates-$D.json --worktree --ledger --write --out artifacts/offer-watch/review-$D.json
npx tsx scripts/offer-watch/apply.ts --report artifacts/offer-watch/review-$D.json --apply --out artifacts/offer-watch/apply-$D.json
npx tsx scripts/offer-watch/publish.ts --plan artifacts/offer-watch/apply-$D.json
```

State files (all gitignored): `ledger.json`, `history.jsonl`, `daily-state.json`, `daily.lock`, and the per-day `candidates-*`, `review-*`, `apply-*`, `digest-*` and `daily-*.log` files.
