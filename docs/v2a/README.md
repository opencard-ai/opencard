# Verify-to-Access Phase 1 (closed beta)

Implements architecture v0.2 §§0, 4–6, 8–9, 11–12. The existing `lib/v1` skeleton, `pg` DB abstraction, migrations and PGlite tests are retained. New dependencies/services: none. All V2A routes return 404 unless `V1_API_ENABLED=true`. Public HTML and `GET /api/cards` receive no V2A gating or edits.

The frozen §9.5 vote outcome list is amended by [the Phase 1 spec amendment](spec-amendment-vote-outcomes.md) to include terminal `disputed` and `expired` outcomes.

## Frozen API

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/v1/agents` | One-time `X-Invite-Code`; plaintext `ocv_live_…` key shown once, SHA-256 stored; probation grant |
| GET | `/api/v1/agents/me` | Own confirmed/pending credits, tier and reputation |
| GET | `/api/v1/cards/[card_id]` | Bearer authentication; costs exactly 1 confirmed credit; `data`, `credits`, 0–2 `verification_tasks`; insufficient credits returns 402 (configurable 403), tasks and free HTML alternative |
| POST | `/api/v1/verify` | Assigned, unexpired tasks only; verified result + evidence or `unable_to_verify` + reason; 202 with pending consensus |

Every handled response includes `X-Credits-Balance`, `X-Credits-Pending`, `X-Credits-Cost`, `X-Reputation-Tier`, `X-Tasks-Attached`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Cache-Control: no-store`. Before authentication, balance/rate headers use zero placeholders. Registration also requires the beta invite header above. No fifth endpoint or collection alias is added.

Tasks include opaque ID, card/field/type, structured instructions, official allowed sources, current value (null when blind), response schema, evidence requirements and assignment expiry. They never include gold classification/answers or other agents' identities. Welcome offers must use public logged-out product pages, never personalized/referral offers. Follow source robots/ToS notes; never bypass bot checks.

Dispatch selects gold independently at `V1_HONEYPOT_PERCENT` (10–20%, placeholder 15%) per slot. This is a sampling target over dispatches, not a guaranteed proportion in a two-task response. Keep both approved pools stocked and measure the realized ratio: a depleted selected pool yields fewer tasks without substituting another type. Probation prioritizes link checks; assignments reserve three seats, expire for reassignment, and prefer different hashed IPv4 /24 or IPv6 /64 groups. This is best effort independence, not proof of distinct operators. Forwarded addresses are trusted only behind Vercel ingress. Tasks are independent of the card being queried.

## Enable locally / deploy the beta

1. Provision the existing Neon/Postgres database. Create the non-owner `opencard_api` login separately with a generated password. Do not put credentials in commands, commits or logs.
2. On the operator's machine only, create `~/.opencard-v1-private/admin.env` with mode **600**, containing `V1_ADMIN_DATABASE_URL=<owner URL>`. The owner URL is read **only** from this file, never from process/Vercel env. Never upload this file to Vercel or copy it into the repository.
3. Run `npx tsx scripts/v1-migrate.ts`. Migrations 0001–0005 create the five frozen tables plus `consensus_suggestions`, isolated `task_gold_answers`, assignments, invites and historical scoring metadata. 0004 enforces exactly three votes, a unique suggestion per task, immutable ledger rows and network diversity metadata. Incompatible old quorum values abort migration for operator review. 0005 adds terminal disputed vote outcomes, repairs existing disputed votes, and restricts API task updates to open → quorum; the offline role retains settlement transitions.
4. Apply `db/roles/opencard_api_grants.sql` as the owner using your local DB client (after every migration). The API role cannot read gold answers, scoring metadata, migration state or suggestions, and cannot delete/truncate tables. Do not use an owner URL for the runtime. Agent contact email is insert-only for the API; no `agents` UPDATE privilege is granted. `public.v1_lock_agent(text)` is an owner-created, fixed-search-path `SECURITY DEFINER` function that only locks the matching agent row and returns its public score/tier snapshot, preserving serialized spending and vote snapshots without profile writes. Its execution is revoked from PUBLIC and granted only to the API role.

   The expected permission role is `opencard_api`. To use a differently named runtime login, create it as a non-owner with `INHERIT` and run `GRANT opencard_api TO runtime_login` as the owner, then use that login in `V1_DATABASE_URL`. The transition guard checks `pg_has_role(..., 'USAGE')`: the API role itself, logins that directly or indirectly inherit its privileges, and logins that issue `SET ROLE opencard_api` are limited to open → quorum. The settle/admin role used by `V1_ADMIN_DATABASE_URL` must not hold a USAGE grant of `opencard_api` (direct or inherited), and must not `SET ROLE` to it. On PostgreSQL 16+, a CREATEROLE owner's automatic ADMIN grant has INHERIT FALSE by default (`createrole_self_grant=''`), so it does not confer USAGE and does not block settlement. The grants script continues to target the permission role, so changing the login requires no migration edits.

   Migrations 0004 and 0005 may also be reapplied by hand, in order, as the owner; their index, column, constraint, function and trigger definitions tolerate reruns. Reapply the grants script afterward as usual.
