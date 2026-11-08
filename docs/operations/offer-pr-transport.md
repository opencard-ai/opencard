# Offer publisher: PR-only transport (not production cutover)

PR59 is draft. Local-only uncommitted state candidate details: [durable state readiness](offer-durable-state-local.md). No promotion/cutover is authorized.

**Promotion/merge blocker:** this changes the real `publish.ts` / `publish-core.ts`
used by `daily.ts`, not a second contract or a fixture-only publisher. Current Mac
jobs have NOT been edited. A later merge into main WILL affect wrappers fetching
latest main, and the old home-bound patch may fail to apply. Do not merge/promote
until an approved operator plan removes/replaces that patch, provisions the new
publisher, drains in-flight work, and coordinates both runners. No owner file,
credentials, schedule, workflow permission, or production card value is changed
by this PR. The news stack must be reviewed/merged independently in order.

## Actual integration

Existing `collect -> review -> apply -> publish` stays the data path. Non-dry
`daily.ts` now calls a read-only publisher preflight **before** collect/review,
apply, artifacts, or ledger writes. It fails explicitly, not with a false
"already rolled back" summary. Dry daily retains its existing artifact/log
behavior; it is NOT the fully isolated news shadow runner.

`publish.ts` imports the fixed repo `pr-transport.ts`; there is no environment
helper command, Mac path, node_modules symlink, direct main push, rebase retry,
or direct revert-push fallback. Missing helper/journal/authority/receipt refuses.
Actual publication requires **all** of:

- explicit `--publish --production-enable --owner-epoch <epoch>`;
- explicit stable `--run-id <id>` (reuse PT date + logical slot identity on retry,
  not random attempt IDs/source SHA) and `--journal-dir <absolute-private-dir>`;
- newest official GitHub contents read of `ops/runner-owner.json?ref=main` with
  proposed `{version:1, offer:{owner:"github-actions",productionEnabled:true,epoch:...}}`;
- already provisioned GitHub CLI write authorization and read-only production
  deployment evidence through `VERCEL_TOKEN`. This PR adds/reads no secret value
  and creates no owner file or GitHub/Vercel secret.

Preflight checks the explicit flags/authority and journal path policy; it does
not prove durable storage, actual write scope, model access, or cutover readiness.
The journal directory is validated again on every state access. It must be
outside the repo, private (0700), never a data PR/artifact. A missing remote owner
file is a hard refusal; no fallback to the old direct writer.

The core validates an exact planned dirty-file set, runs existing validation /
tests / build, commits one card at a time, then hands off to the fixed helper.
The helper verifies origin, current remote main = validated base, bot author,
and exact `data/cards/[A-Za-z0-9._-]+.json` set. It pushes only a deterministic
`bot/offer-watch/<run-hash>` branch and opens a main-target PR. No state is added.
Immediately before squash merge it reads head/files/checks **twice**, including
fresh checks after the fresh head. Both named `validate` and `gitleaks` plus all
reported checks must explicitly be SUCCESS/pass; empty/unknown/pending/canceled /
API failure never merge. Merge uses `--match-head-commit` and must return an
actual MERGED receipt with squash SHA. No auto-merge is requested. Pending CI
returns UNCERTAIN; explicit same-run retry reconciles the same PR (no hidden
background watcher or indefinite check polling).

Authority is re-read before each push, PR create, and merge, including rollback.
This reduces stale authority, but **is not an atomic distributed lease**. A
remote owner file alone cannot prevent TOCTOU/in-flight double writing. Production
promotion still requires draining Mac, single-writer serialization, authoritative
persistent state, and a reviewed fencing/lease design. No cloud runner is enabled
here, and the local adapter does not satisfy those cloud deployment gates.

## Deploy / rollback evidence

Use the existing official Vercel `/v7/deployments` reader with project `opencard`,
team slug, production target and actual **squash merge** SHA, not a pre-merge local
commit. Only matching production + SHA + READY can pass, followed by public card
page expected values. Polling has an attempt bound and individual HTTP timeouts.
Missing/wrong-SHA/preview evidence or unreachable pages return UNCERTAIN/nonzero,
not a successful deployment or speculative rollback.

Confirmed deployment ERROR or repeatable HTTP-200 value mismatch initiates a
revert of the actual squash SHA from current remote main. The revert is another
cards-only PR with the same fresh required checks, head matching and explicit
MERGED receipt. Its actual merge SHA must also reach production READY and old
public values must be verified before any `rolled_back` event is emitted.
Conflicts, failed revert/checks/merge, missing evidence or state failure remain
FAILED/UNCERTAIN; there is never a direct-main fallback. Rollback progress is
journaled; ambiguous/already-rolled-back runs require operator reconciliation,
not another automatic publication/revert. The helper assumes an isolated worktree;
rollback fetches/checks out remote main and leaves that worktree for the runner's
cleanup. It does not manipulate another user's checkout or create hidden worktrees.

## State and recovery (limited, not migrated)

`OfferJournalStore` is injected into the real helper. Metadata: version, stable
run ID, fingerprints, cards-only paths, phase, expected head, PR number, actual
merge SHA, deployment state and rollback receipts. No private card/offer/user
record values are copied from Mac. Fingerprint claims prevent a different run
from blindly publishing the same change. Intents are saved before external writes,
receipts after them. A remote merged PR with failed local state persistence is
reconciled by same run + trusted journal head + remote file list/receipt; it is
not pushed again. An orphan branch/PR without sufficient trusted state fails
closed for manual repair. The local state candidate delays claims until checks pass and releases only
definitely pre-push claims under a valid lease. After any attempted/ambiguous
external push, claims are not silently cleared; reconcile the original slot
rather than inventing a fresh retry identity.

The supplied private-file adapter uses exclusive fingerprint creation and atomic
journal-file replacement on **one filesystem**. It is neither a cloud durable
store, multi-file transaction, lock/fencing implementation nor backup. Private
ledger/history still use existing `state.ts`; the CLI upserts ledger and dedups
history by event type/card/merge SHA on same-run repair. Ledger+history+journal are
not one transaction; partial failures exit nonzero and require same-run reconcile.
Concurrent writers and corrupt/incomplete history repair remain promotion blockers.

**Still NOT completed:** cloud persistent state/lease/CAS/backups and restore
acceptance; actual issuer source/browser/collection parity; production Vercel/GH
permission verification; ownership handoff; migrated schedules; Mac retirement;
real-run and rollback acceptance. No Upstash adapter/write/schema or new secret.
Existing email/AgentMail, monitoring, GSC/SEO, card-adaptor/audits and backups remain
separate migration items. This PR does not claim full Mac independence.

## Verification

`npm run offer-watch:test` now includes the actual-core + actual-helper tests.
They inject mocks for every operational git/gh/Vercel/network action and use only
private temporary synthetic ledger/history/journal fixtures. Cases include absent
helper, manual/owner/enable/epoch refusal, authority/check/head changes, empty
checks, non-MERGED/lost receipts, state failure before/after external effects,
fingerprint cross-run refusal, same-run reconcile without duplicate publication,
wrong-SHA/preview production evidence, actual squash revert PR, deployment/public
mismatch, revert/deployment failure and no second rollback. These are NOT live
Mac-vs-cloud source parity or production acceptance tests.
