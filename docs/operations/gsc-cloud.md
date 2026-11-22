# GSC cloud reporting

`gsc-cloud.yml` runs daily at `30 17 * * *` UTC: 09:30 America/Los_Angeles in PST and 10:30 in summer PDT. PT Monday runs also emit the weekly summary; dispatch input `force_weekly` can request it on another day. `force_shadow` disables writes for a dispatch.

Set repository secret `GSC_SERVICE_ACCOUNT_JSON` to either of these JSON shapes:

- Service account: `private_key`, `client_email` (usually `type`). The account needs read access to the Search Console property. The loader uses GoogleAuth with the read-only webmasters scope.
- Existing Mac OAuth: `client_id`, `refresh_token`, and typically `client_secret`, `redirect_uri`, `token_uri`, `scope`, `site_url`. The loader uses OAuth2 with that refresh token. `site_url` overrides the default `https://opencardai.com`.

The workflow passes the secret as an environment variable only outside PR events; no credential file is created. Empty credentials fail clearly on main. Errors never print credential documents or provider error bodies. PRs run synthetic unit tests without live GSC calls. With the cloud variable absent, local execution continues using `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, optional `GSC_REDIRECT_URI`, and `.gsc-token.json`.

Ownership starts with `productionEnabled: false`, epoch `gsc-20261121-1`, in `ops/runner-owner.json`. Shadow runs compute and upload artifacts but cannot write ops-state or send normal report mail. Write mode additionally requires verified main ownership, matching epoch, successful computation/staging, and a second main ownership check immediately before committing. State writes share the existing serialized writer and permit only one safe retry over other jobs' bot commits.

The run uses `$RUNNER_TEMP/gsc` for history, baseline and reports. `GSC_STATE_DIR` selects `history.json` and `cohort-baseline.json`; absent that env, local defaults remain `.gsc-report-history.json` and `.gsc-cohort-baseline.json` in cwd. Missing cloud history/baseline are initialized without importing Mac files.

`--out-dir <dir>` writes PT-dated `YYYY-MM-DD-daily.md` and `.json`; `--weekly` also writes `YYYY-MM-DD-weekly.md` and `.json`. The weekly files summarize the same finalized last seven days and previous period, alerts, policy cohorts, top pages and opportunities. JSON contains report metrics and an `alerts` array. History retains 30 reports. Alert exit code 1 remains available locally; the workflow accepts it only with a completed report containing alerts.

Actions artifacts `gsc-state-<run-id>-<attempt>` contain `state-out/` with the validated candidate files and `out/` with the human report. `gsc-summary-<run-id>-<attempt>` holds `summary.txt`: the alert report or `NO_REPLY` when there are no alerts. In write mode the candidate files persist at `ops-state:gsc/YYYY-MM-DD-daily.{md,json}`, optional `gsc/YYYY-MM-DD-weekly.{md,json}`, `gsc/history.json`, and `gsc/cohort-baseline.json`. The separate Monday OpenCard routine can later consume the weekly artifact or branch file. AgentMail uses ops-notify with the existing send gates; no Discord integration is added. Fixed failure summaries use the existing failure-notify path.


## Before enabling write mode

Keep the Mac job enabled until a shadow run is reviewed. Then, in a later change, set `gsc.productionEnabled` to `true` (same epoch unless a revoke is needed). Before that flip:

- Optionally seed `ops-state:gsc/cohort-baseline.json` and `gsc/history.json` from the Mac gitignored `.gsc-cohort-baseline.json` and `.gsc-report-history.json` (metrics only; never copy credential files). If they are not seeded, the first write run starts a new baseline and history, so cohort "New" will not match the Mac series.
- Widen `scripts/ops-shadow/state-core.ts` to allow `gsc/` manifest paths; otherwise `ops-shadow-with-state.yml` will reject the manifest after the first GSC write.
- Add GSC to the ops watchdog if missed-run mail should cover this job.

Keep Mac OpenClaw job `6b894994` (`30 9 * * *` PT) enabled until the secret is configured, a shadow run is reviewed, write mode is enabled in a later change, and a cloud write run succeeds. This change does not disable the Mac or enable production writes.