5. Load the supplied private reference data, without copying it into git:

   ```sh
   npx tsx scripts/v1-load-gold.ts ../gold-v1.2.json ../sources-whitelist-v1.1.json
   ```

   On the first load, this seeds the whitelist and skips gold entries without regular signals. Import regular pipeline signals in step 6, then rerun this loader to create matching gold tasks. The loader requires a matching regular task for the same card/field/type, copies its blind flag, current value and approved source list, and never derives public values from a gold answer. Entries without a matching presentation or whose reference URL is outside that source list are skipped (`gold_skipped_no_template`). Both loaders use `t_<24 hex>` IDs; reload rotates legacy UUIDs too. The loader respects official/dispatchable/field restrictions and logs counts only. Changed, closed or expired gold tasks get fresh IDs; historical answers are preserved. Source withdrawal retires the task. Refresh or withdraw gold immediately when official values change; a reload does not revalidate the reference file against live sources.
6. Import regular task signals from existing audit/adaptor/scraper findings:

   ```sh
   npx tsx scripts/v1-ingest-tasks.ts /private/path/signals.json
   ```

   Input is an array with `card_id`, `field`, `type`, `origin`, `allowed_sources`, `blind`, `current_value`. Allowed origins: `url-check`, `weekly`, `db-audit`, `card-adaptor`, `scraper`, `manual`. For example (synthetic):

   ```json
   [{"card_id":"example-card","field":"annual_fee","type":"fee_check","origin":"weekly","allowed_sources":["https://issuer.example/cards/example-card"],"blind":true,"current_value":null}]
   ```

   Source must already be officially approved in the loaded whitelist. Non-null numeric/current values use the task's response schema; link current values may be the target URL. Blind tasks retain supplied current values privately for comparison but always expose null. `ingestTask` is also an importable privileged pipeline boundary. Existing production pipeline commands are unchanged; operators prepare field-level signals from their findings. Run one ingestion process at a time; duplicates of active card/field tasks are skipped. Rerun the gold loader after ingestion so both pools are populated.
7. Set runtime `V1_DATABASE_URL` to the restricted role's pooled URL; set secret `V1_INVITE_CODES` (comma-separated one-use invitations), then explicitly set `V1_API_ENABLED=true`. Leave the flag absent/off on production until ready. No admin URL belongs in Vercel.
8. Run `npx tsx scripts/v1-settle.ts` periodically **on the operator machine**. This is required for credits/reputation to settle; no privileged web route or Vercel cron is installed. Use the same policy configuration for API and operator commands. Operator scripts log counts and sanitized error classes/codes only.

## Consensus, scoring and accounting

Three verified votes from unique agents reach quorum; unable votes are retained and excluded, earn nothing and incur no reputation penalty. `votes.weight` snapshots the locked submitting agent score clamped to the placeholder reputation cap (probation starts at a low placeholder score). Consensus compares categorical answers and groups numeric answers within configured absolute tolerance, using deterministic vote submission order and representative answers. The winning weight must strictly exceed the configured confidence threshold; ties/zero weights dispute. Gold grading uses only keys supplied in the private reference answer, with its exact matching rules (link host/path normalization ignores scheme, query, fragment and trailing slash).

The offline worker grades gold only at a full three-pending-vote quorum, expires overdue open tasks of both classes without grading, and settles non-gold quorum tasks transactionally with row locks. Neither class changes rewards or reputation after only one or two votes. A malformed quorum (zero, fewer or more than three pending votes) expires with pending rewards reversed and appears in the settlement expiry counts. Agreement adjusts score, gold history adjusts accuracy/tier; trusted promotion remains manual pending policy. Disputes resolve votes to terminal `disputed` outcomes and release pending credits without penalizing reputation. Evidence summaries, support count and weighted confidence accompany suggestions. Agreement with the current value is retained as settled votes rather than a change suggestion. No code writes `data/cards/*.json`: official confirmation + human PR remains required.

