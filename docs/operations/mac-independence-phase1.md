# OpenCard Mac independence — phase 1 preparation, NOT a migration

Follow-up: [portable real-news shadow implementation](news-portable-shadow.md)
connects the actual news core and adds a gated portable writer. The phase-1
status below is historical; Mac production and offer cutover remain unperformed.

Status: **review only / no production cutover**. This PR adds an isolated news
fixture runner and testable publishing safety contracts. It does not change the
existing `sync-news.mjs`, offer publisher, Mac wrappers, production state, owner,
cron, protections, Vercel settings, credentials, or data allowlists. It does not
create an owner flag. Missing owner configuration cannot affect production.

## Evidence and source boundary

Read-only Mac inspection on 2026-11-06 PST identified:

- `~/.openclaw/scripts/opencard-news-sync-pr.sh`: local detached worktree,
  existing Node dependencies, public Doctor of Credit RSS, MiniMax translations,
  a news-only commit and PR, then check polling and squash merge.
- `~/.openclaw/scripts/opencard-offer-watch-pr.sh` and the local-only
  `opencard-offer-watch-publish-pr.patch`: cards-only PR helper, SHA-bound merge,
  actual merge-SHA deployment lookup and revert PR; home-bound paths and state.
- News currently accepts “no checks reported” in its fallback and can return
  after requesting auto-merge without confirming completion. Those are unsafe
  behaviors, not intended compatibility requirements.
- The offer patch replaces direct-main transport in `publish-core.ts` and
  `publish.ts`. The remote baseline checked for this PR still has legacy direct
  push/rebase/revert transport. No patch was blindly applied; no local credentials,
  environment files, logs, ledger values, user records or secrets were imported.

**Important integration gap:** new `mergeVerifiedNewsPr` and `callOfferPrHelper`
are staged library contracts, not installed replacements for either Mac wrapper.
The existing live news merge bug and legacy offer transport remain until a later
reviewed integration/cutover. This PR must not be described as fixing the current
Mac execution path. Offer integration is deliberately deferred: it must preserve
state transitions and deployment/rollback receipts and must never silently use
legacy direct-main push when the helper is absent. The staged contract fails
closed without a helper or a unique successful merge receipt; it has no push
fallback. Its tests are architecture tests, not evidence of production readiness.

