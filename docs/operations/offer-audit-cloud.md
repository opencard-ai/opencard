# Offer watcher and weekly audit in Actions

Phase 1 implements the [state and notify design](offer-audit-state-and-notify-design.md):
`offer-watch-cloud.yml` and `weekly-audit-cloud.yml` read `ops-state`, compute in runner temp,
validate and back up state, optionally commit it, then call the existing reusable `ops-notify.yml`.
The offer command hardcodes `--no-publish --state-dir … --skip-pull`; it records holds without editing cards.
There is no publishing path in these workflows. Audit uses `OPENCARD_AUDIT_DIR` and
`OPENCARD_AUDIT_TODAY`. The PT date is computed once per run and passed throughout.

## Ownership and mode

For non-PR events, the owner document is fetched from **main**, independently of the checkout.
PR checkout ownership is never authoritative. Failure to fetch or parse the document means shadow.

| Condition | Mode | State write | Mail |
|---|---|---|---|
| PR (same-repo only; fork jobs skipped) | shadow | no | no |
| Non-main ref | shadow | no | no |
| Missing/invalid document or version other than 1 | shadow | no | no |
| Owner other than `github-actions` or `productionEnabled` other than `true` | shadow | no | no |
| Epoch differs from workflow expected epoch | shadow | no | no |
| Dispatch with `force_shadow` | shadow | no | no |
| Non-PR main + version 1 + cloud owner + enabled + matching epoch | write | validated state only | after a new successful state commit |

This change keeps `offer` and `audit` owned by `mac`, with `productionEnabled: false` and
`offer-20261115-1` / `audit-20261115-1` epochs. **After merge, schedules run shadow-with-state only.**
They help finish design §5 comparisons: at least three offer days and one to two Mondays. They read the
production baseline but save their changes only in artifacts; shadow days do not advance that baseline.
News ownership is unchanged.

A separate tiny PR changes only the offer/audit blocks in `ops/runner-owner.json` to
`owner: "github-actions"`, `productionEnabled: true`, keeping the epochs unchanged. Merge it only after
Mac jobs are disabled and the final read-only export has re-seeded `ops-state`.
Follow the [draft cutover runbook](offer-audit-cutover-runbook.md); this change performs no cutover.

## State integrity and write semantics

`scripts/ops-state/owner.mjs` decides mode. `pull.mjs` checks that `MANIFEST.json` is a regular file,
verifies **every** listed file's SHA-256 and size, and refuses symlinks, traversal, duplicates and empty
manifests. It copies only the three offer files, or audit reports strictly earlier than today.
The snapshot is a single SHA read from `ops-state`; fetch is anonymous, persisted credentials are refused,
and the computation checkout's push URL is disabled. A pristine copy is retained for comparison.

Computation has a read-only repository assertion. State staging validates regular files, file names,
JSON and every nonempty JSONL line. Offer state consists of `ledger.json`, `history.jsonl`,
`daily-state.json`; audit output names are today's `db-audit.json`, `db-audit.md`, `url-check.json`.
The comparison and logs accompany the state artifact, retained for 30 days as the design A3 backup.
The separate summary artifact contains only `summary.txt` for notification.

Only `commit-state` has `contents: write`. It checks out scripts from main and a fresh `ops-state`
checkout with credentials for its normal push. It repeats the main/non-PR/write/compute-success/state-ready gates.
Immediately before calling `commit.mjs`, it fetches the owner document from main again with
`GH_TOKEN: github.token` and runs `owner.mjs` with the same epoch, event and ref. Any result other
than write aborts the job (exit 1) without a commit.
`commit.mjs` first skips a run ID already recorded in HEAD's manifest, even with an old base SHA.
For a new run ID it refuses a HEAD differing from the run's base SHA (exit 3), and pushes **fast-forward only**
with no retry or rebase. A rejected push exits 4 with “ops-state moved concurrently; state not written;
investigate” plus the git error with HTTP(S) URL credentials stripped. Workflow concurrency is keyed
by `github.ref` for every event. Offer and audit have separate state concurrency groups; if they overlap on the same branch,
one may fail safely and needs investigation rather than an automatic merge.

