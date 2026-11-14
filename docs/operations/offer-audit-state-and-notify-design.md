# Design proposal: cloud state and notifications for offer watcher + weekly audit

Status: **proposal only (draft, due before 2026-11-20).** No workflow, code, secret, environment or Mac change
is part of this document. The Mac jobs "OpenCard daily offer watcher" (8272895b, 11:30 PT daily) and
"OpenCard weekly data audit" (c524f0d3, Mon 10:47 PT) remain the production owners.

Context: the dry-run shadows (#90 offer, #91 audit) showed the cloud *computes* the same results
(11/13 offer: 49 match, 0 value differences, 2 fetch gaps where the **Mac** was blocked; audit logic equivalent
after accounting for card edits and a Node header-size fix). Two gaps remain before a cutover:
(a) durable state across runs, (b) a notification channel.

## 1. What the Mac does today (from repo code and docs)

| | Offer watcher (`scripts/offer-watch/daily.ts`, `daily.sh`) | Weekly audit (`scripts/audit/weekly.ts`) |
|---|---|---|
| State read | `artifacts/offer-watch/ledger.json` (dedupe ledger keyed by sha256(card, field, value, audience)), `history.jsonl` (append-only events: applied/held/published/rolled_back…), `daily-state.json` (last fetch failures, so only *new* failures are reported). All gitignored, local to the Mac checkout. | Most recent earlier `artifacts/audit/<date>-db-audit.json` = baseline for "new" findings. Only `2026-10-02-*` is committed; later Mac reports are Mac-only. |
| State written | Non-dry: review `--write` and apply `--apply` upsert the ledger and append history; daily writes `daily-state.json`; publish appends published/rolled_back. | `<today>-url-check.json`, `-db-audit.json`, `-db-audit.md` (first run of the day wins). |
| Locking | `artifacts/offer-watch/daily.lock` (PID, single host). | `os.tmpdir()` PID lock (single host). |
| Output / notification | stdout = Traditional Chinese summary (<1800 chars) of new changes/holds/failures, or `NO_REPLY`; Monday digest appended. Exit 1 on a failed step. | stdout = summary of NEW high/medium findings vs baseline, or `NO_REPLY`; exit 1/2 on failure. |
| Delivery | OpenClaw cron relays non-`NO_REPLY` stdout to the operator chat (channel config lives in the Mac cron store, not in the repo). Nothing in the repo sends a message. | Same. |
| Publish | Offer only: `publish.ts` (legacy direct-main transport on main; PR-only transport in draft #59). | None (read-only on card data). |

Requirements derived from this: keep the dedupe semantics (a hold/change/failure is announced once), keep the
"new vs baseline" audit semantics, preserve `NO_REPLY` = silence, single writer per job, no new paid service.

## 2. Gap (a): persistent ledger / history / daily-state and audit baseline

Data size is small (current Mac-equivalent files are tens of KB; audit report ~100 KB/week) and contains only
public card facts, official URLs and run metadata. It still must be scrubbed on seed (see §5) because the repo
is public.

### Option A1 — dedicated state branch in this repo (`ops-state`, orphan, never merged)
- Layout: `offer-watch/{ledger.json,history.jsonl,daily-state.json}`, `audit/<date>-db-audit.json` (+ md/url-check),
  `MANIFEST.json` (sha256 per file, last run id, writer epoch).
- Read: `git fetch origin ops-state` at job start into a separate worktree; copy into the paths the scripts
  already use (or set `OPENCARD_AUDIT_DIR`, already supported for audit).
- Write: one commit per run with message `state(<job>): <PT date> run <run_id> attempt <n>`, pushed
  **fast-forward only**. A rejected push = someone else wrote → job fails without retrying blindly
  (git ref update is the compare-and-swap). Concurrency group per job (`offer-watch-state`, `weekly-audit-state`)
  serializes runs.
- Cost: free. Secrets: none new — job-scoped `GITHUB_TOKEN` with `contents: write` (rulesets on `main` keep it
  from writing main; add a ruleset on `ops-state` allowing only fast-forward, no deletion — admin step,
  needs approval).
- Failure/rollback: every state version is a commit → `git revert`/reset-by-new-commit to any earlier run; the
  Mac can be re-seeded from any commit. Corrupt JSON fails the next run before any side effect.
- Idempotency: the run id in the commit message + `MANIFEST.last_run_id` lets a re-run of the same run id detect
  "already committed" and skip writes/notifications.
- Cons: public history of state (acceptable for public facts; scrub on seed); state pushes do not trigger
  workflows (GITHUB_TOKEN), which is desired.

### Option A2 — existing Upstash Redis (separate prefix/database)
- Reuse the draft contracts: offer `redis-state.ts` (#65) and audit `durable-baseline.ts` / audit-state adapter
  (#64) with EVAL-based leases, fences and CAS.
- Cost: free only if it stays on the existing free sandbox database; the **production** Upstash database holds
  My Cards user data — mixing ops state there enlarges blast radius. Production namespaces are explicitly not
  supported by the #65 contract today (code-design limit).
- Secrets (names): `OPENCARD_AUDIT_REDIS_URL`, `OPENCARD_AUDIT_REDIS_TOKEN`, `OPENCARD_SANDBOX_DATABASE_ID`
  (exist for sandbox acceptance); a production equivalent would be new.
- Failure/rollback: strongest concurrency semantics (lease + fence), but no built-in history; needs a separate
  backup (artifact or branch) to roll back. Transport uncertainty → `NeedsReconciliationError` (manual step).
- Cons: most code still unmerged (#64/#65 are large drafts), provider limits unverified for production use.

### Option A3 — Actions artifacts / cache
- Cache: evicted after 7 days unused, immutable keys, no CAS → unsuitable as authority.
- Artifacts: max 90-day retention; "latest successful run" lookup is racy and needs `actions: read`; no CAS.
- Good as a **secondary backup** of each run's state (already done for the shadows), not as the source of truth.

**Recommendation (a): A1 `ops-state` branch**, with A3 artifact upload of the post-run state as backup.
It needs no new service or secret, gives full history/rollback, and the fast-forward push is a sufficient
single-writer CAS for once-a-day / once-a-week jobs. Keep A2 as a later option if sub-daily cadence or multiple
writers are ever needed.

Code changes needed later (not in this PR): a small `scripts/ops-state/{pull,push}.mjs` (fast-forward only,
manifest check, run-id idempotency), and pointing offer-watch paths to a configurable state dir (audit already
has `OPENCARD_AUDIT_DIR`).

## 3. Gap (b): notification channel

### Option B1 — email via the existing AgentMail integration
- Already used in Actions by `card-updates.yml` → `scripts/auto-update-cards/notify.ts`.
- Secrets (names, existing repo secrets): `AGENTMAIL_API_KEY`, `AGENTMAIL_FROM_INBOX`, `OWNER_EMAIL`.
- Cost: existing service, no new spend at this volume (≤ 8 mails/week).
- Private (summaries not public), arrives on KC's phone like today's chat push.
- Idempotency: subject `[OpenCard offer-watch] <PT date> run <run_id>`; send only when stdout ≠ `NO_REPLY`;
  record `notified_run_id` in the state commit **after** a successful send. Order per run:
  compute → commit state (pending_notify) → send → commit notified. A crash between send and the final commit
  can produce at most one duplicate mail on the re-run (at-least-once, same as an OpenClaw retry).
- Failure: send error → job fails (GitHub sends the failed-workflow email to the repo owner); state keeps
  `pending_notify`, next run resends.

### Option B2 — GitHub Issue (one rolling issue per job, comment per announcement)
- Cost free; secret none (`GITHUB_TOKEN` with `issues: write`). Idempotent via a hidden `<!-- run:<id> -->`
  marker (search before commenting). GitHub notifications reach watchers by email/mobile.
- Cons: public repo → summaries are public (public data, but holds/failures expose operational detail);
  notification depends on per-user GitHub notification settings.

### Option B3 — Discord (or other chat) webhook
- Cost free; new secret `DISCORD_WEBHOOK_URL` and a new channel to create/maintain (new integration, not
  currently used by OpenCard). Simple POST, idempotency must be done by us (same run-id record as B1).

(PR-per-change is not a notification channel; it remains the **publish** mechanism of #59, see §6.)

**Recommendation (b): B1 AgentMail email**, using the existing notify path and secrets, with the GitHub step
summary + artifact as the full report and GitHub's failed-run email as the failure alarm. B2 is the fallback if
email delivery is rejected by KC. Sending real mail is an externally visible action: enabling it needs explicit
KC approval, and the secrets should move into a protected environment (e.g. `ops-notify`) only by an approved
operator.

## 4. Failure, rollback and idempotency summary

| Event | Behaviour |
|---|---|
| State branch push rejected (non-FF) | Job fails, no mail; operator inspects concurrent writer. |
| Corrupt/unknown state schema | Fail before collect/notify; restore previous commit. |
| Notification send fails | Job fails, `pending_notify` kept, next run resends (at-least-once). |
| Re-run of the same run id | Detects manifest `last_run_id`/`notified_run_id`; skips duplicate writes/mails. |
| Rollback to Mac | Freeze cloud (disable workflow), export latest `ops-state` files back to the Mac paths, re-enable Mac job. |
| Rollback of state | New commit restoring an earlier state version (never force-push). |

## 5. Migration / seed plan from the Mac

1. **Read-only export** (KC approval, no Mac edits): offer `ledger.json`, `history.jsonl`, `daily-state.json` from
   the Mac offer-watch checkout; latest Mac `artifacts/audit/<date>-db-audit.json/.md/-url-check.json`
   (e.g. 2026-11-09 or 2026-11-16). Use `ops-state.mjs export/verify` from #64 (allowlist, sha256 manifest,
   refuses secrets) and a gitleaks scan; drop any local paths/notes not needed for dedupe.
2. **Seed commit** on a new orphan `ops-state` branch (single commit, run id `seed-<date>`), reviewed by OpenCard.
3. **Shadow with state** (still no mail, no publish): cloud reads seeded state, computes summaries, writes state
   to a *shadow* path (`shadow/…`) only; compare summaries to the Mac's for ≥ 3 offer days and 1–2 Mondays.
4. **Cutover** (separate approval): disable the Mac job, take a final Mac export, re-seed if the Mac state moved
   after step 1, add `offer`/`audit` sections to `ops/runner-owner.json` with an epoch, enable state writes +
   email. First real run is a scheduled one.
5. **Rollback**: §4.

Schedules must be explicit UTC with a PT comment (GitHub ignored `timezone:` in this repo), e.g. offer
`'45 19 * * *'` (11:45 PST; DST shifts to 12:45 PDT unless adjusted), audit `'2 19 * * 1'` (Mon 11:02 PST).

## 6. How #59 (offer publish) fits

- Phase 1 (this design): collect/review/apply **hold-only + notify** in the cloud. Needs a small change so a
  non-dry run can write the ledger and announce without applying/publishing (today `--dry-run` skips ledger
  writes, and #59's preflight refuses non-dry runs without a provisioned publisher). Proposed flag: `--no-publish`
  (apply plan only, ledger/history updated with `held`, no card edits).
- Phase 2: enable #59's PR-only publisher (`--publish --production-enable --owner-epoch … --run-id … --journal-dir …`)
  once its own gates are approved. Its journal should live in the same `ops-state` branch (or be derived from it),
  and its `published`/`rolled_back` events land in the same state commit as the ledger update, so dedupe and
  publish receipts stay consistent. Secrets per #59 (names): a write token for PRs (like `NEWS_PUBLISH_TOKEN`) and
  `VERCEL_TOKEN` for deployment evidence, in a protected environment.
- #64/#65 Redis adapters remain the alternative if phase 2 needs stronger leases than a once-daily FF-push.

## 7. Decisions needed from KC

1. Approve A1 (`ops-state` branch + ruleset allowing fast-forward only) as the state store.
2. Approve B1 (AgentMail email to `OWNER_EMAIL`) as the channel, or choose B2/B3.
3. Approve the read-only Mac state export (§5.1) and its date.
4. Approve the `--no-publish` code change and the shadow-with-state phase.