## What can be run without production side effects

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:automation
npm run news:dry-run -- --now 2026-11-06T20:00:00Z --slot morning --run-id local-1
```

The CLI prints a fresh private OS temporary directory containing `plan.json` and
`proposed.json`. It accepts no arbitrary output/fixture paths. Only the bundled
synthetic fixture is read; shared `prepareNews`/RSS parsing is reused with a fixed
clock and fixture translations. No live RSS, model calls, `.env` loader, git, gh,
Vercel, browser, production ledger, notification or deployment code is imported.
No model charges or credentials are needed. This is a **fixture parity harness**,
not a simulation using current live feeds or proof that live translation works.
`npm ci` necessarily creates dependency files; the runner itself writes only its
fresh scratch. Workflow metadata (`GITHUB_OUTPUT`) and uploaded synthetic
artifacts are expected platform side effects, not production state.

The workflow is **workflow_dispatch only**, with `contents: read`, checkout
credentials disabled, no secrets, no schedule, and no write/publish/notify step.
Only a choice-valued slot is accepted, passed via a quoted environment variable;
no caller-provided shell, script, path, fixture, date or expression is executed.
It has not been dispatched as part of this work. Artifacts expire after seven
days and are test outputs, never authoritative state or backups.

Comparison identity is `news:<America/Los_Angeles day>:<morning|evening>`;
attempt identity adds the explicit run ID. Morning and evening are distinct,
not “once per day.” Reruns can compare the same slot without losing attempt
identity. These keys do **not** implement durable deduplication or a lock.

The merge contract requires nonempty explicit SUCCESS checks, a passing required
`validate`, open/non-draft/main-target PR, only `data/news.json`, and the expected
head SHA. Query errors, empty checks, cancellation, pending, neutral/skipped,
unknown states and changed heads reject. It re-reads the PR after checks and
uses `--match-head-commit`, never `--auto`, then verifies a MERGED receipt with
merge SHA. It takes an explicitly authorized injected command runner; the
fixture runner does not import it. There is no automatic retry after an
ambiguous result: reconcile GitHub state first. GitHub branch protections remain
necessary to enforce checks at merge time, including newly added/re-run checks.

## Required gates before any live writer

1. Review/merge this preparation PR separately; dispatch the read-only fixture
   workflow only with explicit approval. Compare repeated fixed inputs and both
   daily slots. Confirm artifacts and no state/PR/notification writes.
2. In a later PR, inventory remote main and actual enabled jobs through an
   authorized interface. Current cron inventory is unavailable; old files or
   historical times are not authoritative. Integrate the guarded news merge
   and port offer PR helper into the repo, removing home paths/temporary patch.
   Full offer integration needs tests for absent helper, failed/changed checks,
   merge failure/uncertainty, deployment failure, live mismatch, revert PR failure
   and actual squash merge-SHA deployment lookup. Preserve the cards-only whitelist.
3. Provision narrowly scoped official GitHub and Vercel authentication through
   the platform (not this PR). Test PR creation with the chosen identity: default
   Actions token event-suppression behavior can prevent PR CI from firing.
   Validate author/protection rules and exact required-check names.
4. Choose authoritative private state storage and backup/restore procedures.
   Offer `ledger.json`, append-only `history.jsonl` and `daily-state.json` are
   gitignored and linked from the Mac's state directory. Preserve fingerprints,
   notification dedup and pre-publish/applied/published/rollback transitions.
   Logs, source snapshots and candidate artifacts need privacy/retention review.
   Chromium/Puppeteer, Node/npm/tsx, jq, gh and Vercel CLI must be installed
   explicitly; `PUPPETEER_SKIP_DOWNLOAD=1` alone does not provide a browser.
5. Resolve owner/fencing and perform a controlled handover only after new
   explicit approval. No production schedule or Mac stop is authorized here.

## Single writer is a protocol, not a JSON flag

If `ops/runner-owner.json` is later used, **both** runners must read the newest
remote authoritative value, validate it, and fail closed on any error. A stale
checkout is not an authority. Recheck before each external write (push, PR,
merge, rollback, durable state and notifications). This still has TOCTOU windows
and cannot revoke work already in flight. Actions `concurrency` only serializes
Actions, not the Mac. A shared lease with fencing or a controlled drain/cutover
is required; changing a file alone is not an atomic no-double-write guarantee.

Cutover proposal (not executed): stop old admission, drain active jobs, inventory
open PRs/uncertain merges and pending rollbacks, reconcile receipts, freeze and
verify a versioned state snapshot, switch owner, verify one new slot end-to-end,
then approve schedules. Rollback reverses admission only after draining/reconciling
the new runner and handing its latest state back; never simply restart the old
runner against stale state or blindly revert unrelated newer card commits.

Separate state and data PRs can partially succeed. A data merge followed by state
PR failure must not reapply/re-notify next run; a state-only success must not mark
unpublished data as delivered. Use stable change fingerprints + slot/attempt IDs,
a run journal with base/head/PR/actual merge SHA/deployment receipt, CAS state
updates, and recovery that checks remote truth before replaying effects. A private
state branch is only a candidate, not an implemented transaction. Do not broaden
the news/cards data allowlists to conceal state writes. Actions cache and expiring
artifacts are not a durable ledger or a verified backup.

## Scheduling and remaining Mac dependencies

No schedule is added. GitHub now documents IANA `timezone` next to `cron`; any
future PT schedule should use `America/Los_Angeles`, not a fixed UTC hour claimed
to be PT year-round. Verify intended slot times against current jobs, DST skipped
and repeated hours, scheduler delays and rerun identity before enabling anything.
Official reference: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule

Still NOT migrated or verified here:

- Live news ingestion/translation, its Mac wrapper and guarded merge wiring.
- Offer helper/patch integration, persistent ledger/history/state, Chromium,
  actual Vercel auth, deployment health and recovery/rollback authority.
- Weekly `scripts/audit/weekly.ts` and its previous report baseline; card-adaptor
  browser backends, review/pending artifacts and approval state.
- `gsc-daily.ts` OAuth authorization, report history and cohort baseline. Tokens
  must not be committed or copied as ordinary artifacts.
- `email_monitor.py` AgentMail authorization and message-dedup state (separate
  from My Cards outbound reminder delivery); confirm whether still needed.
- Independent external uptime/failure alerts; a job that never ran cannot alert
  on its own absence. No monitoring endpoint or message is created here.
- Upstash/My Cards user-data backup, retention and isolated restore verification;
  Git/Vercel code rollback is not a Redis/user-data backup.
- Vercel reminders cron execution/delivery health, cloud environment parity,
  newest deploy after prior storage cleanup, production write permissions.

Acceptance requires an explicitly approved Mac-off observation covering both news
slots, offer daily and weekly audit, plus isolated reminder delivery testing with
separate send approval; externally observed alerts, failed-source/check/deploy
cases, idempotent recovery and a private-state restore drill. No percentage or
cost savings can be inferred from this preparation PR.
