# Offer watcher — cloud shadow (dry-run)

Workflow: `.github/workflows/offer-watch-shadow.yml`. Shadow of the Mac mini job "OpenCard daily offer watcher"
(11:30 America/Los_Angeles). **Not a cutover**: the Mac job stays the production owner.

## What it does
- Runs `scripts/offer-watch/daily.ts --dry-run --skip-pull --today <PT date>` on `ubuntu-24.04` with the
  preinstalled Google Chrome (`OFFER_WATCH_CHROME=/usr/bin/google-chrome`) for `render: true` sources.
- Dry-run means: collect (two fetches per official source) → review (ledger read-only) → apply plan without
  `--apply` → no publish. No ledger/history/daily-state writes, no card edits, no git push, no Vercel, no email.
- `permissions: contents: read`, checkout without persisted credentials, no secrets referenced.
- A guard step fails the job if `data/cards` changed or any ledger/history/apply output was written.
- Triggers: `workflow_dispatch` (only after the file exists on `main`) and `pull_request` touching this
  workflow or the compare script. **No schedule.** GitHub ignored `timezone:` in this repo, so any future
  schedule must be explicit UTC with a PT comment (e.g. `45 19 * * *` = 11:45 PST).

## Artifact
`offer-watch-shadow-<PT date>-<run id>`: `candidates-D.json`, `review-D.json`, `apply-D.dry.json`,
`daily-D.log`, `shadow-summary-D.txt` (and `digest-D.md` when requested).

## Comparing with the Mac output of the same PT date
The cloud ledger is empty, so the printed summary will list holds the Mac already notified; compare the
data files instead:

```bash
npx tsx scripts/offer-watch/shadow-compare.ts \
  --cloud <artifact>/candidates-D.json --mac <mac>/candidates-D.json \
  --cloud-plan <artifact>/apply-D.dry.json --mac-plan <mac>/apply-D.json
```

Statuses: `match` (same extracted fields), `values_differ`, `fetch_gap` (one side had zero successful fetches,
e.g. an issuer blocking datacenter IPs), `cloud_only` / `mac_only`. The plan section lists apply/hold/expiry
decisions present on only one side. Collection runs at different minutes, so live page changes between the
two runs can cause real differences.

## Known limits
- Issuer sites may rate-limit or block GitHub-hosted runner IPs; that shows up as `fetch_gap`.
- The Monday digest in the cloud only sees this run's local history (empty), so it is a format preview only.
- Durable ledger/state and the guarded publisher (draft PRs #59/#65) are out of scope here.
