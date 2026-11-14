# ops-state (orphan branch — operational state only, never merged)

This branch stores the durable state of OpenCard's cloud ops jobs, per the design in
`docs/operations/offer-audit-state-and-notify-design.md` (PR #94, option A1). It shares no
history with `main` and must **never** be merged into `main` or used as a PR base.

Status: **initialised empty.** No real state has been seeded yet; no workflow reads or writes it yet.

## Layout
```
offer-watch/ledger.json        # offer dedupe ledger (sha256(card, field, value, audience) -> entry)
offer-watch/history.jsonl      # append-only offer events (applied/held/published/rolled_back/...)
offer-watch/daily-state.json   # last fetch failures (report only new failures)
audit/<date>-db-audit.json     # weekly audit reports; latest earlier one = baseline for "new" findings
audit/<date>-db-audit.md
audit/<date>-url-check.json
MANIFEST.json                  # sha256 per file, last_run_id, notified_run_id, writer epoch (created by the seed commit)
```

## Write rules
- Writers: only the approved cloud jobs (offer watcher, weekly audit) and the reviewed seed/rollback commits.
- One commit per run: `state(<job>): <PT date> run <run_id> attempt <n>`.
- **Fast-forward pushes only.** Never force-push, never delete the branch (enforced by a repository ruleset).
  A rejected push means another writer moved the branch: fail the job, do not retry blindly.
- Re-runs of the same run id must detect `MANIFEST.last_run_id` / `notified_run_id` and skip duplicate writes
  and notifications.
- Rollback = a new commit restoring an earlier state version (no history rewrite).
- Content must be public card facts and run metadata only: **no secrets, tokens, emails, local paths or
  user data.** The repository is public. Seeds from the Mac are scrubbed and verified before committing.
