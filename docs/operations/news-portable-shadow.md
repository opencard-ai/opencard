# Portable news pipeline — implementation, still no production cutover

This change is stacked on phase-1 PR #57. It connects the **actual**
`scripts/sync-news.mjs` / `news-sync-core.mjs` pipeline to a portable runner;
it is not another fixture-only alternative implementation. No Mac task, owner
file, permission, secret, schedule or production environment has been changed.
No live RSS/model/publishing run has been performed in this work.

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
- `news-publish-cli.mjs` is a separate, fixed repo entrypoint for eventual manual
  publication. It invokes the implemented `publishPortableNews`, not an arbitrary
  helper/command path. It is absent from all workflows and is disabled without
  explicit manual publish + production-enable flags and owner epoch **and** fresh
  remote production authority. It has not been executed in this work.

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

The workflow remains `workflow_dispatch` only, fixed fixture/fixture, with
`contents: read`, no persisted checkout credential, no secret reference, no
publishing step and no schedule. It uses Node 24 and full commit-SHA pins resolved
from the official actions checkout/setup-node/upload-artifact v4 refs. No workflow
was dispatched by this implementation. Synthetic output artifacts expire in 7 days.

`slotKey = news:<America/Los_Angeles date>:<morning|evening>`;
`sourceSha` is separate metadata, so a main change cannot create a second slot.
`runKey` adds the attempt ID. The morning and evening jobs do not dedup against
one another. Timestamp, source SHA and fixture/provider inputs must match for a
meaningful comparison. This is now actual shared-path validation, but it still
is **not** live Mac-output parity or an approved cutover test.

## Portable publication code and gates (mock-tested, NOT enabled)

The writer requires all of:

1. Explicit manual publish and production-enable parameters, plus owner epoch.
2. A freshly queried official GitHub contents response for
   `ops/runner-owner.json` on remote main. The *proposed* contract is version 1,
   with `news.owner = github-actions`, `news.productionEnabled = true`, and the
   matching `news.epoch`. No such file is created/modified by this PR; missing,
   unavailable, malformed or denied authority blocks before a worktree is created.
3. Current remote main SHA must still equal the plan source SHA. A stale plan
   fails closed and requires regeneration, not a silent rebase of old news.

A Vercel read-only credential is also required by the manual CLI before any writes;
no value is provided, read, created or provisioned in this work. Once authorized, the real code checks deterministic slot branch/PR dedup (stable across source SHA changes) and no
other open news PR, refuses an orphan remote branch, makes a clean temporary
worktree, writes **only** `data/news.json`, checks one commit and author, pushes a
new `bot/news-sync/<slot hash>` branch and creates a PR. No home paths,
node_modules symlinks or Mac script are needed. Gate reads repeat before push,
PR creation and merge. No force push, direct-main push or auto-merge is used.

The actual required check list is explicitly `validate` + `gitleaks`, and *all*
reported checks must be explicit SUCCESS/pass. Checks are re-read after the
fresh PR/head read, rather than reusing old success. Empty/unknown/pending/failed/
cancelled states or API errors stop. The merge command is SHA-bound and requires
a confirmed MERGED receipt. GitHub branch protections still enforce check/base
rules at the final merge boundary; these reads alone cannot eliminate all races.

There is deliberately **no long-lived poller**: if new PR checks are pending,
the command stops and leaves the PR open. A later explicit manual invocation
with the same plan and `--reconcile-existing true` can resume that exact open PR
without pushing/creating again, only after verifying its head news blob equals
the plan's proposed hash and rechecking authority/checks. Without that parameter,
an existing slot returns reconciliation-required, not success. Orphan branches,
closed PRs, uncertain merges, changed main and changed payloads require operator
reconciliation; they are never blindly replayed. This is not yet an unattended
scheduler/queue. CI-trigger behavior of the eventual publishing identity still
needs authorization and acceptance before replacing the Mac wrapper.

After a confirmed merge, bounded read-only polling checks the **actual merge SHA**'s
GitHub Vercel status plus official GET `/v7/deployments` (project, production target,
exact meta.githubCommitSha, READY), then the public
`/en/api/daily-digest?lang=en` JSON against the proposal. Preview/other SHA/building
records cannot count as success. Default polling is bounded to two minutes with
request deadlines and an attempt cap. Pending status, API failure, timeout, newer
live content or mismatch return UNCONFIRMED, and the CLI returns **nonzero** with
an explicit reconciliation/no-rollback message. No deployment or automatic
rollback is issued; existing GitHub→Vercel integration may deploy a real merge.
Temporary generated worktrees are removed in finally (including failed runs);
cleanup failure is itself nonzero and requires reconciliation before retry.
Official API: https://vercel.com/docs/rest-api/deployments/list-deployments .
No real merge or authenticated Vercel request was performed.

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
protocol on both sides, autonomous bounded reconcile scheduling, shadow-vs-Mac
live parity and approved cutover. News has no new private operational schema.

Next smallest offer step: replace its local patch/home-bound helper with a repo
transport using the same guarded PR gate, require the helper with no direct-main
fallback, preserve actual merge-SHA deploy and revert-PR behavior, and test with
injected ledger/history + Vercel before choosing durable private state storage.
Do not port production offer state into public artifacts. GSC, AgentMail monitor,
weekly audit/card-adaptor, independent uptime checks and Upstash backup/restore
remain separate migration work. OpenCard is **not yet fully independent of Mac**.
