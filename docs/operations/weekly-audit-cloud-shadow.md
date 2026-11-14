# Weekly data audit — cloud shadow (read-only)

Workflow: `.github/workflows/weekly-audit-shadow.yml`. Shadow of the Mac mini job "OpenCard weekly data audit"
(Mondays 10:47 America/Los_Angeles). **Not a cutover**: the Mac job stays the production owner.

## What it does
- Runs `npm run -s audit:weekly` (official-source `url-check` + `db-audit`) on `ubuntu-24.04`.
- `OPENCARD_AUDIT_DIR` (ported from draft PR #64) points report history to runner temp, seeded with the
  committed `artifacts/audit` baseline, so the checkout's `artifacts/audit` is never written.
- Read-only: `permissions: contents: read`, checkout without persisted credentials, no secrets, no Redis,
  no commit/push/deploy/email. A guard step fails the job if `data/cards` or `artifacts/audit` changed.
- Triggers: `workflow_dispatch` (only after the file exists on `main`) and `pull_request` touching this
  workflow or the compare script. **No schedule.** GitHub ignored `timezone:` in this repo, so any future
  schedule must be explicit UTC with a PT comment (e.g. `2 19 * * 1` = Mon 11:02 PST).

## Artifact
`weekly-audit-shadow-<PT date>-<run id>`: `D-url-check.json`, `D-db-audit.json`, `D-db-audit.md`,
`shadow-summary.txt`.

## Comparing with the Mac output
The printed summary only lists findings new versus the baseline, and the cloud baseline (committed report)
is older than the Mac's latest report, so compare the full finding sets of the same PT date instead:

```bash
npx tsx scripts/audit/shadow-compare.ts --cloud <artifact>/D-db-audit.json --mac <mac>/D-db-audit.json
```

It uses the same finding key as `weekly.ts` and reports `both / only cloud / only mac` per severity.
`url-check` differences usually mean an issuer site answered the runner IP differently (403/429 = bot-blocked,
counted as blocked, not broken).

## Known limits
- No durable cross-week baseline in the cloud (PR #64's sandbox-Redis baseline needs secrets/environment and is
  out of scope); "new findings" are relative to the committed baseline only.
