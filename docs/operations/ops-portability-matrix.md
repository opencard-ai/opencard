# Ops portability acceptance matrix (GSC / email monitor / weekly audit / card-adaptor / uptime / backups)

Status: **NOT MIGRATED.** No operation below has passed live cloud acceptance. Mac jobs remain
authoritative. This branch adds opt-in path overrides (defaults unchanged) and an incomplete
state-bundle harness only. No schedule, workflow, secret or notification was added.

| Operation | Source in repo | Done in this branch | Evidence | Remaining dependency to be portable | Status |
|---|---|---|---|---|---|
| GSC daily report | `scripts/gsc-daily.ts`, `gsc-cohorts.ts`, `gsc-api.ts` | `OPENCARD_GSC_STATE_DIR` (history+baseline) and `OPENCARD_GSC_TOKEN_PATH`; unset = original cwd paths; override dir must already exist (not auto-created) | `gsc-daily.test.ts` 2 tests (default path + override, no cwd writes) | GSC OAuth token (refresh token) + `GSC_CLIENT_ID/SECRET/REDIRECT_URI` in a cloud secret store; current `.gsc-report-history.json` and **original** `.gsc-cohort-baseline.json` exported from Mac (baseline cannot be regenerated); report delivery channel (Mac wrapper/cron prompt not in repo) | Not migrated |
| Inbound AgentMail monitor | Mac-only **untracked** `~/.openclaw/workspace/opencard/scripts/email_monitor.py` (136 lines, read with secrets redacted 2026-11-07) | Port `scripts/automation/email_monitor.py`: same GET `?limit=5`, `message_id`/`id`, top-5 state overwrite, NO_NEW/NEW_MESSAGE output and suggestions; inbox, key and state path come from env (`AGENTMAIL_INBOX_ID`, `AGENTMAIL_API_KEY_FILE`/`AGENTMAIL_API_KEY`, `OPENCARD_EMAIL_STATE_PATH`); atomic state write. Differences from the original: config errors exit 2 (was a traceback), fetch errors print only the exception type, state write is atomic | `test_email_monitor.py` 9 tests (mocked HTTP; GET only; redirects not followed; malformed state; dedup; corrupt state; HTTP 401 leaves state untouched, no key in stderr; key file) | AgentMail key in a cloud secret store; inbox id; export of the current `opencard-email-state.json` (else the first cloud run reports up to 5 messages as new); the scheduler/delivery line that relays the A/B/C prompt is not in repo (cron list unavailable) | Not migrated (no live run) |
| Weekly DB audit | `scripts/audit/weekly.ts` → `url-check.ts --official-only` → `db-audit.ts` | `OPENCARD_AUDIT_DIR` for report history/baseline (default `artifacts/audit`); test-only `OPENCARD_AUDIT_URLCHECK_FIXTURE` limited to `scripts/audit/fixtures/*.url-check.json` with `fixture:true`, and only into an existing dir outside the repo | `scripts/audit/weekly.e2e.test.mjs`: real entrypoint + real db-audit on real `data/cards`; first run gives baseline + NO_REPLY; a new high finding is reported; same-day rerun doesn't overwrite; bad fixture or target paths (incl. symlink aliases into repo) rejected; committed `artifacts/audit` unchanged. Live url-check not executed | Durable artifact baseline store (latest earlier `*-db-audit.json`); lock is os.tmpdir PID lock = single-host only, needs distributed lock on cloud; summary delivery channel | Not migrated |
| Card-adaptor | `scripts/card-adaptor/index.ts` | nothing | backends `scrapling` (`~/.venv/scrapling`), `cloakbrowser`; `approval.json` human gate | Runner image with Scrapling/cloakbrowser; anti-bot/IP behaviour from cloud unverified; human approval flow must stay | Not migrated |
| Uptime / failure alerting | **absent** | nothing | — | External monitor (independent of runner) + alert target; decision needed | Not started |
| State backups (GSC/audit files) | — | `scripts/automation/ops-state.mjs` export/verify/import (allowlist, sha256 manifest, refuses secrets, no-overwrite import, 0600) — **incomplete harness** | `ops-state.test.mjs` 6 tests | Storage location + retention; real Mac export (needs KC approval); Upstash/My Cards user-data backup is out of scope here | Harness only |

## Usage (harness)
    node scripts/automation/ops-state.mjs export --root <repo> --ops gsc,audit --out <file>
    node scripts/automation/ops-state.mjs verify --in <file>
    node scripts/automation/ops-state.mjs import --in <file> --root <target>
Credentials (`.gsc-token.json`, AgentMail key, `.env*`) are never bundled.
Import target root must be private to the operator (owner = current user, not group/other-writable); Node lacks directory-handle-relative writes, so a concurrent attacker with write access to the target is out of scope.

## Automated checks (local; manual-only workflow `.github/workflows/ops-isolated-fixture-check.yml`)
`workflow_dispatch` only, `contents: read`, pinned actions, no secrets, no schedule, no publish, no notifications. It has **not been dispatched**.
- `node --import tsx --test scripts/gsc-daily.test.ts scripts/gsc-cohorts.test.ts`
- `node --test scripts/audit/weekly.e2e.test.mjs`
- `node --test scripts/automation/ops-state.test.mjs`

## Import residual risks (accepted only as EXPERIMENTAL)
Not TOCTOU-safe against a same-uid concurrent writer. An abrupt kill can leave `*.tmp-*` files behind. Bundle hashes prove consistency, not authenticity (no signature).

## Non-sensitive Mac files needed (read-only; parent/KC to provide; no tokens/state contents)
1. ~~`email_monitor.py` source~~ obtained (redacted). Still needed: its scheduler line.
2. Cron/launchd/OpenClaw job definitions or wrapper scripts for: GSC daily, weekly audit, card-adaptor runs (command lines, working dir, env var **names** only).
3. Report delivery mechanism for GSC/audit summaries (which channel and how the wrapper sends them).
4. Card-adaptor host setup notes: Scrapling venv location/version, cloakbrowser install/version.
5. Whether any existing uptime check runs on the Mac (name and command only).
Stateful items needing separate KC approval (not read by agents): `.gsc-token.json`, AgentMail key, `opencard-email-state.json`, current `.gsc-report-history.json` / `.gsc-cohort-baseline.json`, Mac-only `artifacts/audit` reports.

Mac `~/.openclaw/scripts` contains only `opencard-news-sync-pr.sh`, `opencard-offer-watch-pr.sh`, `opencard-offer-watch-publish-pr.patch`. No GSC, audit, card-adaptor or uptime wrappers were found by name under `~/.openclaw`, `~/bin` or `~/scripts` (maxdepth 4); those jobs are presumably OpenClaw cron prompts, which cannot be read without the cron store.
