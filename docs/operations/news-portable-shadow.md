# Portable news pipeline — shadow and guarded cloud publication

The portable runner shares the legacy RSS/translation pipeline. The production
workflow is `.github/workflows/news-cloud-publish.yml`; its scheduled runs are
serialized by concurrency group `news-publish`. Local acceptance uses injected
GitHub/Vercel readers and writers, with no live publication.

## Executable paths now implemented

- `sync-news.mjs` exports `runNewsSync`: the existing normal Doctor of Credit
  feeds, RSS cutoff/dedup/sort/cache and translation pipeline are shared by the
  legacy CLI and new runner. Importing it has no env/file/network side effects.
- Existing `node scripts/sync-news.mjs` remains a legacy direct entrypoint with
  its `.env.local` loading and atomic `data/news.json` replacement. This env loader
  is **not** used by shadow. Legacy translation compatibility is retained:
  rejected/timed-out/invalid responses and missing translation rows fall back to
  English titles/empty summaries, retryable on a later run. Partial successful
  rows are retained; strict count/summary validation is opt-in for the new provider
  path. As in the original code, an absent model key itself still aborts. Non-ENOENT
  env-file read errors now fail explicitly. Merging this refactor later **will**
  affect the Mac wrapper that fetches latest main and runs this entrypoint; it is
  not an unwired change. Symlink entrypoints are covered by mocked-network tests.
- `news-provider.mjs` supplies the actual MiniMax-M2.7 HTTP adapter with explicit
  credential/fetch/deadline injection. It consumes the whole JSON response within
  its deadline, validates each translation index/title/summary, and reports only
  generic errors, never keys or upstream response bodies. There is no live-model
  fallback from fixture translation.
- `news-shadow.mjs` reads `data/news.json` from an explicit local git commit, not
  a possibly dirty working file, then calls **the same real `runNewsSync`**.
  Repo path, source SHA, clock, slot, attempt and scratch root are explicit;
  output is always a fresh private directory, never arbitrary production paths.
- `news-publish-cli.mjs` is the fixed publication entrypoint used by the cloud
  workflow. It requires publish + production-enable flags, matching owner epoch,
  fresh remote authority, and unchanged main. Its stdout is machine JSON; errors
  contain only an allowlisted reason code and stderr uses static messages.

## Safe local / clean-runner shadow acceptance

Use Node **24**, matching the repository's validate/card-updates workflows.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:automation
npm run news:shadow -- --repo "$PWD" --sha "$(git rev-parse HEAD)" \
  --now 2026-11-06T20:00:00Z --slot morning --run-id comparison-1 \
  --source fixture --provider fixture