The ledger is immutable even for the owner: settlement cancels a provisional reward by appending a negative **provisional** `clawback`, then appends a **confirmed** reward if correct. Pending = sum of provisional rows; spendable = sum of confirmed rows. Incorrect/expired/disputed work nets zero reward. Retries do not append duplicate settlement entries. Later operator reversals must append confirmed clawbacks; balances may become negative. The original Phase 0 provisional-to-confirmed UPDATE is disallowed by migration 0004.

## Placeholder defaults and open TBDs

**`lib/v1/config.ts` is the single policy module. TODO markers identify placeholder policy, not observed statistics or finalized product decisions.** `v1_scoring_config` is retained for historical gold provenance; tier overrides there are no longer consulted.

| Setting | Placeholder default / status |
| --- | --- |
| Initial grant / task reward | `V1_PROBATION_GRANT=20`, `V1_TASK_REWARD=1` |
| Initial score / tier policy | `initialScore=0.5`, `DEFAULT_TIER_CONFIG` in config; trusted promotion manual |
| Numeric tolerance / confidence | `V1_NUMERIC_TOLERANCE=0` (exact), `V1_CONFIDENCE_PERCENT=50` (strictly above) |
| Free quota | `V1_FREE_QUOTA=0`; disabled pending reset/economic policy |
| Reputation score cap | TBD placeholder `v1Config.reputationScoreCap = 1`; score updates clamp to [0, cap], and new vote snapshots clamp legacy out-of-range scores. Existing vote snapshots remain immutable. A bounded reputation minority can still outweigh sufficiently low scores under weighted majority. |
| Task / gold lifetime | `V1_TASK_TTL_MIN=1440`, `V1_GOLD_TTL_MIN=1440` |
| Assignment lifetime | `V1_ASSIGNMENT_TTL_MIN=60`, capped by task expiry |
| Rate limits | `V1_RATE_LIMIT_PER_MIN=60` per agent, `V1_REGISTER_LIMIT_PER_HOUR=5` per IP; per instance |
| Evidence | `V1_MAX_EXCERPT_CHARS=300`; Amex cap 200; max age 7 days, clock skew 5 minutes |
| Empty credits | `V1_INSUFFICIENT_CREDITS_STATUS=402`; accepts 403 |
| Attached tasks / optional status | `V1_MAX_TASKS_ATTACHED=2` (0–2); `V1_STATUS_CHECK_ENABLED` off |

Still open: per-field tolerance/offer interpretation, representative clustering policy for nonzero tolerance, tier/trusted thresholds, grant/reward/free quota/reset economics, timeouts, 402 vs 403, sample/priority weights and random audit policy, privacy/correlation policy, and cross-instance rate-limit storage. Evidence is structurally and source validated; missing reported numeric tokens are stored as audit concerns without automatic penalties. Excerpts/content hashes are supplied claims and still need independent reviewer checking, not proof of a fetch. No external page fetch or account service was added. Measure gold accuracy, abandonment/completion time, unable/dispute rates and maintainer acceptance/rejection without invented targets. Live source/ToS review, invitations, beta agents and measured adoption results require an operator and are not fabricated by tests.

## Verification

`node --import tsx --test tests/v1-*.test.ts` uses only in-memory PGlite and synthetic fixtures. It covers auth/invites/gating/rate limits, schema/source validation, gold isolation and scoring, bounded score snapshots, loader-level ID/blind/source parity, equal gold/regular settlement timing, API state-transition guards, dispatch reservations/blindness/expiry, weighted consensus/disputes/tolerance, immutable accounting and retry idempotency. It requires no real DB or credentials.

Repository checks: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run validate`, `npm run build`. See the implementation handoff for actual results and any inherited baseline failures.

Implementation verification (2026-11-17): full suite **167 passed**, including **43 V2A tests**; card validation, production build and scoped V2A ESLint passed. Full-repo lint remains blocked by inherited `react-hooks/set-state-in-effect` errors in `app/components/BenefitExpirationTracker.tsx:32` and `app/components/MyCardsAssistant.tsx:89`. Standalone `tsc --noEmit` remains blocked by inherited errors in `tests/ops-shadow-state.test.ts:38–39` (unknown passed as string) and `tests/url-check-referer.test.ts:5` (TS import extension). Those four files match `origin/main` exactly and were left outside this feature's scope. No checks were disabled. No live Neon migration, deployment, invited-agent trial or acceptance-rate measurement was performed.
