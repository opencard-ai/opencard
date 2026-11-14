# Offer watcher `--no-publish` (hold-only) mode

Implements the code change in PR #94 design §6 phase 1 / §7 item 4. **Not wired into any workflow, no schedule.**
The Mac job stays the production owner; nothing here publishes, deploys, sends mail or writes `ops-state`.

## Behaviour
`npm run -s offer-watch:daily -- --no-publish [--state-dir DIR] [--skip-pull] [--today D]`
- collect → `review --ledger <ledger> --write` (ledger persisted, as in a normal run)
  → `apply --record-holds --out artifacts/offer-watch/apply-D.nopublish.json` → **no publish** → digest on Mondays.
- `apply --record-holds` never writes `data/cards`. Every change that passes all guards and would be auto-applied
  is recorded as a hold with reason `no_publish_mode` (`可自動套用，但目前為不發布模式`) next to the normal holds and
  expiry reviews: ledger status `needs_verification`, history events `held` / `expiry_review` (never `applied`/
  `published`). The plan keeps `would_apply` (changes + sources) for review. Ledger keys equal the keys an applied
  change would use, so dedupe carries over to the publish phase.
- `daily-state.json` (fetch-failure dedupe) is written; the summary lists new holds / failures, or `NO_REPLY`.

## How publishing is gated off
1. The publish step requires `!dryRun && !noPublish`; `--no-publish` maps apply to `--record-holds`, never `--apply`.
2. `apply.ts` refuses `--apply` together with `--record-holds`, and `--record-holds` without `--out`.
3. Guard: a content hash of `data/cards` (file names + bytes) is taken right before apply (after any `git pull`) and
   compared after; any change fails the run (exit 1). Use `--skip-pull` in the cloud.
4. `--dry-run` and `--no-publish` are mutually exclusive (exit 2, before any lock/artifact).
5. `--state-dir` is only accepted with `--dry-run`/`--no-publish` and must exist (publish.ts keeps default paths).

## Relation to other PRs
- **#59 (PR-only publisher):** independent of this branch. #59 adds a preflight that refuses non-dry runs without
  a provisioned publisher; when #59 is rebased onto this change its preflight condition must become
  `if (!dryRun && !noPublish)` so hold-only runs do not require the publisher (phase 2 then enables publishing).
- **#90 (offer shadow workflow):** unchanged; it keeps `--dry-run`. A later workflow change would switch to
  `--no-publish --state-dir <ops-state checkout>` for the "shadow with state" phase.
- **#96 (notify) / ops-state writer:** not used here. The shadow-with-state phase (design §5.3) needs the Mac seed
  (§7 item 3) and the ops-state pull/push script; those are separate steps.