```

Optional `--scratch-root` must refer to an existing directory outside the repo;
its realpath is checked. The runner creates a new private child directory and
writes only `plan.json` and `proposed.json`. It does not read `.env`, write
`data/news.json`/production state, change refs, install dependencies, open PRs,
merge, deploy or send mail. It reads git via `rev-parse` and `show` only. The tests
also exercise it from a separate clean CWD with network forbidden and env-file
reads blocked.

`--source public` selects the normal RSS sources. `--provider minimax` selects
the live adapter, consuming only explicitly injected `MINIMAX_API_KEY` from the
process environment, not an env file. Those are implemented paths, **not paths
executed in this PR's acceptance tests**. Keep fixture/fixture for no-cost testing.
All RSS/provider calls in tests are local/mocked; keys in tests are synthetic.

The separate isolated dry-run workflow remains manual and read-only. The cloud
publish workflow uses the existing UTC schedule and `news-production` environment;
its token permissions remain `contents: read`. It invokes public RSS + MiniMax
planning, publication, a bounded 15-minute checks wait, and same-plan reconciliation.
The job timeout is 40 minutes to cover the checks and deployment windows. No
workflow dispatch or production API call is needed for local acceptance.

`slotKey = news:<America/Los_Angeles date>:<morning|evening>`;
`sourceSha` is separate metadata, so a main change cannot create a second slot.
`runKey` adds the attempt ID. The morning and evening jobs do not dedup against
one another. Timestamp, source SHA and fixture/provider inputs must match for a
meaningful comparison. This is now actual shared-path validation, but it still
is **not** live Mac-output parity or an approved cutover test.

## Portable publication code and gates

The writer requires all of:

1. Explicit manual publish and production-enable parameters, plus owner epoch.
2. A freshly queried official GitHub contents response for
   `ops/runner-owner.json` on remote main. The *proposed* contract is version 1,
   with `news.owner = github-actions`, `news.productionEnabled = true`, and the
   matching `news.epoch`. No such file is created/modified by this PR; missing,
   unavailable, malformed or denied authority blocks before a worktree is created.
3. Current remote main SHA must still equal the plan source SHA. A stale plan
   fails closed and requires regeneration, not a silent rebase of old news.

The CLI requires a Vercel read credential. Slot identity is a deterministic
`bot/news-sync/<24 hex hash>` branch, stable across main SHA changes. A merged
same-slot PR returns `SLOT_ALREADY_PUBLISHED` successfully, including when closed
superseded attempts exist in that slot's history. A closed unmerged attempt with
no remote branch is ignored; orphan remote branches are never overwritten.

A fresh phase-1 create run preflights **all** open `bot/news-sync/*` PRs. At most
three may be superseded, and each must have the exact hashed branch format,
base main, OPEN state, non-draft and same-repository identity, bot login
`opencard-ai`, exactly `data/news.json`, and exactly one commit with bot author
email `opencard@opencardai.com`. Any ineligible PR or excess count stops before
any close. Eligible PRs are closed with a slot explanation and branch deletion,
never merged; fresh news is regenerated from current main. Authority/base are
rechecked before each close and CLOSED is verified afterward. The workflow's
serialized runs ensure these are earlier finished/failed jobs, not active jobs.
The `superseded` number array is included in successful/pending publication JSON
and the workflow summary.

The writer refuses orphan branches, creates a clean temporary worktree, writes
only `data/news.json`, checks one commit and author, and pushes a new slot branch.
Authority/base reads repeat before push, PR creation, and merge. PR creation uses
the validated GitHub PR URL from stdout, with up to five head-list reads separated
by two seconds if the URL is unavailable. Known initial PR-view not-found errors
receive the same bounded retry; known initial checks-not-found responses mean
pending. Other GitHub failures stop with a sanitized reason.

Merge gates require exactly one commit with the bot author email, same repository
when reported, exact expected head, main base, non-draft OPEN state, and only the
news file. Required checks are `validate` + `gitleaks`, and **all** reported checks
must be SUCCESS/pass. Both PR metadata and checks are freshly read again before
merge. The command uses `--squash --delete-branch --match-head-commit <sha>
--author-email opencard@opencardai.com`, followed by a confirmed MERGED receipt.
No force push, direct-main push, or `--auto` is used.

Pending checks produce exit 75 with the PR identity. The workflow waits up to
15 minutes and invokes phase 2 with the exact same artifacts and
`--reconcile-existing true`. Reconciliation checks the open PR's news blob hash
against the proposal, and never supersedes a PR. Failed/unknown checks and any
changed guard stop for review. Fresh scheduled phase 1 can supersede eligible
leftover PRs. `NO_CHANGE`, `SLOT_ALREADY_PUBLISHED`, and any `SUPERSEDED` terminal
result are success paths without a checks wait or phase 2; normal superseding
continues on to create fresh news in the same invocation.

After merge, read-only observation allows **eight minutes**, polling every ten
seconds with request deadlines and an attempt cap. Verification requires all of:
Vercel commit status success for the exact merge SHA; official GET `/v7/deployments`
showing name/project `opencard`, team slug `opencard-ais-projects`, production target,
exact `meta.githubCommitSha`, and READY; and deep equality of the public
`/en/api/daily-digest?lang=en` JSON with the localized proposal. Preview, wrong SHA,
building, and mismatching live payloads never verify. Transient GitHub/Vercel/live
read failures are retried until the deadline. Vercel status failure/error ends
observation immediately with `deployment_failed`.

`observeNewsDeployment` preserves its `VERIFIED`/`UNCONFIRMED` string API;
`observeNewsDeploymentDetailed` also returns a sanitized reason and attempt count.
Publication JSON exposes `deploymentReason`, while thrown failures become
`{state:"FAILED",reason:"<allowlisted code>"}` without raw stderr or credentials.
A full-window timeout remains nonzero with reason `timeout`: the PR is already
**MERGED**, deployment is unverified, and this does **not** block the next scheduled
run. No rollback is attempted. Worktree cleanup runs even on failed publication;
cleanup failures also stop with a reason code.
Official API: https://vercel.com/docs/rest-api/deployments/list-deployments .

Remote owner rechecks are not a distributed lock. An in-flight old Mac job can
still write after a flag changes; use the drain/fencing/cutover protocol from
phase 1. No production enable flag should be created until that protocol is
reviewed, the Mac writer can honor it, and cutover is separately approved.

## Test coverage and remaining gates

Tests cover normal feed fetching through `runNewsSync`, dedup/cached translation,
source errors/truncation/timeouts, model HTTP/malformed/partial/network/timeout
errors, slot identity, import/env isolation, fresh-check regression, owner/base
refusal, mock branch→PR→checks→merge→deployment, pending/revoked authority,
existing-PR resume without double creation, and unconfirmed deployment outcomes.
Mock publication writes only test temporary files; no GitHub/Vercel write or live
model call is made by tests.

Still pending: real workflow dispatch acceptance (not approved here), eventual
live provider/Vercel read credential provisioning (variable names MINIMAX_API_KEY and VERCEL_TOKEN;
no values read/added), publishing identity and CI/protection behavior, owner/fencing
protocol on both sides, shadow-vs-Mac
live parity and approved cutover. News has no new private operational schema.

Next smallest offer step: replace its local patch/home-bound helper with a repo
transport using the same guarded PR gate, require the helper with no direct-main
fallback, preserve actual merge-SHA deploy and revert-PR behavior, and test with
injected ledger/history + Vercel before choosing durable private state storage.
Do not port production offer state into public artifacts. GSC, AgentMail monitor,
weekly audit/card-adaptor, independent uptime checks and Upstash backup/restore
remain separate migration work. OpenCard is **not yet fully independent of Mac**.
