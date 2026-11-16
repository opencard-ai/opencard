# Offer / audit cutover runbook — DRAFT, NOT EXECUTED

## 0. Status and approvals needed

This is a proposed operator procedure, not evidence of execution. The formal workflow PR leaves both
owners `mac` and production disabled. Obtain KC's explicit approval for disabling the Mac jobs, the final
read-only export and public state commit, the owner flip/email enablement, and any dispatch in the cutover
window. Confirm the `protect-ops-state` ruleset (fast-forward only, no deletion) is active through an approved
operator. No gateway restart, configuration rewrite or new secret is part of this procedure.

## 1. Pre-checks

- Formal workflow PR merged first; main owner blocks still say `mac` / `productionEnabled: false`.
- Today's (2026-11-16) Mac vs cloud audit comparison of new high/medium findings is clean
  (Data owns it, due by 12:30 PT), **and** at least one clean cloud offer shadow run on main
  (runs 43778604334 and 43783258485 both qualify); record run IDs, expected summaries and any
  accepted fetch differences.
  Note: the Mac offer job has not actually completed a computation since 2026-11-13, so the
  Mac-vs-cloud offer shadow comparison is no longer meaningful; criteria relaxed by the
  OpenCard lead on 2026-11-16.
- Record current `ops-state` head SHA and confirm the manifest verifies. Confirm `protect-ops-state` is active.
- Confirm existing secret names `AGENTMAIL_API_KEY`, `AGENTMAIL_FROM_INBOX`, `OWNER_EMAIL` are present;
  never print or copy their values.
- Confirm no open offer PRs from the Mac and no in-flight Mac/cloud production run.
- Choose a quiet window between runs: offer starts daily around 11:30 PT; avoid Monday 10:47 PT for audit.
  Leave enough time to disable, export, verify, re-seed and merge before the next schedule.

## 2. Read-only verification on the Mac

Use zsh. Load the gateway environment only inside subshells and never echo it:

```zsh
export PATH=/opt/homebrew/bin:$PATH
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron list )
```

Record only the id/name/schedule/enabled columns from `openclaw cron list`, never payloads/env.

Verify `8272895b` (daily offer) and `c524f0d3` (weekly audit), their schedules and enabled status. Confirm
the exact cron database path/table/schema on this Mac first, using `openclaw cron list` and the installed
store documentation if unknown. The following is a **template**, not an assumed path/table:

```zsh
sqlite3 -readonly '<confirmed cron db path>' \
  "select id,name,enabled from <confirmed cron table> where id in ('8272895b','c524f0d3');"
```

If the store is not SQLite, stop and establish the supported read-only equivalent. Do not guess a database
path, open it writable, dump configuration or expose unrelated cron payloads.

## 3. Disable the two Mac jobs (approved window only)

```zsh
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron disable 8272895b )
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron disable c524f0d3 )
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron list )
```

Record only the id/name/schedule/enabled columns from `openclaw cron list`, never payloads/env.
Repeat the confirmed `sqlite3 -readonly` query from §2 and record that both are disabled. Disabling a
schedule does not cancel an already running process: verify none remains before the export/owner flip.
**NEVER** run `openclaw gateway restart` or `gateway install --force`; never edit `openclaw.json`.

## 4. Final read-only re-seed from the Mac

Use the same copy-only procedure as the 2026-11-13 seed. Source paths:

- `~/.openclaw/state/opencard-offer-watch/{ledger.json,history.jsonl,daily-state.json}`
- `~/.openclaw/workspace/opencard/artifacts/audit/<latest dates>-db-audit.json`, corresponding
  `-db-audit.md` and `-url-check.json` reports.

Do not run the offer watcher or audit to generate a seed. Copy the files out read-only (e.g. CopyToBox) to an isolated staging
area OFF the Mac (never write on the Mac); hash each Mac source and raw copy with SHA-256 and compare before sanitizing. Keep raw copies private.
Scrub URL query strings/fragments, local paths and unneeded notes before adding anything to the public repo.
Update `MANIFEST.json` SHA-256/size and provenance against the scrubbed bytes (retain Mac source hashes and
scrubbing metadata); verify all entries. Run gitleaks and the ops-notify sanitizer: require zero unresolved
findings except explicitly documented, reviewed false positives. Review sanitizer differences as well as
scanner findings. Never include gateway.env, token values, inbox addresses or other secrets.

From a clean `ops-state` checkout at the recorded head, create one normal fast-forward commit:
`state(seed): re-seed from Mac read-only export <date>`.
Review the file list and diff before the approved normal push. If the branch moved, stop and investigate;
never force-push. Record the new head and verify the public snapshot. This runbook does not execute the seed.

## 5. Owner flip PR

The separate owner-flip PR edits `ops/runner-owner.json` offer/audit blocks:
`owner: "github-actions"`, `productionEnabled: true`, with epochs unchanged
(`offer-20261115-1`, `audit-20261115-1`). Keep news exactly as it is.

Record the offer cron decision in this PR: with the Mac disabled, keep the shadow/comparison schedule
(`9 21 * * *`, 13:09 PST / 14:09 PDT), or move back toward 11:39 PT. Include any approved schedule
edit in the owner-flip PR. To retain 13:09 PT across DST, use `9 20 * * *` from 2027-03-14 and return
to `9 21 * * *` on 2027-11-07. The later shadow schedule keeps issuer requests roughly 1.5 hours
after the Mac's ~11:30–11:39 PT run. Audit cron remains unchanged.

Merge order: formal PR first (already complete at this point), then the verified re-seed commit on
`ops-state`, then the owner PR. Before merging the owner PR, recheck both Mac jobs remain disabled and
there is no in-flight production run. The next main mode check now selects write. Do not dispatch inside
the window unless explicitly approved: the first production write is the **next scheduled run**.

## 6. First-run watch

- Confirm mode `write`, expected epoch, PT date and the exact re-seed SHA read by the run.
- Confirm hold-only offer execution (`--no-publish`) and read-only card assertion.
- Confirm one fast-forward `ops-state` commit:
  `state(offer-watch): <date> run <id> attempt 1`, or `state(weekly-audit): <date> run <id> attempt 1`.
- Confirm valid manifest, artifact backup, expected new-vs-known comparison and summary.
- Confirm mail sent once after the commit, or `NO_REPLY` silence. Confirm final verdict and compare to
  the expected Mac-equivalent outcome. Keep both Mac jobs disabled.
- A stale base or rejected push gets one safe retry only when the entire movement is verified as the other job’s normal state commits, directory changes and manifest entries. Unsafe movement or a second rejection fails for investigation; pushes never force history. A notify-only failure
  after a successful commit can use **Re-run failed jobs**. A full re-run is idempotent and does not resend.

## 7. Rollback

Revert the owner PR first so subsequent cloud checks return to shadow. The commit job rechecks main
ownership immediately before writing; still verify any in-flight cloud run has finished or is cancelled
before enabling the Mac, since a write may already have passed that check. Confirm the current state head.
Restoring Mac state from ops-state is a separate procedure requiring its own explicit approval (out of scope).
Never merge `ops-state` into main and never force-push it. State history rollback is a new restoring commit.

```zsh
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron enable 8272895b )
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron enable c524f0d3 )
( set -a; . ~/.openclaw/secrets/gateway.env >/dev/null 2>&1; set +a; openclaw cron list )
```

Repeat the confirmed read-only SQLite verification and record both enabled states. Never restart/reinstall
the gateway or edit `openclaw.json` as part of rollback.
