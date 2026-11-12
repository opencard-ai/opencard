# Manual synthetic runner candidate — not deployed/cut over

## Versioned runtime, no machine-private credential lookup

`python3 scripts/offer-watch/sandbox-launch.py --fixtures --out /absolute/external/new-summary-dir`

Requires locked npm dependencies (`npm ci --ignore-scripts`), Python3 and Git. The draft follows existing repo workflows targeting Node24. Initial acceptance ran Node20.19.2; subsequent independent Node24.22.2 acceptance used an official checksum-verified archive, a fresh checkout copy, separate npm ci --ignore-scripts dependencies (no shared node_modules/symlinks), the versioned fixture launcher, offer/automation/news tests, validation and the real website build. This remains local Linux acceptance, NOT GitHub Actions. SDK credentials are external environment injection, never private-file lookup by the versioned runner. The fixed Python entrypoint launches only the repository TypeScript runner, with a fresh HOME/minimal environment and literal credential redaction. It does not read ~/.openclaw, a browser profile, local credentials files, `.env`, or arbitrary user commands. The TypeScript runner reuses `acceptance-fixture.ts`, also used by actual linked-worktree tests, and the real `runSandboxDaily` stages. Temporary repos/cards are SYNTHETIC. Actual npm subprocesses run inert fixture scripts, not website validation. All remote Git/GitHub/Vercel/offer-source calls are ALWAYS MOCKED; there is no CLI option enabling production publication.

Fixture mode uses the explicit mock Redis transport and never calls Upstash. SDK mode requires ALL of `--sdk --confirm-sandbox --namespace <8..40lowercase-alphanumeric/hyphen>` and externally injected `OPENCARD_SANDBOX_DATABASE_ID`, `OPENCARD_SANDBOX_URL`, `OPENCARD_SANDBOX_TOKEN`. ID and URL are pinned (SHA-256 only; no literal id in the repo) to the separately authorized free test DB; only sandbox-manual-* prefixes are generated. Token/URL are never CLI arguments or artifacts. There is NO file fallback. New approved credentials would have to be injected by a separately authorized cloud environment; a private file on this box is NOT cloud configuration. This patch creates no GitHub secrets/environments/permissions.

Use a fresh namespace for a new acceptance session; same-slot resume is tested between two fresh worktrees/runners within the session. It does not claim cross-process recovery of the mocked GitHub service. Preexisting output paths fail closed; only `result.json` is intended for upload. Source artifact/state/credentials/key/log directories must never be uploaded wholesale. No production state is mixed into cards PRs.

## Workflow DRAFT ONLY

`docs/operations/offer-sandbox-workflow.yml` is outside `.github/workflows`: manual-only workflow_dispatch, contents:read, pinned existing action SHAs, Node24, locked dependencies with lifecycle scripts disabled, fixture-only run, one summary artifact. No schedule, SDK token, production secret, user shell input, owner write, publish/PR/merge/deploy step, or pull_request_target. It has NOT been installed, dispatched or verified on Actions. Local Linux execution is not clean GitHub runner acceptance.

## Hardened launcher rerun evidence

The previously hardened repo-external launcher reran actual SDK smoke, full daily/two-runner/same-slot, real lease expiry, journal/claim, encrypted restore/new-session-fence2, and actual source/copy claim readback successfully on fresh r2 namespaces. Old V3/V4 bundles and results remain immutable. A subsequent actual SDK run through this VERSIONED launcher/runner also used synthetic inputs, real Upstash, two real linked worktrees and mocked remote publishing. Host-side private credential retrieval was test setup ONLY; the runtime above needs only explicit injected environment. No claim of production or Actions acceptance.

## Public RSS source finding / compatibility

At the read-only check, configured `/category/banking/page/1/feed/` redirected to `/category/banking/feed/` (200, valid841byte RSS, zero items). `/category/banking/` returned404. The main feed was200/15rawitems. Both banking feed variants had the same body hash. Therefore the empty result is present upstream, not parser dropping items; it is NOT proof of banking coverage. No guessed replacement or source-list switch was made.

`fetchRSS(...,{requireItems:true})` is an opt-in source-health guard, tested against a valid HTTP200empty channel. Default remains false for legacy compatibility; production source list and legacy behavior are unchanged. Strict read-only acceptance rejects the configured empty feed. Resolving/approving a valid banking source remains a promotion gate.

## Issuer browser evidence is not parser promotion

Public browser observations supplied by the parent (2026-11-07 18:59 PT) are versioned as an offline public fixture. Chase browser offer was visible; Citi/Amex direct welcome values were blank, never zero/new offer. AA/Hilton partner values are explicit alternative evidence, not direct parser parity. Quote-only replay through unchanged source patterns is not raw-DOM acceptance; all missing fields remain unaccepted/manual review, tested via existing hold-only apply gate. Hilton extra Free Night Reward and2027-01-13 expiry must not be lost or inferred from another variant. No card values, sources, model keys or production state changed.

Still pending: real issuer extraction/browser parity, live-model provider/key/spend approval, valid banking-source coverage, real Actions runner, production restricted credentials/state/backup operations, real GitHub/Vercel receipts and controlled cutover. Mac old patch/new preflight remains a cutover blocker. No merge/schedule/Mac change is authorized here. PR60–63 from other workstreams are not this migration's results.


## Draft PR / promotion remains blocked
This is stacked on PR59, not a production cutover. PR59 daily publication requires new explicit flags and github-actions owner/epoch; merging without a separately authorized coordinated Mac cutover can stop the old daily wrapper. Do not promote/merge this stack or change owner/schedules until controlled switch authorization. No cloud durable production namespace, live model/source parity, production restore rehearsal or Actions execution is accepted here.

### Registered manual Actions options (read-only inventory, 2026-11-07 PT)
Main registers `.github/workflows/news-isolated-dry-run.yml` (ID410081668). Future explicitly authorized `gh workflow run news-isolated-dry-run.yml --ref bot/opencard-durable-runner-prep -f slot=morning` would select this branch's existing news shadow fixture workflow (contents:read, fixed fixture RSS/provider) and automation tests; no secrets required. It does **not** run the new offer95 suite or offer launcher, and has NOT been dispatched. Main also registers validate-cards.yml with manual trigger; its npm test is not offer-watch:test.
The new offer-sandbox-workflow.yml remains in docs/operations, not registered. It cannot be dispatched as-is. A future separately reviewed change must either register this new manual-only file on default branch, or add fixture-only offer steps to the existing registered news workflow on an explicitly selected review ref. Only then approve dispatch. Do not add production credentials, SDK secret inputs, schedules, or owner writes to fixture Actions. Real SDK Actions would separately require secure external test-only credential injection; local private files are not cloud configuration.
Main has independently advanced while this stack remains on PR59; no rebase/main merge was performed. Reconcile package.json scripts and the shared news workflow during future stack integration without overwriting independent data/news.json updates.

### Final endpoint pin acceptance
After replacing endpoint plaintext with an exact SHA256 pin, the final runtime sources were exercised again with real SDK double-runner daily, same-slot resume, real TTL-expiry rejection, journal/claim and synthetic AES snapshot interruption/resume/independent namespace restore. A second double-runner SDK run used the independent Node24.22.2 checkout and its own npm-ci dependencies. The versioned launcher never reads a local credential file; an external authorized host supplied test-only environment variables for these local acceptance sessions. Every remote publication/source fetch remained mocked. No true service failover/OS-crash recovery, live model/issuer collection, production durability or Actions acceptance is claimed.
