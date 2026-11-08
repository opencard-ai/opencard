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

## Weekly audit durable baseline + cross-runner lease (legacy PR65 compatibility)
`scripts/audit/durable-baseline.ts` retains the following PR65 compatibility helpers.
The independent adapter and fixture CLI contract below supersede these namespace limits for new audit stores.
- **PR65 interop (sandbox only):** it uses PR65's allowed `operational` document inside a dedicated audit-only prefix, `opencard:offer-state:{sandbox-audit-<id>}:`.
  - `assertAuditNamespace` rejects non-`audit-` sandbox ids, any configured offer prefix, and anything that isn't a sandbox prefix.
  - The value carries `kind: opencard-weekly-audit-baseline/v1`, so an offer `operational` doc is refused and never overwritten.
  - PR65 itself is unchanged.
- **Residual limitation:** PR65's offer adapter also accepts `sandbox-audit-*` prefixes, so the reservation is enforced only on the audit side (the offer prefix list is required). The offer runner must be configured never to use `sandbox-audit-*`; that rule can't be enforced from this branch without changing PR65.
- **Production limit:** PR65's `assertSandboxPrefix` forbids any non-sandbox prefix, so a **production audit namespace is not supported** by the current contract. This is a code-design limit, not a permission question.
- **Semantics:**
  - At most one runner holds the lease. A stale fence or an expired lease gets `LEASE_LOST`, and nothing is written.
  - A PT date that isn't a valid calendar date is refused.
  - `REPORT` means the baseline was recorded and `delivery: 'caller-must-send'`. It is **not** delivered, and there is **no exactly-once guarantee**.
  - Any CAS transport uncertainty raises `NeedsReconciliationError` (the report is not delivered); a later session observes whatever committed.
- **Tests:**
  - In repo: `scripts/audit/durable-baseline.test.ts`, 15 tests against the in-memory fake (including import CAS lost-after-commit).
  - Outside the repo (`/workspace/opencard-ops-interop`, not committed): 4 tests run **real PR65 `createRedisOfferState`** (copied from PR65 head via `git show`) over a local fakeredis Lua EVAL engine. They cover import, report and same-day suppression; keys confined to the audit prefix; BUSY and lease-expiry `LEASE_LOST`; CAS lost-after-commit and lost-before-commit both raising NeedsReconciliation; and refusal of an offer doc.
- `weekly.ts` now supports opt-in fixture-file state only; real Redis wiring remains disabled.

## Secrets / state / decisions inventory (names only; from repo source)
| Op | Secret names | Least privilege | State (rebuildable?) | Decisions needed |
|---|---|---|---|---|
| GSC daily | `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REDIRECT_URI` (optional), OAuth token file (`OPENCARD_GSC_TOKEN_PATH`, default `.gsc-token.json`) | OAuth scope `webmasters.readonly` (`gsc-api.ts:13`) for `https://opencardai.com` | `.gsc-cohort-baseline.json` **not rebuildable** (frozen membership); `.gsc-report-history.json` last 30 entries (losing it only loses history) | Delivery channel; who re-consents if the refresh token is revoked |
| AgentMail monitor | `AGENTMAIL_API_KEY_FILE` or `AGENTMAIL_API_KEY`; `AGENTMAIL_INBOX_ID` (config, not secret) | Read-only message-list key for one inbox if AgentMail supports scoping (**unverified**) | `opencard-email-state.json` = top-5 ids (rebuildable; a missing file causes one burst of up to 5 "new") | Delivery plus A/B/C approval relay (who acts on the reply); scheduler line still missing |
| Weekly audit | none (url-check is public HTTP) | `contents: read` | Earlier `*-db-audit.json` baseline (rebuildable, but "new findings" restarts); `artifacts/audit/2026-10-02-*` committed | Production audit-only Redis transport wiring or durable artifacts; delivery channel |
| Card-adaptor | none in source; `CARD_ADAPTOR_FETCH_BACKEND`, `CARD_ADAPTOR_OUT`, `CARD_ADAPTOR_URL`, `SCRAPLING_BIN` are config | network egress only | `data/adaptor/runs` evidence (gitignored; 14-day prune default in `prune-adaptor-runs.ts`); `approval.json` per run (human gate) | Runner image (Scrapling and cloakbrowser); whether cloud IPs are acceptable; reviewer identity |
| Uptime | none (not implemented) | — | — | Which external monitor and alert target (KC) |
| Backups | storage credential TBD | write-only to a backup bucket | GSC baseline/history and audit baseline bundle (`ops-state.mjs`) | Location, retention, restore drill owner |

Still missing: the OpenClaw cron definitions for GSC, audit, card-adaptor and the email monitor (`openclaw cron list` has no documented secret-safe mode).

## Minimal approval list (real permissions only)
1. Export the Mac GSC history and baseline and the latest audit reports (no tokens) using `ops-state export`.
2. Move secrets into a chosen cloud secret store: `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, the GSC refresh token, and the AgentMail key (plus `AGENTMAIL_INBOX_ID` as config).
3. Create or provision an audit-only Upstash sandbox prefix with a restricted credential. This is a new provider resource.
4. Choose the delivery channels for the GSC, audit and email summaries, and who answers the A/B/C prompt.
5. Approve a new uptime monitor service and alert target, and a backup storage location and retention.
6. Provide a redacted view of the cron prompts and schedules.

Remaining code design: production Redis transport and CLI wiring. The audit namespace and document contract are defined below.

## Audit state contract

The independent Redis adapter uses `opencard:audit-state:{sandbox-<id>}:`
(lowercase letters, digits and hyphens; id length 8–64) or
`opencard:audit-state:{production}:`. Production requires explicit
`allowProduction: true`; production wiring is not enabled anywhere. Its only
allowed document is `audit-baseline`; lease, fence and document keys stay inside
that namespace and never collide with offer-state. The Upstash client is NOT
included: callers inject an `EvalTransport`.

Leases use monotonic fences, schema 1 and versioned CAS. TTL is 1–300 seconds;
runner IDs are 1–100 ASCII letters, digits, underscores or hyphens. Transport
uncertainty permanently invalidates a session and uncertain writes require
reconciliation. Recording a report is at-most-once bookkeeping; the caller must
send it and delivery can be lost. No delivery is performed here.

Weekly CLI durable mode is fixture-only: `OPENCARD_AUDIT_DURABLE=fixture-file:<dir>`
requires the allowlisted URL-check fixture and existing state/output directories
outside the checkout. The JSON store uses atomic replacement and a per-operation
single-host lock; a crashed lock holder needs manual lock cleanup. It is not a
multi-host Redis substitute. Unset durable mode retains legacy behavior; other
store values are refused.

- File fixture store (`file-audit-store.ts`) is single-host and test-only: it uses atomic rename but no fsync (state can be lost on power failure), and stale-lock cleanup is manual. Fixture and durable runs require `TMPDIR` outside the repo. Lua/bridge tests skip in CI unless `FAKEREDIS_PYTHON` is set.
