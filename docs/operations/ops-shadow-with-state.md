# Ops shadow with state

Implements design #94 §5 step 3: run offer-watch and the weekly audit against a
pinned copy of ops-state to see what a cloud run would report with existing state.
The workflow has manual and pull-request triggers, with no schedule. Both offer
and audit jobs wait for `checks` to pass and run on matching pull requests.

## Read-only guarantees

The workflow uses `contents: read` and checkout `persist-credentials: false`,
rejects persisted HTTP credentials, and disables the checkout's push URL. It
records the remote ops-state head before the run and emits a notice if it moves
during the run. It also requires a clean whole working tree and checks that offer
state was not written to the default artifact directory.

The source is pinned to commit `9956c5c12a9a107346e237cc868032491c6c1f56`
unless an explicit 40-hex `ops_state_sha` is supplied. The fetched commit is
verified as an ancestor of `origin/ops-state` and archived into runner temp; every file listed in `MANIFEST.json` must match its
recorded size and SHA-256. Traversal and symlinked listed files or state
directories are rejected. Only manifest-listed offer state and audit reports are
copied to the working state directories in runner temp. Audit files must be dated
strictly before the run's PT date; the audit fails if today's report exists before
the weekly run. `OPENCARD_AUDIT_TODAY` pins the weekly audit to that same date.

Offer-watch runs with `--no-publish --state-dir <runner temp> --skip-pull`.
Would-apply changes become holds; cards are never edited or published. The audit
uses `OPENCARD_AUDIT_DIR` in runner temp. Both jobs perform live source checks;
results go to artifacts and the GitHub step summary, with no email or ops-state
writes.

## Comparisons and artifacts

Offer comparisons classify holds (including expiry reviews) and all-fetch-failed
cards as new or known against the seeded ledger and daily state. They split new
`no_publish_mode` holds from other holds and report ledger additions, status
changes, and appended history counts by event type.

Audit comparisons use the latest ops-state `db-audit.json` strictly before the
run's PT date. They report new, known, and resolved findings by severity, including
high/medium totals. The report shows both the `weekly.ts` key and a URL-scrubbed
key: the seed stripped URL queries/fragments, so the scrubbed key prevents those
URL differences from appearing new. With no prior baseline, notification-style
new high/medium totals are suppressed, matching the weekly audit.

Artifacts are named `ops-shadow-state-offer-<date>-<run_id>-<attempt>` and
`ops-shadow-state-audit-<date>-<run_id>-<attempt>`, retained for 30 days. They contain
the verified manifest, run summary, comparison JSON and Markdown, and available
run reports. Offer artifacts also include post-run state and candidates/review/
apply/daily outputs; audit artifacts include the day's audit and URL-check reports.
The comparison tables also appear in the workflow step summaries.

## Rerun

Until the workflow exists on the default branch, `workflow_dispatch` is unavailable.
This stacked draft PR runs through the `pull_request` trigger. Rerun an existing run:

```sh
gh run rerun <run_id> --repo opencard-ai/opencard
```

You can also re-run from the PR checks UI, or push a commit touching
`.github/workflows/ops-shadow-with-state.yml` or `scripts/ops-shadow/**`.

After the workflow file exists on `main`, dispatch the desired branch:

```sh
gh workflow run ops-shadow-with-state.yml --repo opencard-ai/opencard --ref <branch> -f run=both -f ops_state_sha=<sha|empty>
```

Replace `<sha|empty>` with a 40-hex ops-state commit, or leave the value empty
(`-f ops_state_sha=`) to select the pinned commit
`9956c5c12a9a107346e237cc868032491c6c1f56`. `run` also accepts `offer` or `audit`.
