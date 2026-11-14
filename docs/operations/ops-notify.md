# Ops notify (AgentMail) — preview by default

Implements step 2 of the PR #94 design (§3, option B1). **Not wired into any job, no schedule, sending off.**

## Pieces
- `scripts/automation/ops-notify-core.mjs`: pure helpers — `isSilent`, `sanitize`, `dedupeKey`, `buildMessage`,
  `gateSend`, `alreadySent`, `sendViaAgentMail` (injected `fetch`, same endpoint as `scripts/auto-update-cards/notify.ts`).
- `scripts/automation/ops-notify.mjs`: CLI; writes `notify-preview.md` and `notify-record.json` to `--out-dir`.
- `.github/workflows/ops-notify.yml`: reusable `workflow_call` (preview job + gated send job); `pull_request`
  runs render the committed fixture as a preview only.
- Tests: `scripts/automation/ops-notify.test.mjs` (AgentMail mocked; no network).

## Send gate (all required)
1. Caller passes `send: true` to the reusable workflow, and the run is on `refs/heads/main` (send job `if:`).
2. CLI `--send` flag **and** `OPS_NOTIFY_SEND=true`.
3. Existing secret names present: `AGENTMAIL_API_KEY`, `AGENTMAIL_FROM_INBOX`, `OWNER_EMAIL` (as in `card-updates.yml`).
   With `--send` + flag but a missing secret the CLI refuses (exit 2). Otherwise it is preview only.
The preview job references no secrets.

## Content
Only the job's stdout summary. `NO_REPLY` / `DURABLE:NO_REPLY` / empty → no message. Sanitizer: ANSI/control
chars removed; URL userinfo and sensitive query params (`token`, `key`, `sig`, `code`, `password`, `x-amz-*`…)
redacted; bearer/basic tokens, known token prefixes (GitHub, Slack, AWS, `sk-`, npm, Google, Vercel, AgentMail-style),
JWTs, private-key blocks, `*token*/*secret*/*password*/*api_key*=value` redacted; emails other than
`opencard@opencardai.com` redacted; local paths (`/Users/…`, `/home/…`, `~/…`, `/tmp/…`) replaced; 32+ char
mixed-case+digit strings redacted (lowercase hex SHAs kept); capped at 80 lines / 3000 chars. The body adds only a
validated `github.com/opencard-ai/opencard/actions/runs/<id>` link and the dedupe key.

## Idempotency / retry
Dedupe key `ops-notify:<job>:<PT date>:<run id>` (attempt excluded) in the subject/body and record.
`--sent-keys <json>` skips keys already sent; later the list comes from the `ops-state` MANIFEST.
Record statuses: `preview`, `skipped:no_reply`, `skipped:already_sent`, `refused`, `pending`, `sent`, `send_failed`
(exit 1 → next run retries; a crash after send can duplicate once = at-least-once). `--record-ops-state` is a
stub that refuses until the ops-state writer step.
