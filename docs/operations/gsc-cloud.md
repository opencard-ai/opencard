# GSC cloud reporting

`gsc-cloud.yml` runs daily at `30 17 * * *` UTC: 09:30 America/Los_Angeles in PST and 10:30 in summer PDT. PT Monday runs also emit the weekly summary; dispatch input `force_weekly` can request it on another day. `force_shadow` disables writes for a dispatch.

Set repository secret `GSC_SERVICE_ACCOUNT_JSON` to either of these JSON shapes:

- Service account: `private_key`, `client_email` (usually `type`). The account needs read access to the Search Console property. The loader uses GoogleAuth with the read-only webmasters scope.
- Existing Mac OAuth: `client_id`, `refresh_token`, and typically `client_secret`, `redirect_uri`, `token_uri`, `scope`, `site_url`. The loader uses OAuth2 with that refresh token. `site_url` overrides the default `https://opencardai.com`.

The workflow passes the secret as an environment variable only outside PR events; no credential file is created. Empty credentials fail clearly on main. Errors never print credential documents or provider error bodies. PRs run synthetic unit tests without live GSC calls. With the cloud variable absent, local execution continues using `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, optional `GSC_REDIRECT_URI`, and `.gsc-token.json`.

The cutover change sets `gsc.productionEnabled: true`, epoch `gsc-20261121-1`, in `ops/runner-owner.json`. Shadow runs compute and upload artifacts but cannot write ops-state or send normal report mail. Write mode additionally requires verified main ownership, matching epoch, successful computation/staging, and a second main ownership check immediately before committing. State writes share the existing serialized writer and permit only one safe retry over other jobs' bot commits.

The run uses `$RUNNER_TEMP/gsc` for history, baseline and reports. `GSC_STATE_DIR` selects `history.json` and `cohort-baseline.json`; absent that env, local defaults remain `.gsc-report-history.json` and `.gsc-cohort-baseline.json` in cwd. Missing cloud history/baseline are initialized without importing Mac files automatically; merge the metrics seed into ops-state before enabling production on main.

`--out-dir <dir>` writes PT-dated `YYYY-MM-DD-daily.md` and `.json`; `--weekly` also writes `YYYY-MM-DD-weekly.md` and `.json`. The weekly files summarize the same finalized last seven days and previous period, alerts, policy cohorts, top pages and opportunities. JSON contains report metrics and an `alerts` array. History retains 30 reports. Alert exit code 1 remains available locally; the workflow accepts it only with a completed report containing alerts.

Actions artifacts `gsc-state-<run-id>-<attempt>` contain `state-out/` with the validated candidate files and `out/` with the human report. `gsc-summary-<run-id>-<attempt>` holds `summary.txt`: the alert report or `NO_REPLY` when there are no alerts. In write mode the candidate files persist at `ops-state:gsc/YYYY-MM-DD-daily.{md,json}`, optional `gsc/YYYY-MM-DD-weekly.{md,json}`, `gsc/history.json`, and `gsc/cohort-baseline.json`. The separate Monday OpenCard routine can later consume the weekly artifact or branch file. AgentMail uses ops-notify with the existing send gates; no Discord integration is added. Fixed failure summaries use the existing failure-notify path.


## Cutover follow-up (2026-11-23)

The reviewed scheduled shadow run `45079083759` (November 22 PT) matches the Mac November 22 history row exactly: 6 clicks, 23,067 impressions, finalized window November 14–20, including CTR and position. No November 23 cloud run was available at review. The latest Mac row (November 23) has 7 clicks / 23,588 impressions for November 15–21; these are different windows. The cloud created a fresh cohort baseline; a small additional classification difference (4 current impressions between unknown and retained/new) remains, without changing sitewide totals. Sunday produced no weekly artifact; Monday weekly output remains to be verified.

The companion seed branch targets **ops-state**, adding only `gsc/history.json`, `gsc/cohort-baseline.json` and their MANIFEST entries. It preserves the Mac's 29 reports through November 23 byte-for-byte, including the missing November 15 and November 18 dates, and the original baseline captured at `2026-09-15T02:54:38.789Z` (79 indexable URLs). No existing GSC state was present at preparation. Merge the seed PR before the main cutover PR so the next writer starts from the Mac series. These metrics files do not belong on main.

The main cutover change enables production at the unchanged epoch `gsc-20261121-1`, allows GSC history/baseline and dated daily/weekly manifest paths in ops-shadow verification, and adds GSC to the existing watchdog notification. Offer/audit gates and schedules remain in place. GSC freshness uses successful scheduled/dispatched runs on main in the last 36 hours (24-hour cadence plus 12 hours of scheduling grace); failed, PR, future and in-progress runs do not satisfy it. The watchdog still runs at `23 15 * * *` UTC, roughly 22 hours after the preceding GSC slot at `30 17 * * *` UTC, and never starts catch-up jobs. It measures workflow success, so a forced shadow dispatch also counts; separately verify that production persisted state.

Shadow paths remain available: PRs use synthetic data and no credentials, dispatch `force_shadow` computes without writes, and a disabled/revoked owner fails closed to shadow. Artifacts retain the `state-out/` and `out/` layout described above. Successful shadow summaries cannot prove a production state write or notification.

**Keep Mac OpenClaw job `6b894994` (`30 9 * * *` PT) enabled until a successful cloud write is confirmed.** That write cannot occur from local commits: the seed must reach ops-state, the production flag must be merged into main, and the next scheduled/dispatch run must succeed with state persisted. Verify `ops-state:gsc/` daily files, MANIFEST run metadata and the Monday weekly artifacts, plus the gated notification result. Only then consider disabling the Mac job in a separate authorized operation. This follow-up leaves the Mac job enabled.