Each new run records exactly one commit, even if only the run record changes:
`state(offer-watch): <PT date> run <id> attempt <n>` or
`state(weekly-audit): <PT date> run <id> attempt <n>`.
`MANIFEST.runs.<offer|audit>` stores `last_run_id`, `last_run_attempt`, `pt_date`, `writer_epoch`, `base_sha`.
Manifest entries are sorted, unknown fields are retained, and Mac provenance fields are dropped only
when that file's content changes. JSON is formatted with two spaces and a trailing newline.
A repeated run ID, including a retry with the old base SHA, prints `already committed`, emits `committed=false, skipped=true`,
and creates no commit. State rollback uses a **new commit** restoring earlier files and their manifest;
never rewrite branch history or force-push.

## Failure and notification

State is staged only after the computation step succeeds, and `commit-state` also requires
`daily_ok == 'true'`. On computation failure there is no state commit and no AgentMail
(send requires `committed=true`); the final `verdict` job fails, triggering GitHub's failed-run email.
The Mac relays failure text; cloud relies on the failed-run email instead in phase 1. Failure summaries
and logs remain available in artifacts and the run summary. Integrity, checkout assertion, upload or
state-push failures block writes/mail as appropriate. Invalid or missing staged state never permits mail.
Comparison is diagnostic and may fail on incomplete computation output; its logs remain in the run.

`notify` calls the existing reusable workflow with `contents: read` and explicitly passes only the existing
`AGENTMAIL_API_KEY`, `AGENTMAIL_FROM_INBOX`, `OWNER_EMAIL` names, with empty values on PR events. It sends only when the state commit
output is `committed=true`, on non-PR main in write mode. Shadows get sanitized previews only.
The existing notify CLI treats `NO_REPLY`, `DURABLE:NO_REPLY`, and empty summaries as silence.
A missing stdout file is replaced with a visible computation-failure/status summary before upload.

If mail fails **after a successful commit**, use **Re-run failed jobs** to retry notify using the successful
commit job's original outputs. Downstream artifact names use `needs.run.outputs.attempt`, the
producer's attempt, so failed-job retries can still download the original state and summary artifacts.
A **full workflow re-run** reads the committed run ID and skips the state
commit and sending; it does not resend. This phase uses that run-ID gate rather than the design's proposed
two-commit pending/notified journal. A crash after the provider accepts mail can still duplicate on a
notify-only retry; inspect delivery before retrying an ambiguous failure. A different future run does not
automatically resend an earlier failure summary.

## Schedule and DST

GitHub ignores `timezone:` in this repo; schedules are explicit UTC, effective only after merge to the
default branch. GitHub may delay scheduled runs.

| Job | UTC cron now | PT until 2027-03-14 | DST change |
|---|---|---|---|
| Offer | `39 19 * * *` | daily 11:39 PST | change to `39 18 * * *` on 2027-03-14 to keep 11:39 PDT; back on 2027-11-07 |
| Audit | `47 18 * * 1` | Monday 10:47 PST | change to `47 17 * * 1` on 2027-03-14 to keep 10:47 PDT; back on 2027-11-07 |

Without the DST edits, they fire at 12:39 PDT and Monday 11:47 PDT. The Mac offer job `8272895b`
runs around 11:30–11:39 PT and audit `c524f0d3` runs Monday 10:47 PT. Ownership prevents two
production writers while the Mac remains enabled. Rollback is to revert the owner PR (cloud returns to
shadow on its next mode check) and `openclaw cron enable` the Mac jobs after checking any in-flight cloud run.

## Phase 2 and superseded drafts

Publishing via #59 is outside this change and requires separate approval. When combined with #97,
#59's publisher preflight must become `!dryRun && !noPublish`. Its journal must live in `ops-state`;
its publishing secrets belong in a protected environment. No phase 2 secrets are added here.

Superseded drafts: #90 and #91 (dry-run shadows, functionality replaced); #94 (design), #96 (ops-notify),
#97 (no-publish/state-dir), #103 (shadow-with-state) are included in this branch's implementation lineage.
