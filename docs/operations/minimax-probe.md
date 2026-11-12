# Public-title MiniMax one-shot probe

This is public-code preparation only. Development and tests perform no generation.
Exactly one later hosted generation is authorized for the executor; this change
does not dispatch or approve it. No production provider changes are made, and this
is not full news pipeline validation.

The sole input title is **MiniMax M2.5 and M2.7 Model Retirement Notice**, from
<https://platform.minimax.io/docs/faq/models.md> (official heading already reviewed).
The probe does not fetch the source. It sends one native fetch POST to
`https://api.minimax.io/anthropic/v1/messages`, requesting `MiniMax-M3`, disabled
thinking, `service_tier: standard`, `stream: false`, and `max_tokens: 256`.
The user message contains only that literal title; the fixed system instruction
requires a single-field JSON object containing a Traditional Chinese `title`.
There are no tools, SDK, retries, fallbacks, second locale, arbitrary inputs, input
token caps, or dollar cap guarantees.

The CLI is disabled unless invoked with exactly `--execute-once`. It takes the key
only from runtime `MINIMAX_API_KEY`, and uses the fixed absolute external scratch
path `$RUNNER_TEMP/minimax-probe-once`. No credential files or env files are read.
Do not pass a key on the command line. Missing configuration fails before HTTP.
The key is used only in the outbound authentication header, never public headers,
logs, errors, or evidence.

Before the POST, the probe creates a mode-700 private directory and a mode-600
`attempt.ledger` using exclusive `wx`, then syncs the claim. Reusing that ledger
refuses before HTTP, including after request errors, HTTP refusal, redirects, or
timeouts. Fetch uses `redirect: error`. A 120,000 ms deadline covers fetch and body
consumption, including a fetch implementation that ignores abort. Failed requests
are attempts, not permission to retry. Do not remove or replace a ledger to retry.
The ledger contains only a fixed claim marker. No bodies or raw responses are saved.

On success only, mode-600 `result.json` contains the fixed public source/title,
requested limits, validated actual returned model, `stop_reason: end_turn`,
allowlisted nonnegative safe-integer usage fields when present, and the translated
title. Unknown usage fields are discarded; invalid known usage fields are refused.
Returned `output_tokens > 256` fails closed without a result; this validation
cannot prevent or undo an already charged overrun. `max_tokens: 256` is a request,
not a guaranteed accepted-output or billing cap. Input usage above 256 is allowed.
Missing output fields, truncation, other models, thinking/tool blocks, malformed
JSON, extra translation fields, secret echoes, and unsafe title characters fail
closed. Latin text is limited to exactly one each of `MiniMax`, `M2.5`, `M2.7`;
remaining characters are Han, allowlisted punctuation, digits, and spaces.
Human review must still confirm the meaning and Traditional Chinese wording;
character validation does not establish semantic correctness. Every failure emits
only a fixed local message, never upstream errors, response bodies, or headers.

For the one later hosted execution, the executor must dispatch the existing
**News portable isolated shadow** manual workflow exactly once on
`bot/opencard-durable-runner-prep` in `opencard-ai/opencard`, with the exact reviewed
40-character lowercase commit SHA, `minimax_probe: true`, and `sdk_sandbox: false`.
Do not dispatch SDK or source/model fixtures using the real key. The new dedicated
job requires fixture job success, the unchanged protected environment
`opencard-migration-sandbox`, repository/ref/event assertions, matching checkout
SHA, and run attempt `1` before the secret-bearing execution step. Keep the
environment protections in force. The existing fixture behavior and 142-test
acceptance counts remain unchanged. Permissions remain inherited `contents: read`.

The job uses pinned checkout without persisted credentials and pinned setup-node
with Node 24. It runs the offline tests first without secrets or npm installation.
Only its single CLI execution step receives the existing repository secret
`MINIMAX_API_KEY`; do not retrieve its value. Only successful `result.json` is
uploaded by the pinned artifact action, under one artifact name. No ledger,
request, raw response, or key is uploaded. A failed probe skips upload and produces
no success summary.

This is not an exactly-once guarantee across fresh workflow runs: a new scratch
directory permits another attempt. Executor discipline (exactly one dispatch),
the workflow attempt-1 guard, and protected-environment controls are external
constraints. Do not rerun or create a second dispatch after an ambiguous outcome.

Offline verification (fake fetch and fake deadline timers only):

```sh
node --test scripts/automation/minimax-probe.check.mjs
git diff --check
```

These tests neither validate live API compatibility nor make a live generation.
